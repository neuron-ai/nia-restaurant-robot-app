from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
import json, sqlite3, uuid, os, time, hmac, hashlib, base64
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load local backend credentials/secrets from backend/.env before auth helpers run.
load_dotenv(Path(__file__).with_name(".env"))

DB = Path(__file__).with_name("nia.db")
def now():
    return datetime.now(timezone.utc).isoformat()
def connect():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c
def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 260_000)
    return _b64(salt) + "$" + _b64(digest)

def verify_password(password: str, stored: str) -> bool:
    try:
        salt_text, digest_text = stored.split("$", 1)
        salt = base64.urlsafe_b64decode(salt_text + "=" * (-len(salt_text) % 4))
        expected = base64.urlsafe_b64decode(digest_text + "=" * (-len(digest_text) % 4))
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 260_000)
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False
def init_db():
    with connect() as db:
        # Migrate older databases: order_id used to be UNIQUE, which incorrectly
        # prevented multiple delivery tasks for the same restaurant order.
        db.execute("""CREATE TABLE IF NOT EXISTS deliveries(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT NOT NULL,
            event_id TEXT,
            batch_id TEXT,
            tray_no INTEGER,
            table_no INTEGER NOT NULL,
            items TEXT NOT NULL,
            status TEXT NOT NULL,
            pickup_confirmed INTEGER DEFAULT 0,
            arrived INTEGER DEFAULT 0,
            handoff_confirmed INTEGER DEFAULT 0,
            station_confirmed INTEGER DEFAULT 0,
            cancelled INTEGER DEFAULT 0,
            exception TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )""")
        columns = {row["name"] for row in db.execute("PRAGMA table_info(deliveries)")}
        if "event_id" not in columns:
            # Rebuild legacy table to remove UNIQUE(order_id), preserving existing IDs and history.
            db.execute("ALTER TABLE deliveries RENAME TO deliveries_legacy")
            db.execute("""CREATE TABLE deliveries(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id TEXT NOT NULL,
                event_id TEXT,
                batch_id TEXT,
                tray_no INTEGER,
                table_no INTEGER NOT NULL,
                items TEXT NOT NULL,
                status TEXT NOT NULL,
                pickup_confirmed INTEGER DEFAULT 0,
                arrived INTEGER DEFAULT 0,
                handoff_confirmed INTEGER DEFAULT 0,
                station_confirmed INTEGER DEFAULT 0,
                cancelled INTEGER DEFAULT 0,
                exception TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )""")
            db.execute("""INSERT INTO deliveries
                (id,order_id,event_id,batch_id,tray_no,table_no,items,status,pickup_confirmed,arrived,
                 handoff_confirmed,station_confirmed,cancelled,exception,created_at,updated_at)
                SELECT id,order_id,NULL,NULL,NULL,table_no,items,status,pickup_confirmed,arrived,
                       handoff_confirmed,station_confirmed,cancelled,exception,created_at,updated_at
                FROM deliveries_legacy""")
            db.execute("DROP TABLE deliveries_legacy")
        # Add the new event ID column to rows in an already partially migrated database.
        columns = {row["name"] for row in db.execute("PRAGMA table_info(deliveries)")}
        if "event_id" not in columns:
            db.execute("ALTER TABLE deliveries ADD COLUMN event_id TEXT")
        columns = {row["name"] for row in db.execute("PRAGMA table_info(deliveries)")}
        if "batch_id" not in columns:
            db.execute("ALTER TABLE deliveries ADD COLUMN batch_id TEXT")
        if "tray_no" not in columns:
            db.execute("ALTER TABLE deliveries ADD COLUMN tray_no INTEGER")
        if "tray_numbers" not in columns:
            db.execute("ALTER TABLE deliveries ADD COLUMN tray_numbers TEXT NOT NULL DEFAULT '[]'")
        # Backfill legacy single-tray rows without changing their IDs or history.
        db.execute("UPDATE deliveries SET tray_numbers=json_array(tray_no) WHERE tray_no IS NOT NULL AND tray_numbers='[]'")
        db.execute("""CREATE TABLE IF NOT EXISTS delivery_batches(
            id TEXT PRIMARY KEY,
            mode TEXT NOT NULL CHECK(mode IN ('single','multi')),
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )""")
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_deliveries_event_id ON deliveries(event_id) WHERE event_id IS NOT NULL")
        db.execute("""CREATE TABLE IF NOT EXISTS events(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            delivery_id INTEGER NOT NULL,
            event TEXT NOT NULL,
            notes TEXT,
            created_at TEXT NOT NULL
        )""")
        db.execute("""CREATE TABLE IF NOT EXISTS robot(
            id INTEGER PRIMARY KEY CHECK(id=1),
            status TEXT NOT NULL,
            current_delivery_id INTEGER,
            location TEXT NOT NULL,
            battery INTEGER NOT NULL DEFAULT 100,
            updated_at TEXT NOT NULL
        )""")
        db.execute("INSERT OR IGNORE INTO robot VALUES(1,'docked',NULL,'staging_station',100,?)",(now(),))
        db.execute("""CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('Admin','Staff')),
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        )""")
        # Seed the first accounts from .env once. Existing database users are never overwritten.
        for env_user, env_password, env_role in (
            (os.getenv("NIA_ADMIN_USERNAME", ""), os.getenv("NIA_ADMIN_PASSWORD", ""), "Admin"),
            (os.getenv("NIA_STAFF_USERNAME", ""), os.getenv("NIA_STAFF_PASSWORD", ""), "Staff"),
        ):
            env_user = env_user.strip()
            if env_user and env_password:
                db.execute(
                    "INSERT OR IGNORE INTO users(username,password_hash,role,active,created_at) VALUES(?,?,?,?,?)",
                    (env_user, hash_password(env_password), env_role, 1, now())
                )
        db.execute("""CREATE TRIGGER IF NOT EXISTS trg_delivery_status_history
            AFTER UPDATE OF status ON deliveries
            WHEN OLD.status <> NEW.status
            BEGIN
                INSERT INTO events(delivery_id,event,notes,created_at)
                VALUES(NEW.id,'delivery_status_changed',OLD.status || ' -> ' || NEW.status,NEW.updated_at);
            END""")

@asynccontextmanager
async def lifespan(app):
    init_db()
    yield
app = FastAPI(title="NIA Restaurant Robot API", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Production authentication: configure these environment variables in the deployment secret store.
# Never commit real passwords or NIA_AUTH_SECRET to Git.
def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")
def _secret() -> bytes:
    value = os.getenv("NIA_AUTH_SECRET", "")
    if len(value) < 32:
        raise HTTPException(503, "Authentication is not configured: NIA_AUTH_SECRET must be at least 32 characters")
    return value.encode()
def _make_token(username: str, role: str) -> str:
    payload = _b64(json.dumps({"sub": username, "role": role, "exp": int(time.time()) + 8*60*60}, separators=(",", ":")).encode())
    signature = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
    return payload + "." + signature
def _read_token(token: str):
    try:
        payload, signature = token.split(".", 1)
        expected = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected): raise ValueError("bad signature")
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if int(data.get("exp", 0)) < int(time.time()) or data.get("role") not in ("Admin", "Staff"): raise ValueError("expired/invalid")
        return data
    except HTTPException: raise
    except Exception: raise HTTPException(401, "Invalid or expired access token")

class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)

@app.post("/auth/login")
def auth_login(req: LoginRequest):
    username = req.username.strip()
    with connect() as db:
        account = db.execute(
            "SELECT username,password_hash,role,active FROM users WHERE username=? COLLATE NOCASE",
            (username,)
        ).fetchone()
    if account and account["active"] and verify_password(req.password, account["password_hash"]):
        return {
            "access_token": _make_token(account["username"], account["role"]),
            "token_type": "bearer",
            "role": account["role"],
            "expires_in": 28800
        }
    raise HTTPException(401, "Invalid username or password")


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=200)
    role: str = Field(pattern="^(Admin|Staff)$")


@app.get("/auth/users")
def list_users():
    with connect() as db:
        rows = db.execute(
            "SELECT id,username,role,active,created_at FROM users ORDER BY id"
        ).fetchall()
    return {"users": [dict(row) for row in rows]}


@app.post("/auth/users", status_code=201)
def create_user(req: CreateUserRequest):
    username = req.username.strip()
    if not username or any(ch.isspace() for ch in username):
        raise HTTPException(422, "Username cannot contain spaces")
    with connect() as db:
        try:
            cur = db.execute(
                "INSERT INTO users(username,password_hash,role,active,created_at) VALUES(?,?,?,?,?)",
                (username, hash_password(req.password), req.role, 1, now())
            )
        except sqlite3.IntegrityError:
            raise HTTPException(409, "Username already exists")
        user_id = cur.lastrowid
    return {"message": f"{req.role} account created", "user": {
        "id": user_id, "username": username, "role": req.role, "active": True
    }}


@app.middleware("http")
async def enforce_role_auth(request: Request, call_next):
    path = request.url.path

    # Browser CORS preflight requests do not carry the Bearer token.
    # Let CORSMiddleware handle OPTIONS before applying authentication.
    if request.method.upper() == "OPTIONS":
        return await call_next(request)

    if path in ("/", "/health", "/auth/login", "/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc") or path.startswith("/static/"):
        return await call_next(request)
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        return JSONResponse(status_code=401, content={"detail": "Bearer access token required"})
    try:
        identity = _read_token(header.split(None, 1)[1])
    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    method = request.method.upper()
    # Only Admin users can list or create accounts.
    if path.startswith("/auth/users") and identity["role"] != "Admin":
        return JSONResponse(status_code=403, content={"detail": "Admin role required"})
    # Admin-only operational/system controls. Staff can run kitchen delivery workflow only.
    admin_only = path in ("/robot/battery", "/system/outage", "/system/recover")
    if identity["role"] != "Admin" and admin_only:
        return JSONResponse(status_code=403, content={"detail": "Admin role required"})
    if identity["role"] == "Staff" and path in ("/history", "/queue", "/batches") and method == "GET":
        return JSONResponse(status_code=403, content={"detail": "Admin role required"})
    if identity["role"] == "Staff" and path == "/ui-actions":
        return JSONResponse(status_code=403, content={"detail": "Admin role required"})
    request.state.user = identity
    return await call_next(request)



class UIActionLog(BaseModel):
    action: str = Field(min_length=1, max_length=200)
    details: dict = Field(default_factory=dict)
    timestamp: str | None = None


@app.post("/ui-actions", status_code=202)
async def log_ui_action(payload: UIActionLog, request: Request):
    """Receive frontend button/choice logs and print them in the Python terminal."""
    client = request.client.host if request.client else "Unknown"
    print("\n[NIA UI ACTION - FRONTEND]")
    print(f"Action    : {payload.action}")
    print(f"Details   : {json.dumps(payload.details, ensure_ascii=False)}")
    print(f"Timestamp : {payload.timestamp or now()}")
    print(f"Client    : {client}", flush=True)
    return {"ok": True, "message": "UI action logged"}


@app.middleware("http")
async def log_frontend_requests(request: Request, call_next):
    """Log non-GET requests; keep routine GET requests out of the console."""
    if request.method == "GET":
        return await call_next(request)

    body = await request.body()

    # Replay the body for FastAPI endpoint validation after logging it.
    async def receive():
        return {
            "type": "http.request",
            "body": body,
            "more_body": False,
        }

    request._receive = receive

    print("\n" + "=" * 60)
    print("          NIA BACKEND REQUEST LOGGER")
    print("=" * 60)
    print(f"HTTP Method : {request.method}")
    print(f"Endpoint    : {request.url.path}")
    print(f"Client      : {request.client.host if request.client else 'Unknown'}")
    print(f"Content-Type: {request.headers.get('content-type', 'Not specified')}")

    if body:
        try:
            data = json.loads(body)
            print("Received JSON variables:")
            if isinstance(data, dict):
                for key, value in data.items():
                    print(f"  {key} = {value!r} | Python type: {type(value).__name__}")
            else:
                print(f"  Value = {data!r} | Python type: {type(data).__name__}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            print("Request body is not valid JSON.")
    else:
        print("Request body: Empty")

    try:
        response = await call_next(request)
        print(f"\nResponse status: {response.status_code}")
        return response
    except Exception as exc:
        print(f"\nRequest failed: {type(exc).__name__}: {exc}")
        raise
    finally:
        print("=" * 60)
        print("          REQUEST FINISHED")
        print("=" * 60 + "\n")
class ReadyEvent(BaseModel):
    # A new event_id is required for each real new order-ready event.
    # Reuse the same event_id when retrying delivery of the same webhook.
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()), min_length=1)
    order_id: str = Field(min_length=1)
    table_number: int = Field(gt=0)
    items: list[str] = Field(min_length=1)
    source: str = "KDS"
    tray: str | None = None
class TableChange(BaseModel):
    table_number: int = Field(gt=0)
class Notes(BaseModel):
    notes: str = "Staff assistance required"
class Battery(BaseModel):
    battery_percent: int = Field(ge=0, le=100)
def parse_tray(value):
    """Accept labels such as 'Tray 3' or integer tray numbers."""
    if value is None or value == "":
        return None
    if isinstance(value, int):
        n = value
    else:
        import re
        match = re.search(r"(\d+)", str(value))
        if not match:
            raise HTTPException(422, "Tray must be a positive tray number, e.g. 'Tray 1'")
        n = int(match.group(1))
    if n < 1 or n > 20:
        raise HTTPException(422, "Tray number must be between 1 and 20")
    return n

def robot_row(db):
    return db.execute("SELECT * FROM robot WHERE id=1").fetchone()
def set_robot(db, status=None, location=None, current=Ellipsis, battery=None):
    r=robot_row(db)
    db.execute("UPDATE robot SET status=?,location=?,current_delivery_id=?,battery=?,updated_at=? WHERE id=1",
        (status or r["status"], location or r["location"], r["current_delivery_id"] if current is Ellipsis else current,
         r["battery"] if battery is None else battery, now()))
def robot_json(r):
    return {"robot_id":"NIA-01","status":r["status"],"current_delivery_id":r["current_delivery_id"],
            "location":r["location"],"battery_percent":r["battery"],"updated_at":r["updated_at"]}
def event(db, did, name, notes=None):
    db.execute("INSERT INTO events(delivery_id,event,notes,created_at) VALUES(?,?,?,?)",(did,name,notes,now()))
def delivery(did):
    with connect() as db:
        r=db.execute("SELECT * FROM deliveries WHERE id=?",(did,)).fetchone()
        if not r: raise HTTPException(404,"Delivery not found")
        ev=db.execute("SELECT event,notes,created_at FROM events WHERE delivery_id=? ORDER BY id",(did,)).fetchall()
        return {"delivery_id":r["id"],"order_id":r["order_id"],"event_id":r["event_id"],"batch_id":r["batch_id"],"tray_number":r["tray_no"],"table_number":r["table_no"],
          "items":json.loads(r["items"]),"tray_numbers":json.loads(r["tray_numbers"] or "[]"),"status":r["status"],"pickup_confirmed":bool(r["pickup_confirmed"]),
          "robot_arrived":bool(r["arrived"]),"customer_handoff_confirmed":bool(r["handoff_confirmed"]),
          "station_confirmed":bool(r["station_confirmed"]),"cancelled":bool(r["cancelled"]),
          "exception":r["exception"],"created_at":r["created_at"],"updated_at":r["updated_at"],
          "events":[{"event":e["event"],"notes":e["notes"],"time":e["created_at"]} for e in ev]}
def require_delivery(did, status=None):
    d=delivery(did)
    if status and d["status"] not in status:
        raise HTTPException(409, f"Action not allowed for delivery status: {d['status']}")
    return d
def active_robot(db,did):
    r=robot_row(db)
    if r["current_delivery_id"] != did:
        raise HTTPException(409,"Robot is assigned to another delivery")
    return r
def assign_next_queued(db):
    """Assign the oldest queued delivery when the robot is available."""
    r = robot_row(db)
    if r["current_delivery_id"] is not None:
        return None
    if r["battery"] < 20 or r["status"] in ("system_outage", "route_blocked", "low_battery"):
        return None
    row = db.execute(
        "SELECT id FROM deliveries WHERE status='queued' AND cancelled=0 ORDER BY id ASC LIMIT 1"
    ).fetchone()
    if row is None:
        return None
    did = row["id"]
    db.execute(
        "UPDATE deliveries SET status='task_created',updated_at=? WHERE id=?",
        (now(), did)
    )
    batch_row = db.execute(
            """SELECT d.batch_id,b.mode AS batch_mode
               FROM deliveries d LEFT JOIN delivery_batches b ON b.id=d.batch_id
               WHERE d.id=?""",
            (did,)
        ).fetchone()
    if batch_row and batch_row["batch_id"]:
        db.execute(
            "UPDATE delivery_batches SET status='assigned',updated_at=? WHERE id=?",
            (now(), batch_row["batch_id"])
        )
    event(db, did, "nia_task_assigned_from_queue")
    set_robot(db, "going_to_kitchen", "kitchen_pickup", did)
    return did
@app.get("/")
def home():
    return {"message":"NIA backend running","version":"2.0.0","docs":"/docs"}
@app.get("/health")
def health():
    return {"status":"ok","database":"SQLite"}
@app.get("/robot")
def get_robot():
    with connect() as db: return robot_json(robot_row(db))
@app.get("/deliveries")
def all_deliveries():
    with connect() as db: ids=[r["id"] for r in db.execute("SELECT id FROM deliveries ORDER BY id DESC")]
    return [delivery(i) for i in ids]
@app.get("/deliveries/{did}")
def one_delivery(did:int): return delivery(did)

@app.get("/deliveries/{did}/history")
def delivery_history(did:int):
    d=delivery(did)
    return {"delivery_id":did,"order_id":d["order_id"],"current_status":d["status"],"history":d["events"]}

@app.get("/history")
def all_history(limit:int=100):
    if not 1 <= limit <= 500:
        raise HTTPException(422,"limit must be between 1 and 500")
    with connect() as db:
        rows=db.execute("""SELECT e.id,e.delivery_id,d.order_id,e.event,e.notes,e.created_at
            FROM events e LEFT JOIN deliveries d ON d.id=e.delivery_id
            ORDER BY e.id DESC LIMIT ?""",(limit,)).fetchall()
    return {"history":[dict(r) for r in rows]}

@app.get("/queue")
def queue_status():
    with connect() as db:
        rows = db.execute(
            "SELECT id FROM deliveries WHERE status='queued' AND cancelled=0 ORDER BY id ASC"
        ).fetchall()
        return {
            "queued_count": len(rows),
            "delivery_ids": [row["id"] for row in rows]
        }
@app.post("/kds/food-ready")
def kds_ready(req: ReadyEvent):
    order_id = req.order_id.strip()
    items = [x.strip() for x in req.items if x.strip()]
    if not order_id or not items:
        raise HTTPException(422, "Order ID and food items are required")
    event_id = req.event_id.strip()
    if not event_id:
        raise HTTPException(422, "Event ID is required")

    with connect() as db:
        # Idempotency is based on the KDS event ID, not table number or food items.
        # Same order/table/items can legitimately create another task when event_id differs.
        existing = db.execute(
            "SELECT id FROM deliveries WHERE event_id=?", (event_id,)
        ).fetchone()
        if existing:
            did = existing["id"]
            return {
                "message": "This Food Ready event was already processed; returning its existing NIA task.",
                "duplicate": True,
                "delivery": delivery(did),
                "robot": robot_json(robot_row(db))
            }

        r = robot_row(db)
        t = now()
        can_assign_now = (
            r["current_delivery_id"] is None
            and r["battery"] >= 20
            and r["status"] not in ("system_outage", "route_blocked", "low_battery")
        )
        initial_status = "task_created" if can_assign_now else "queued"
        cur = db.execute(
            """INSERT INTO deliveries
               (order_id,event_id,table_no,items,status,tray_no,tray_numbers,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?)""",
            (order_id, event_id, req.table_number, json.dumps(items), initial_status,
             parse_tray(req.tray), json.dumps([parse_tray(req.tray)] if parse_tray(req.tray) else []), t, t)
        )
        did = cur.lastrowid
        event(db, did, "kds_food_ready_received", f"source={req.source}; event_id={event_id}")
        event(db, did, "nia_task_created")
        if can_assign_now:
            set_robot(db, "going_to_kitchen", "kitchen_pickup", did)
            event(db, did, "nia_task_assigned_to_robot")
        else:
            event(db, did, "nia_task_queued", "Robot busy or unavailable; waiting for assignment.")

    queued = initial_status == "queued"
    return {
        "message": (
            "Food Ready event received; delivery task added to queue."
            if queued else
            "Food Ready event received; a new NIA delivery task was created and assigned to kitchen pickup."
        ),
        "duplicate": False,
        "queued": queued,
        "delivery": delivery(did),
        "robot": get_robot()
    }

class BatchItem(BaseModel):
    order_id: str = Field(min_length=1, max_length=100)
    table_number: int = Field(gt=0)
    items: list[str] = Field(min_length=1)
    # New clients may assign multiple trays to one table. Legacy `tray` remains accepted.
    trays: list[str | int] = Field(default_factory=list, max_length=20)
    tray: str | int | None = None

class CreateBatch(BaseModel):
    mode: str = "multi"
    items: list[BatchItem] = Field(min_length=1, max_length=20)

@app.get("/batches")
def list_batches():
    with connect() as db:
        rows = db.execute("SELECT * FROM delivery_batches ORDER BY created_at DESC").fetchall()
    result = []
    for b in rows:
        with connect() as db:
            ids = [r["id"] for r in db.execute("SELECT id FROM deliveries WHERE batch_id=? ORDER BY id", (b["id"],))]
        result.append({"batch_id": b["id"], "mode": b["mode"], "status": b["status"],
                       "created_at": b["created_at"], "deliveries": [delivery(i) for i in ids]})
    return result

@app.post("/batches", status_code=201)
def create_batch(req: CreateBatch):
    mode = req.mode.strip().lower()
    if mode not in ("single", "multi"):
        raise HTTPException(422, "mode must be 'single' or 'multi'")
    if mode == "single" and len(req.items) != 1:
        raise HTTPException(422, "Single-task mode requires exactly one delivery")
    if mode == "multi" and len(req.items) != 3:
        raise HTTPException(422, "Three-table multi-task mode requires exactly three deliveries per trip")
    table_numbers = [item.table_number for item in req.items]
    if len(set(table_numbers)) != len(table_numbers):
        raise HTTPException(422, "Duplicate destination table: each table can appear only once per batch")
    normalized = []
    all_trays = []
    for item in req.items:
        order_id = item.order_id.strip()
        clean_items = [x.strip() for x in item.items if x.strip()]
        raw_trays = item.trays or ([item.tray] if item.tray is not None else [])
        tray_numbers = [parse_tray(t) for t in raw_trays]
        if not tray_numbers:
            raise HTTPException(422, "Assign at least one tray to every table")
        if len(set(tray_numbers)) != len(tray_numbers):
            raise HTTPException(422, f"Duplicate tray within assignment for Table {item.table_number}")
        if not order_id or not clean_items:
            raise HTTPException(422, "Every delivery needs an order ID and at least one food item")
        normalized.append((order_id, item.table_number, clean_items, tray_numbers))
        all_trays.extend(tray_numbers)
    if len(set(all_trays)) != len(all_trays):
        raise HTTPException(422, "A tray cannot be assigned to more than one table in the same batch")
    batch_id = str(uuid.uuid4())
    t = now()
    with connect() as db:
        r = robot_row(db)
        # If the robot is already executing another task, accept this batch into
        # the existing queue instead of rejecting it with HTTP 409.
        robot_busy = r["current_delivery_id"] is not None
        robot_unavailable = (
            r["battery"] < 20
            or r["status"] in ("system_outage", "route_blocked", "low_battery")
        )
        if robot_unavailable:
            raise HTTPException(409, f"Robot is unavailable (status={r['status']}, battery={r['battery']}%).")

        batch_status = "queued" if robot_busy else "assigned"
        db.execute("INSERT INTO delivery_batches(id,mode,status,created_at,updated_at) VALUES(?,?,?,?,?)",
                   (batch_id, mode, batch_status, t, t))
        ids = []
        for index, (order_id, table_no, clean_items, tray_numbers) in enumerate(normalized):
            # When busy, queue every item. When available, assign only the first;
            # the remaining items run sequentially as the batch progresses.
            status = "queued" if robot_busy or index > 0 else "task_created"
            cur = db.execute("""INSERT INTO deliveries
                (order_id,event_id,batch_id,tray_no,tray_numbers,table_no,items,status,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?)""",
                (order_id, str(uuid.uuid4()), batch_id, tray_numbers[0], json.dumps(tray_numbers), table_no, json.dumps(clean_items), status, t, t))
            did = cur.lastrowid
            ids.append(did)
            event(db, did, "delivery_batch_created", f"batch={batch_id}; mode={mode}; trays={tray_numbers}; sequence={index+1}")
            event(db, did, "nia_task_created")
            if not robot_busy and index == 0:
                event(db, did, "nia_batch_assigned_to_robot", "Simulated assignment; ROS 2 is not connected")
            elif robot_busy:
                event(db, did, "nia_task_queued", f"Robot busy with delivery #{r['current_delivery_id']}; waiting in queue.")
        if not robot_busy:
            set_robot(db, "going_to_kitchen", "kitchen_pickup", ids[0])

    message = (
        f"{mode.title()}-task batch created and queued. It will start when the robot becomes available."
        if robot_busy else
        f"{mode.title()}-task batch created and assigned. Robot execution is simulated; ROS 2 is not connected."
    )
    return {"message": message, "queued": robot_busy,
            "simulated": True, "batch_id": batch_id, "mode": mode,
            "deliveries": [delivery(i) for i in ids], "robot": get_robot()}

@app.post("/deliveries/{did}/pickup-arrived")
def pickup_arrived(did:int):
    require_delivery(did,["task_created"])
    with connect() as db:
        active_robot(db,did); db.execute("UPDATE deliveries SET status='awaiting_food_loading',updated_at=? WHERE id=?",(now(),did))
        event(db,did,"robot_arrived_at_kitchen"); set_robot(db,"awaiting_food_loading","kitchen_pickup")
    return {"message":"NIA arrived at kitchen; staff can load food","delivery":delivery(did)}
@app.post("/deliveries/{did}/pickup-confirm")
def pickup_confirm(did:int):
    require_delivery(did,["awaiting_food_loading"])
    with connect() as db:
        active_robot(db,did)
        row = db.execute(
            """SELECT d.batch_id, b.mode AS batch_mode
               FROM deliveries AS d
               LEFT JOIN delivery_batches AS b ON b.id = d.batch_id
               WHERE d.id = ?""",
            (did,)
        ).fetchone()
        t = now()

        if row and row["batch_id"] and row["batch_mode"] == "multi":
            # One kitchen stop: confirm that every order in this three-table batch
            # has been loaded onto its assigned tray before the robot departs.
            batch_id = row["batch_id"]
            batch_rows = db.execute(
                "SELECT id,status FROM deliveries WHERE batch_id=? AND cancelled=0 ORDER BY id",
                (batch_id,)
            ).fetchall()
            if len(batch_rows) != 3:
                raise HTTPException(409, "A multi-stop trip must contain exactly three active table deliveries")
            db.execute(
                """UPDATE deliveries
                   SET status='food_loaded',pickup_confirmed=1,updated_at=?
                   WHERE batch_id=? AND cancelled=0 AND status IN ('awaiting_food_loading','queued','task_created')""",
                (t, batch_id)
            )
            for batch_item in batch_rows:
                event(db, batch_item["id"], "kitchen_staff_confirmed_food_loaded",
                      f"All three table orders loaded together at kitchen pickup; batch={batch_id}")
            db.execute(
                "UPDATE delivery_batches SET status='in_progress',updated_at=? WHERE id=?",
                (t, batch_id)
            )
        else:
            db.execute("UPDATE deliveries SET status='food_loaded',pickup_confirmed=1,updated_at=? WHERE id=?",(t,did))
            event(db,did,"kitchen_staff_confirmed_food_loaded")

        set_robot(db,"food_loaded","kitchen_pickup")
    message = "All three table orders confirmed loaded at the kitchen. NIA can now complete the three table stops without returning to the kitchen." if row and row["batch_id"] and row["batch_mode"] == "multi" else "Kitchen pickup confirmed"
    return {"message":message,"delivery":delivery(did),"batch_id":row["batch_id"] if row else None}
@app.post("/deliveries/{did}/dispatch")
def dispatch(did:int):
    d=require_delivery(did,["food_loaded"])
    with connect() as db:
        active_robot(db,did); r=robot_row(db)
        if r["battery"]<20: raise HTTPException(409,"Low battery: dispatch blocked")
        db.execute("UPDATE deliveries SET status='en_route_to_table',updated_at=? WHERE id=?",(now(),did))
        event(db,did,"robot_dispatched_to_table",f"Table {d['table_number']}")
        set_robot(db,"going_to_table",f"en_route_to_table_{d['table_number']}")
    return {"message":f"NIA dispatched to Table {d['table_number']} (simulated navigation)","delivery":delivery(did)}
@app.post("/deliveries/{did}/arrive")
def arrive(did:int):
    d=require_delivery(did,["en_route_to_table"])
    with connect() as db:
        active_robot(db,did); db.execute("UPDATE deliveries SET status='arrived_at_table',arrived=1,updated_at=? WHERE id=?",(now(),did))
        event(db,did,"robot_arrived_at_table",f"Table {d['table_number']}"); set_robot(db,"awaiting_handoff",f"table_{d['table_number']}")
    return {"message":"Robot arrived; server handoff confirmation required","delivery":delivery(did)}
@app.post("/deliveries/{did}/handoff")
def handoff(did:int):
    require_delivery(did,["arrived_at_table"])
    with connect() as db:
        active_robot(db,did); db.execute("UPDATE deliveries SET status='handoff_confirmed',handoff_confirmed=1,updated_at=? WHERE id=?",(now(),did))
        event(db,did,"server_confirmed_handoff")
    return {"message":"Handoff confirmed; completion can now be recorded for KDS/POS sync","delivery":delivery(did)}
@app.post("/deliveries/{did}/station-confirm")
def complete(did:int):
    """Complete a handoff, then immediately assign the next queued order if safe."""
    require_delivery(did,["handoff_confirmed"])
    with connect() as db:
        active_robot(db,did)
        d = db.execute(
            """SELECT d.*,b.mode AS batch_mode FROM deliveries d
               LEFT JOIN delivery_batches b ON b.id=d.batch_id WHERE d.id=?""",
            (did,)
        ).fetchone()
        db.execute("UPDATE deliveries SET status='completed',station_confirmed=1,updated_at=? WHERE id=?",(now(),did))
        event(db,did,"nia_completion_recorded")
        event(db,did,"kds_pos_status_update_pending","External KDS/POS is not connected in this MVP")

        # Multi-stop batch: all three orders were loaded during the single
        # kitchen visit. After each handoff, send NIA directly to the next table.
        # Do not send the robot back to kitchen_pickup between table deliveries.
        if d["batch_id"] and d["batch_mode"] == "multi":
            next_row = db.execute(
                """SELECT id,table_no FROM deliveries
                   WHERE batch_id=? AND status='food_loaded' AND pickup_confirmed=1
                     AND cancelled=0 AND id<>?
                   ORDER BY id ASC LIMIT 1""",
                (d["batch_id"], did)
            ).fetchone()
            if next_row:
                next_id = next_row["id"]
                next_table = next_row["table_no"]
                # The three orders were loaded in one kitchen pickup. Once the
                # current table handoff is confirmed, automatically dispatch the
                # next already-loaded order. No second pickup-confirm or dispatch
                # button is required from the staff UI.
                robot_state = robot_row(db)
                if robot_state["battery"] < 20:
                    set_robot(db, "low_battery", f"table_{d['table_no']}", next_id)
                    event(db, next_id, "nia_next_batch_delivery_paused_low_battery",
                          "Next order is loaded, but automatic dispatch is paused because battery is below 20%")
                    message = (
                        f"Table {d['table_no']} completed. Table {next_table} is next and already loaded, "
                        "but dispatch is paused because battery is below 20%."
                    )
                else:
                    db.execute(
                        "UPDATE deliveries SET status='en_route_to_table',updated_at=? WHERE id=?",
                        (now(), next_id)
                    )
                    event(db, next_id, "nia_next_batch_delivery_started",
                          f"Automatically dispatched directly to Table {next_table}; no kitchen return; previous delivery #{did}")
                    event(db, next_id, "robot_dispatched_to_table", f"Table {next_table}; automatic multi-stop continuation")
                    set_robot(db, "going_to_table", f"en_route_to_table_{next_table}", next_id)
                    message = (
                        f"Table {d['table_no']} completed. NIA is automatically proceeding to Table {next_table} "
                        "with its food already loaded; no kitchen stop or extra load button is needed."
                    )
                db.execute(
                    "UPDATE delivery_batches SET status='in_progress',updated_at=? WHERE id=?",
                    (now(), d["batch_id"])
                )
            else:
                db.execute("UPDATE delivery_batches SET status='completed',updated_at=? WHERE id=?", (now(), d["batch_id"]))
                set_robot(db, "returning_to_staging", "returning_to_staging", did)
                next_id = None
                message = "All three table deliveries are complete. NIA now returns to the docking station (simulated)."
        else:
            set_robot(db, "docked", f"table_{d['table_no']}", None)
            next_id = assign_next_queued(db)
            if next_id is None:
                set_robot(db, "returning_to_staging", "returning_to_staging", did)
                message = "Delivery completed. No queued task is ready, so NIA should return to staging."
            else:
                event(db, next_id, "nia_next_delivery_started_without_docking", f"Assigned after delivery #{did}")
                message = f"Delivery completed. NIA is proceeding directly to kitchen pickup for queued delivery #{next_id}, without returning to dock."
    return {"message":message,"delivery":delivery(did),"next_delivery_id":next_id,"robot":get_robot()}
@app.post("/robot/returned")
def returned():
    with connect() as db:
        r=robot_row(db)
        if r["status"]!="returning_to_staging": raise HTTPException(409,"Robot is not returning to staging")
        did=r["current_delivery_id"]
        if did: event(db,did,"robot_returned_to_staging")
        set_robot(db,"docked","staging_station",None)
        next_id = assign_next_queued(db)
        if next_id is not None:
            return {
                "message": f"Robot returned to staging; queued delivery #{next_id} was assigned to kitchen pickup.",
                "robot": robot_json(robot_row(db)),
                "next_delivery_id": next_id
            }
        return {"message":"Robot returned to staging and is available","robot":robot_json(robot_row(db))}
@app.post("/deliveries/{did}/table-change")
def table_change(did:int,req:TableChange):
    require_delivery(did,["task_created","awaiting_food_loading","food_loaded"])
    with connect() as db:
        db.execute("UPDATE deliveries SET table_no=?,updated_at=? WHERE id=?",(req.table_number,now(),did))
        event(db,did,"table_changed",f"new table={req.table_number}")
    return {"message":f"Destination changed to Table {req.table_number}","delivery":delivery(did)}
@app.post("/deliveries/{did}/cancel")
def cancel(did:int,req:Notes):
    d=require_delivery(did,["queued","task_created","awaiting_food_loading","food_loaded"])
    with connect() as db:
        db.execute("UPDATE deliveries SET status='cancelled',cancelled=1,exception=?,updated_at=? WHERE id=?",(req.notes,now(),did))
        event(db,did,"order_cancelled",req.notes)
        r=robot_row(db)
        if r["current_delivery_id"]==did:
            set_robot(db,"docked","staging_station",None)
            assign_next_queued(db)
        elif d["status"] == "queued":
            event(db,did,"queued_task_cancelled")
    return {"message":"Queued order cancelled without interrupting active robot" if d["status"]=="queued" else "Order cancelled; task stopped before table departure","delivery":delivery(did)}
@app.post("/deliveries/{did}/route-blocked")
def blocked(did:int,req:Notes):
    require_delivery(did,["en_route_to_table"])
    with connect() as db:
        db.execute("UPDATE deliveries SET status='route_blocked',exception=?,updated_at=? WHERE id=?",(req.notes,now(),did))
        event(db,did,"route_blocked",req.notes); set_robot(db,"route_blocked","safe_stop")
    return {"message":"Route blocked; robot set to safe stop and staff assistance is required","delivery":delivery(did)}
@app.post("/deliveries/{did}/route-resume")
def resume(did:int):
    d=require_delivery(did,["route_blocked"])
    with connect() as db:
        db.execute("UPDATE deliveries SET status='en_route_to_table',exception=NULL,updated_at=? WHERE id=?",(now(),did))
        event(db,did,"route_resumed_by_staff"); set_robot(db,"going_to_table",f"en_route_to_table_{d['table_number']}")
    return {"message":"Route marked clear; simulated navigation resumed","delivery":delivery(did)}
@app.post("/robot/battery")
def battery(req:Battery):
    with connect() as db:
        r=robot_row(db); set_robot(db,battery=req.battery_percent)
        if req.battery_percent<20 and r["current_delivery_id"] is None:
            set_robot(db,"low_battery","staging_station")
        elif req.battery_percent>=20 and r["status"]=="low_battery":
            set_robot(db,"docked","staging_station")
        if req.battery_percent>=20:
            assign_next_queued(db)
        return robot_json(robot_row(db))
@app.post("/system/outage")
def outage(req:Notes):
    with connect() as db:
        r=robot_row(db); set_robot(db,"system_outage","safe_stop")
        if r["current_delivery_id"]: event(db,r["current_delivery_id"],"system_outage",req.notes)
        return {"message":"Outage recorded; robot status set to safe stop. Staff must handle manually","robot":robot_json(robot_row(db))}
@app.post("/system/recover")
def recover():
    with connect() as db:
        r=robot_row(db)
        if r["status"]!="system_outage": raise HTTPException(409,"System is not marked as outage")
        if r["current_delivery_id"] is not None: raise HTTPException(409,"Active task requires staff review before recovery")
        set_robot(db,"docked","staging_station")
        return {"message":"System recovered to staging state","robot":robot_json(robot_row(db))}
