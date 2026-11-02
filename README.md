# NIA Restaurant Robot App

**Restaurant Robot Operations Dashboard — FastAPI, React Native, Expo, and SQLite**

NIA is a prototype restaurant robot operations application designed to coordinate food-delivery tasks between restaurant staff, a robot, and customer tables. It provides a backend API, a web dashboard, and a React Native mobile application.

The project is structured to support an integration-first approach: restaurant staff can manage delivery tasks through the application, while a future robot integration can connect task execution to ROS 2 navigation and the physical robot.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Features](#2-features)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [System Architecture](#5-system-architecture)
6. [Restaurant Delivery Workflow](#6-restaurant-delivery-workflow)
7. [Backend Architecture](#7-backend-architecture)
8. [API Reference](#8-api-reference)
9. [Prerequisites](#9-prerequisites)
10. [Clone the Repository](#10-clone-the-repository)
11. [Run the Backend](#11-run-the-backend)
12. [Run the Web Dashboard](#12-run-the-web-dashboard)
13. [Run the Mobile Application](#13-run-the-mobile-application)
14. [Connect the Frontend to the Backend](#14-connect-the-frontend-to-the-backend)
15. [Test the API](#15-test-the-api)
16. [Database and Data Storage](#16-database-and-data-storage)
17. [Robot Integration Roadmap](#17-robot-integration-roadmap)
18. [Troubleshooting](#18-troubleshooting)
19. [Security Considerations](#19-security-considerations)
20. [Development Guidelines](#20-development-guidelines)
21. [Contributing](#21-contributing)

---

## 1. Project Overview

NIA is intended to support restaurant delivery operations using a robot-assisted workflow.

The application separates the system into three main parts:

- **Backend:** A FastAPI service that exposes REST endpoints for robot status and delivery management.
- **Web dashboard:** A browser-based interface for interacting with restaurant delivery operations.
- **Mobile application:** A React Native application built with Expo for accessing the NIA interface on supported platforms.

SQLite is used for local data storage where configured by the backend. The project is currently a prototype; real robot movement, navigation, and restaurant POS/KDS integrations must be configured and validated separately.

### Project goals

- Create and track restaurant delivery tasks.
- Manage delivery status transitions.
- Provide an interface for restaurant staff.
- Separate application logic from robot-control logic.
- Prepare the software architecture for future ROS 2 integration.
- Allow developers to install and run the project locally.

---

## 2. Features

### Backend

- FastAPI REST API.
- Automatic API documentation.
- Robot status endpoint.
- Delivery creation and retrieval.
- Delivery loading, dispatch, and arrival operations.
- Delivery workflow status tracking.
- SQLite/SQLAlchemy dependencies for database-backed development.

### Web dashboard

- Browser-based restaurant operations interface.
- Frontend-to-backend integration through HTTP requests.
- Delivery task interaction through the web interface.

### Mobile application

- React Native application using Expo.
- TypeScript-based application code.
- Expo configuration and assets.
- Shared API integration for supported app workflows.

### Current implementation status

| Component | Status |
|---|---|
| FastAPI backend | Implemented prototype |
| REST API documentation | Available through FastAPI |
| Web dashboard | Included in the repository |
| Expo mobile app | Included in the repository |
| Local persistence | Must be verified against the configured backend implementation |
| Live robot navigation | Not yet integrated end to end |
| Physical robot control | Not yet integrated end to end |
| Production authentication | Requires implementation and verification |
| POS/KDS integration | Not yet confirmed |

---

## 3. Technology Stack

| Technology | Purpose |
|---|---|
| Python | Backend programming |
| FastAPI | REST API framework |
| Uvicorn | ASGI development server |
| Pydantic | Request validation and data models |
| SQLAlchemy | Database toolkit/ORM dependency |
| SQLite | Local database option |
| HTML, CSS, JavaScript | Web dashboard |
| React Native | Mobile application |
| TypeScript | Mobile application programming |
| Expo | Mobile development and testing |
| Git and GitHub | Version control and collaboration |
| ROS 2 | Planned robot middleware integration |
| Nav2 / SLAM | Potential navigation and mapping integration |

**Note:** A library being installed does not mean every feature is already connected. Confirm the implementation in the source code before relying on a technology for production functionality.

---

## 4. Project Structure

The repository is organized as follows:

```text
nia-restaurant-robot-app/
│
├── README.md
├── .gitignore
│
├── backend/
│   ├── main.py
│   └── requirements.txt
│
├── frontend/
│   └── index.html
│
└── nia-mobile/
    ├── .gitignore
    ├── app.json
    ├── eas.json
    ├── package.json
    ├── package-lock.json
    ├── tsconfig.json
    ├── assets/
    ├── scripts/
    └── src/
        ├── app/
        │   ├── _layout.tsx
        │   ├── index.tsx
        │   └── explore.tsx
        ├── components/
        ├── constants/
        ├── hooks/
        └── global.css
```

### Important files

**`backend/main.py`**

Contains the FastAPI application, data models, robot status handling, delivery operations, and API routes.

**`backend/requirements.txt`**

Lists Python dependencies required by the backend.

**`frontend/index.html`**

Contains the web dashboard interface and its client-side logic.

**`nia-mobile/src/app/index.tsx`**

Contains the main mobile application screen and its UI/workflow logic.

**`nia-mobile/src/app/_layout.tsx`**

Defines the Expo Router application layout.

**`nia-mobile/package.json`**

Defines mobile dependencies and available npm scripts.

**`nia-mobile/app.json`**

Contains Expo application configuration.

**`.gitignore`**

Excludes local environments, generated files, databases, and other files that should not normally be committed.

---

## 5. System Architecture

The current application follows a client-server structure.

```text
       Restaurant Staff
              |
       +------+------+
       |             |
       v             v
  Web Dashboard   Mobile App
       |             |
       +------+------+
              |
          HTTP / REST
              |
              v
       FastAPI Backend
              |
       +------+------+
       |             |
       v             v
 Delivery Logic   Robot Status
       |
       v
 Local Data Storage
 (according to backend configuration)
```

### How the components communicate

1. A staff member opens the web dashboard or mobile application.
2. The interface sends an HTTP request to the backend.
3. FastAPI validates the request and executes the corresponding endpoint.
4. The backend returns a JSON response.
5. The frontend updates the displayed delivery or robot status.

The backend is the application API. The frontend does not directly control a physical robot simply by changing a delivery status.

### Future robot architecture

```text
Web / Mobile Application
           |
           v
      FastAPI API
           |
           v
 Robot Integration Layer
           |
           v
          ROS 2
           |
      +----+----+
      |         |
      v         v
    Nav2     Robot Drivers
      |         |
      +----+----+
           |
           v
   Physical Robot
```

This second diagram represents the planned integration direction, not a claim that the complete ROS 2 connection already exists.

---

## 6. Restaurant Delivery Workflow

The intended restaurant delivery workflow is:

### Step 1 — Robot waits at the docking station

The robot is available for a new delivery task.

### Step 2 — Kitchen marks an order ready

A restaurant staff member selects a ready order and initiates a delivery task with the order ID, table number, and items.

### Step 3 — Robot is assigned to the kitchen or dispatch station

The application tracks the task and the intended delivery destination.

### Step 4 — Food is loaded

Restaurant staff place the order on the robot and confirm that it is loaded.

### Step 5 — Delivery dispatch

The task is marked for dispatch. In a fully integrated deployment, this step would also send a command to the robot integration layer.

### Step 6 — Robot travels to the destination

The intended destination is the customer table. Real navigation requires a configured robot, map, navigation stack, and validated control interface.

### Step 7 — Arrival and customer handover

The application records arrival. Restaurant staff or an appropriate confirmation mechanism verifies the handover.

### Step 8 — Delivery completion

The delivery status is updated and the robot can be assigned another task or return to its docking station.

**Prototype limitation:** A backend status update is not proof that the physical robot has completed an action. Production integration must use actual robot feedback and handle failed, cancelled, or interrupted deliveries.

---

## 7. Backend Architecture

The backend entry point is `backend/main.py`.

### Application startup

The backend uses FastAPI and Uvicorn.

FastAPI provides:

- HTTP route definitions.
- Request validation.
- JSON responses.
- Interactive OpenAPI documentation.
- Error responses for invalid requests.

Uvicorn runs the FastAPI application as a local development server.

### Robot status model

The current prototype defines robot statuses such as:

- `DOCKED`
- `WAITING_FOR_ORDER`
- `GOING_TO_STATION`
- `LOADING_FOOD`
- `GOING_TO_TABLE`
- `AWAITING_CUSTOMER`
- `RETURNING_TO_DOCK`

These statuses describe the intended operational lifecycle.

### Delivery status model

The prototype defines delivery statuses such as:

- `ORDER_READY`
- `ASSIGNED`
- `FOOD_LOADED`
- `EN_ROUTE`
- `ARRIVED`
- `DELIVERED_BY_ROBOT`
- `CONFIRMED_BY_STATION`
- `COMPLETED`

Use the exact status values accepted by the current backend when making API requests. Not every transition is necessarily enforced as a strict state machine yet.

### Development data

The original prototype includes in-memory Python data structures for robot and delivery state. SQLAlchemy and SQLite dependencies are present in the project, but their presence alone does not establish that every endpoint persists data to SQLite.

Verify the actual database implementation before assuming that deliveries survive server restarts.

---

## 8. API Reference

The backend exposes the following routes in the prototype.

Base URL for local development:

```text
http://127.0.0.1:8000
```

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/` | Basic application response |
| `GET` | `/health` | Health check |
| `GET` | `/robot` | Retrieve robot state |
| `POST` | `/deliveries` | Create a delivery task |
| `GET` | `/deliveries` | List deliveries |
| `GET` | `/deliveries/{delivery_id}` | Retrieve a delivery |
| `POST` | `/deliveries/{delivery_id}/load` | Mark food as loaded |
| `POST` | `/deliveries/{delivery_id}/dispatch` | Dispatch a delivery |
| `POST` | `/deliveries/{delivery_id}/arrive` | Record arrival |

The exact accepted request fields and response schemas are defined by the running backend's OpenAPI specification.

### Create a delivery

Example request:

```http
POST /deliveries
Content-Type: application/json
```

```json
{
  "table_number": 5,
  "order_id": "ORD-1001",
  "items": [
    "Veg Burger",
    "French Fries",
    "Orange Juice"
  ]
}
```

The backend's `CreateDelivery` model defines a positive table number, an order ID, and a list of item names.

Example response:

```json
{
  "delivery_id": 1,
  "table_number": 5,
  "order_id": "ORD-1001",
  "items": [
    "Veg Burger",
    "French Fries",
    "Orange Juice"
  ]
}
```

The exact response fields may differ from this illustrative example. Check `/docs` for the live response schema.

### Get robot status

```http
GET /robot
```

This endpoint returns the robot state maintained by the backend.

### List deliveries

```http
GET /deliveries
```

Returns the delivery records available to the backend.

### Load food

```http
POST /deliveries/1/load
```

Marks the specified delivery's food-loading step. Check `/docs` to determine whether the endpoint requires a request body.

### Dispatch delivery

```http
POST /deliveries/1/dispatch
```

Requests the delivery dispatch operation.

### Record arrival

```http
POST /deliveries/1/arrive
```

Records arrival for the specified delivery.

### Interactive API documentation

After starting the backend, open:

- Swagger UI: `http://127.0.0.1:8000/docs`
- OpenAPI schema: `http://127.0.0.1:8000/openapi.json`

The running API documentation is the authoritative reference for request and response schemas.

---

## 9. Prerequisites

Install the following tools on your development machine.

### Backend

- Python 3.10 or another Python version compatible with the project's dependencies.
- pip.
- Git.

### Web frontend

- A modern browser.
- A local HTTP server or suitable development environment if required by the frontend implementation.

### Mobile application

- Node.js LTS.
- npm.
- Expo tooling through `npx expo`.
- Expo Go for compatible physical-device testing, or an appropriate emulator/development build.

### Operating system

The following instructions primarily use Windows CMD. The same project can be adapted for Linux or macOS with their respective environment activation commands.

---

## 10. Clone the Repository

Open CMD, PowerShell, or a terminal.

Navigate to the folder where you want the project:

```bash
cd path/to/your/workspace
```

Clone the repository:

```bash
git clone https://github.com/neuron-ai/nia-restaurant-robot-app.git
```

Enter the project:

```bash
cd nia-restaurant-robot-app
```

Verify the directory:

```bash
git status
```

The root directory should contain:

```text
README.md
.gitignore
backend/
frontend/
nia-mobile/
```

### If you already cloned the project

Navigate to the existing repository and update it:

```bash
git pull origin main
```

If you have local changes, commit or otherwise preserve them before pulling.

---

## 11. Run the Backend

### Step 1 — Open a terminal in the project root

```bash
cd nia-restaurant-robot-app
```

### Step 2 — Enter the backend directory

```bash
cd backend
```

### Step 3 — Create a Python virtual environment

Windows CMD:

```cmd
py -m venv .venv
```

If `py` is unavailable, use:

```cmd
python -m venv .venv
```

### Step 4 — Activate the environment

Windows CMD:

```cmd
.venv\Scripts\activate.bat
```

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

If activation is blocked by a PowerShell execution policy, use CMD or invoke `.venv\Scripts\python.exe` directly.

### Step 5 — Install dependencies

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### Step 6 — Start FastAPI

```bash
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The server should be available at:

```text
http://127.0.0.1:8000
```

Keep this terminal running.

### Step 7 — Verify the backend

Open these URLs in your browser:

```text
http://127.0.0.1:8000/health
http://127.0.0.1:8000/docs
```

The health endpoint should return a successful response, and Swagger UI should display the available API routes.

---

## 12. Run the Web Dashboard

The web dashboard is located at:

```text
frontend/index.html
```

### Option A — Open directly

Open `frontend/index.html` in a browser for a quick initial inspection.

Depending on the frontend implementation, some API requests may require the page to be served through HTTP rather than opened using `file://`.

### Option B — Start a local web server

From the project root, open a second terminal:

```bash
cd frontend
python -m http.server 5500
```

Open:

```text
http://127.0.0.1:5500
```

Keep the backend running separately on port `8000`.

**Important:** A static HTTP server does not compile or bundle a frontend. This approach is appropriate for a standalone HTML file only if its code supports that execution mode.

If the browser reports API connection errors, verify the API URL and browser console. Configure CORS on the backend if the frontend's origin requires it.

---

## 13. Run the Mobile Application

Open a new terminal from the project root.

### Step 1 — Enter the mobile directory

```bash
cd nia-mobile
```

### Step 2 — Install JavaScript dependencies

```bash
npm ci
```

Use `npm ci` to install the dependencies recorded in `package-lock.json`.

### Step 3 — Start Expo

```bash
npx expo start
```

Expo displays a QR code and development options.

### Step 4 — Choose a platform

- Press `w` if web support is available and you want to run the app in a browser.
- Scan the QR code using Expo Go if the project is compatible with your installed Expo Go version.
- Use an Android emulator or an appropriate development build if required.

Keep the Expo terminal running.

### Important mobile networking rule

`127.0.0.1` on a physical phone refers to the phone itself, not your development computer.

If the mobile app connects to a backend on your laptop, configure the API base URL to use the laptop's reachable LAN IP address, for example:

```text
http://192.168.1.100:8000
```

Replace this example with the actual IP address of the development computer.

Both devices normally need to be on a network that allows communication between them, and the firewall must permit the required connection. For a remote or production deployment, use an appropriately secured HTTPS endpoint.

---

## 14. Connect the Frontend to the Backend

The frontend must use the correct API base URL.

### Local browser

When the web dashboard and API are running on the same development computer, the API base URL can be:

```text
http://127.0.0.1:8000
```

### Physical mobile device

Configure the base URL to use the development computer's LAN IP address:

```text
http://YOUR_COMPUTER_LAN_IP:8000
```

### Production deployment

Configure the application to use the deployed API endpoint over HTTPS.

### Configuration checklist

1. Locate the API base URL in `frontend/index.html` and `nia-mobile/src/app/index.tsx`.
2. Replace development-specific addresses when needed.
3. Make sure the backend is running and reachable.
4. Check the browser console or Expo logs for request failures.
5. Configure FastAPI CORS appropriately for the frontend origin.
6. Avoid hardcoding production credentials or secrets into frontend code.

A future improvement is to centralize API configuration through environment-specific settings instead of hardcoding addresses.

---

## 15. Test the API

With the backend running, use a second terminal.

### Health check

```bash
curl http://127.0.0.1:8000/health
```

### Robot state

```bash
curl http://127.0.0.1:8000/robot
```

### Create a delivery

Windows CMD:

```cmd
curl -X POST "http://127.0.0.1:8000/deliveries" -H "Content-Type: application/json" -d "{\"table_number\":5,\"order_id\":\"ORD-1001\",\"items\":[\"Veg Burger\",\"French Fries\"]}"
```

### List deliveries

```bash
curl http://127.0.0.1:8000/deliveries
```

### Retrieve a delivery

Replace `1` with the ID returned by the creation request:

```bash
curl http://127.0.0.1:8000/deliveries/1
```

### Load food

```bash
curl -X POST http://127.0.0.1:8000/deliveries/1/load
```

### Dispatch

```bash
curl -X POST http://127.0.0.1:8000/deliveries/1/dispatch
```

### Record arrival

```bash
curl -X POST http://127.0.0.1:8000/deliveries/1/arrive
```

These commands illustrate the available workflow. Follow the live `/docs` schemas if a route requires a body, returns a different response, or enforces a different state transition.

---

## 16. Database and Data Storage

SQLite is suitable for local development and small prototypes. However, verify the current backend persistence implementation before assuming that all records are stored in a database.

### Local database files

If the backend creates a local SQLite database, its location should be documented in the code or configuration.

Local database files should generally not be committed to GitHub.

### Development recommendations

- Keep local database files outside version control.
- Use a separate test database for automated tests.
- Avoid using production customer data during development.
- Introduce migrations when the database schema becomes more complex.
- Use a managed database or another appropriate persistence strategy if production scale requires it.

### Data persistence verification

1. Create a delivery through the API.
2. Restart the backend.
3. Query the delivery again.
4. Confirm whether the record remains available.

If the record disappears, the relevant state may be stored only in memory or may not be persisted by the current configuration.

---

## 17. Robot Integration Roadmap

The project is structured as an application prototype. Connecting it to a physical robot requires additional integration and testing.

### Phase 1 — Application prototype

- Start the backend.
- Run the web dashboard.
- Run the mobile application.
- Create and track delivery tasks.
- Validate API requests and responses.

### Phase 2 — Simulation integration

- Select the robot model and simulator.
- Configure the robot description and sensor setup.
- Configure ROS 2 topics, services, and actions.
- Configure the map, localization, and navigation stack.
- Implement a robot integration layer between the API and ROS 2.
- Test delivery tasks in simulation.

### Phase 3 — Hardware integration

- Connect the robot's ROS 2 interfaces.
- Integrate real navigation feedback.
- Verify emergency-stop and safe-stop behavior.
- Validate sensor data and obstacle handling.
- Test loading, arrival, handover, and docking operations.

### Phase 4 — Restaurant deployment

- Integrate the restaurant's POS or kitchen display system if required.
- Add authentication and role-based access control.
- Implement reliable task persistence and recovery.
- Add monitoring, logs, alerts, and error handling.
- Test network failures and interrupted deliveries.
- Validate the system in a controlled environment before deployment.

### Essential integration principle

The API should not report a robot as having arrived merely because a dispatch request was accepted. A robot integration layer should consume actual navigation feedback and update the application with verified state transitions.

---

## 18. Troubleshooting

### Backend: `ModuleNotFoundError`

Make sure the backend virtual environment is active and install the dependencies again:

```bash
python -m pip install -r requirements.txt
```

### Backend: `Address already in use`

Port `8000` may already be occupied. Stop the other server or use a different port, then update the frontend API URL accordingly.

### Mobile app cannot reach the backend

- Check that FastAPI is running.
- Verify the API base URL.
- Do not use `127.0.0.1` from a physical phone to access the computer.
- Check Wi-Fi connectivity and firewall settings.
- Inspect Expo logs and backend logs.

### Browser reports a CORS error

Configure FastAPI's CORS middleware for the actual development frontend origin. Do not use unrestricted origins with credentials in production.

### npm installation errors

Check your Node.js and npm versions, then try:

```bash
npm ci
```

If dependency compatibility is the problem, review the Expo SDK and dependency versions in `package.json` before changing packages.

### API request returns `404`

- Check the endpoint path.
- Confirm that the correct backend is running.
- Open `http://127.0.0.1:8000/docs` to inspect available routes.

### API request returns `422`

FastAPI rejected the request because its fields or types do not match the endpoint schema. Review the request model in Swagger UI.

### Git reports local changes

Before updating from GitHub:

```bash
git status
```

Commit or preserve your changes before running `git pull`.

---

## 19. Security Considerations

This repository is public, so all committed source code and documentation are visible to anyone.

- Never commit API keys, passwords, access tokens, or private credentials.
- Do not commit `.env` files containing secrets.
- Do not upload customer information or private restaurant records.
- Keep local databases and virtual environments out of version control.
- Use authentication and authorization before exposing operational APIs to untrusted users.
- Restrict CORS to approved origins in production.
- Use HTTPS for remote communication.
- Do not expose development servers directly to the public internet without appropriate security controls.
- Validate delivery transitions and authorize actions on the backend.
- Ensure that robot motion commands are protected by suitable safety controls.

The current prototype should not be treated as production-ready until authentication, authorization, persistence, monitoring, recovery, and robot safety have been validated.

---

## 20. Development Guidelines

### Before making changes

```bash
git pull origin main
git status
```

### After modifying code

Test the affected component:

- Backend: start FastAPI and verify the affected endpoints.
- Web dashboard: test the browser UI and API requests.
- Mobile app: run Expo and test the affected screen or workflow.

### Commit changes

```bash
git add .
git commit -m "Describe the change"
```

### Push changes

```bash
git push origin main
```

For shared company development, use feature branches and pull requests when required by the organization's workflow.

Do not commit virtual environments, `node_modules`, generated build folders, local database files, or secrets.

---

## 21. Contributing

Contributions should focus on maintainability, reliability, and safe integration.

Suggested areas for improvement:

- Centralized API configuration.
- Automated backend tests.
- Stronger delivery-state validation.
- Persistent task storage and recovery.
- Structured logging and operational monitoring.
- Authentication and role-based permissions.
- Robot integration interfaces and feedback handling.
- ROS 2 simulation and integration tests.
- Deployment documentation.

Before submitting changes, verify the affected functionality and document any new configuration requirements.

---

## Maintainers and Repository

Repository: https://github.com/neuron-ai/nia-restaurant-robot-app

For questions about the application architecture, setup, or future robot integration, coordinate with the project maintainers.

---

**Project status:** Development prototype. Application features, persistent storage, security controls, and robot integration should be verified against the implementation before operational or production use.
