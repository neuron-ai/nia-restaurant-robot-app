from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
import json, sqlite3, uuid
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
DB = Path(__file__).with_name("nia.db")
def now():
    return datetime.now(timezone.utc).isoformat()
def connect():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c
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
          "items":json.loads(r["items"]),"status":r["status"],"pickup_confirmed":bool(r["pickup_confirmed"]),
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
               (order_id,event_id,table_no,items,status,tray_no,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?)""",
            (order_id, event_id, req.table_number, json.dumps(items), initial_status,
             parse_tray(req.tray), t, t)
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
    tray: str | int

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
    if mode == "multi" and len(req.items) < 2:
        raise HTTPException(422, "Multi-task mode requires at least two deliveries")
    table_numbers = [item.table_number for item in req.items]
    if len(set(table_numbers)) != len(table_numbers):
        raise HTTPException(422, "Duplicate destination table: each table can appear only once per batch")
    tray_numbers = [parse_tray(item.tray) for item in req.items]
    if len(set(tray_numbers)) != len(tray_numbers):
        raise HTTPException(422, "Duplicate tray assignment: each delivery in a batch must use a different tray")
    table_numbers = [item.table_number for item in req.items]
    if len(set(table_numbers)) != len(table_numbers):
        raise HTTPException(422, "Duplicate table assignment: each stop must use a different table in this trip")
    normalized = []
    for item, tray_no in zip(req.items, tray_numbers):
        order_id = item.order_id.strip()
        clean_items = [x.strip() for x in item.items if x.strip()]
        if not order_id or not clean_items:
            raise HTTPException(422, "Every delivery needs an order ID and at least one food item")
        normalized.append((order_id, item.table_number, clean_items, tray_no))
    batch_id = str(uuid.uuid4())
    t = now()
    with connect() as db:
        r = robot_row(db)
        if r["current_delivery_id"] is not None:
            raise HTTPException(409, "Robot is busy with another delivery. Wait until it is available before assigning a batch.")
        if r["battery"] < 20 or r["status"] in ("system_outage", "route_blocked", "low_battery"):
            raise HTTPException(409, f"Robot is unavailable (status={r['status']}, battery={r['battery']}%).")
        db.execute("INSERT INTO delivery_batches(id,mode,status,created_at,updated_at) VALUES(?,?,?,?,?)",
                   (batch_id, mode, "assigned", t, t))
        ids = []
        for index, (order_id, table_no, clean_items, tray_no) in enumerate(normalized):
            status = "task_created" if index == 0 else "queued"
            cur = db.execute("""INSERT INTO deliveries
                (order_id,event_id,batch_id,tray_no,table_no,items,status,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?)""",
                (order_id, str(uuid.uuid4()), batch_id, tray_no, table_no, json.dumps(clean_items), status, t, t))
            did = cur.lastrowid
            ids.append(did)
            event(db, did, "delivery_batch_created", f"batch={batch_id}; mode={mode}; tray={tray_no}; sequence={index+1}")
            event(db, did, "nia_task_created")
            if index == 0:
                event(db, did, "nia_batch_assigned_to_robot", "Simulated assignment; ROS 2 is not connected")
        set_robot(db, "going_to_kitchen", "kitchen_pickup", ids[0])
    return {"message": f"{mode.title()}-task batch created. Robot execution is simulated; ROS 2 is not connected.",
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
        active_robot(db,did); db.execute("UPDATE deliveries SET status='food_loaded',pickup_confirmed=1,updated_at=? WHERE id=?",(now(),did))
        event(db,did,"kitchen_staff_confirmed_food_loaded"); set_robot(db,"food_loaded","kitchen_pickup")
    return {"message":"Kitchen pickup confirmed","delivery":delivery(did)}
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
        d = db.execute("SELECT * FROM deliveries WHERE id=?", (did,)).fetchone()
        db.execute("UPDATE deliveries SET status='completed',station_confirmed=1,updated_at=? WHERE id=?",(now(),did))
        event(db,did,"nia_completion_recorded")
        event(db,did,"kds_pos_status_update_pending","External KDS/POS is not connected in this MVP")

        # For a batch, finish the current table and continue to the next table's
        # kitchen loading step without releasing the robot to unrelated queued work.
        if d["batch_id"]:
            next_row = db.execute("SELECT id FROM deliveries WHERE batch_id=? AND status='queued' AND cancelled=0 ORDER BY id ASC LIMIT 1", (d["batch_id"],)).fetchone()
            if next_row:
                next_id = next_row["id"]
                db.execute("UPDATE deliveries SET status='task_created',updated_at=? WHERE id=?", (now(), next_id))
                event(db, next_id, "nia_next_batch_delivery_started", f"Continues batch {d['batch_id']} after delivery #{did}")
                set_robot(db, "going_to_kitchen", "kitchen_pickup", next_id)
                message = f"Table {d['table_no']} completed. Continue batch {d['batch_id']} with delivery #{next_id}; robot execution remains simulated."
            else:
                db.execute("UPDATE delivery_batches SET status='completed',updated_at=? WHERE id=?", (now(), d["batch_id"]))
                set_robot(db, "returning_to_staging", "returning_to_staging", did)
                next_id = None
                message = "All deliveries in this batch are complete. NIA should return to staging (simulated)."
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
