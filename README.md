# NIA Restaurant Robot App — Version 2

**Restaurant Delivery Management Application**

**Technology Stack:** Python · FastAPI · SQLite · React Native · TypeScript · Expo

NIA is a restaurant delivery management application designed to coordinate food-delivery workflows between restaurant staff and a robot through a centralized application.

Version 2 provides a FastAPI backend, SQLite database, and React Native mobile application. Restaurant staff can create and manage delivery tasks, assign tables and trays, process single or multiple deliveries, monitor robot status, and track delivery progress through the application.

The current implementation provides an application-level delivery workflow. Robot movement and delivery execution are simulated through backend status updates.

---

## Table of Contents

1. Project Overview
2. Features
3. Technology Stack
4. Project Structure
5. Application Architecture
6. Frontend–Backend Communication
7. Application Workflow
8. Single and Multi-Delivery Management
9. Backend Architecture
10. Database Architecture
11. API Reference
12. Mobile Application
13. Backend Setup
14. Mobile Application Setup
15. Frontend Configuration
16. API Testing
17. Development Guidelines
18. Current Implementation Status

---

## 1. Project Overview

NIA is designed to simplify restaurant food-delivery task management through a centralized application.

The application consists of three main components:

- **Mobile Application:** React Native and Expo interface for restaurant staff.
- **Backend:** Python FastAPI service for delivery management and application operations.
- **Database:** SQLite database for storing delivery information, robot status, batches, and event history.

### Project Objectives

- Manage restaurant delivery tasks.
- Create single and multiple delivery requests.
- Assign delivery tasks to restaurant tables.
- Manage food trays for different orders.
- Monitor robot availability and battery status.
- Maintain delivery queues.
- Track delivery status and event history.
- Provide a mobile interface for restaurant staff.
- Maintain persistent application data.

---

## 2. Features

### Backend Features

- FastAPI REST API.
- Request validation using Pydantic.
- SQLite database integration.
- Delivery creation and management.
- Single and multi-delivery batch processing.
- Table and tray assignment.
- Robot status management.
- Delivery queue management.
- Delivery event history.
- Delivery cancellation.
- Route-blocked and recovery workflow simulation.
- Battery status management.
- Automatic API documentation.

### Mobile Application Features

- Admin and Staff interfaces.
- Robot overview dashboard.
- Robot status and battery display.
- Delivery management.
- Single-delivery creation.
- Multi-delivery creation.
- Table selection.
- Tray assignment.
- Delivery workflow controls.
- Delivery history and API response display.
- Connection status monitoring.
- Automatic data refresh.

### Version 2 Improvements

| Feature | Description |
|---|---|
| Delivery management | Improved delivery creation and tracking |
| Multi-delivery | Support for multiple delivery tasks in one batch |
| Tray management | Assign individual trays to delivery tasks |
| Table management | Assign destination tables |
| Validation | Validate duplicate tables and trays within a batch |
| Queue management | Manage pending delivery tasks |
| Event history | Maintain delivery action history |
| Database | Persistent SQLite storage |
| Mobile UI | Updated React Native application |
| Android configuration | Added Expo network configuration plugin |

---

## 3. Technology Stack

| Technology | Purpose |
|---|---|
| Python | Backend programming |
| FastAPI | REST API framework |
| Uvicorn | Backend server |
| Pydantic | Request validation |
| SQLite | Database |
| React Native | Mobile application |
| TypeScript | Frontend programming |
| Expo | Mobile development framework |
| Expo Router | Application navigation |
| JavaScript Fetch API | Frontend–backend communication |
| Git | Version control |
| GitHub | Source code management |

---

## 4. Project Structure

```text
nia-restaurant-robot-app/
│
├── README.md
├── .gitignore
│
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── nia.db
│
├── frontend/
│   └── index.html
│
└── nia-mobile/
    ├── app.json
    ├── eas.json
    ├── package.json
    ├── package-lock.json
    │
    ├── plugins/
    │   └── withCleartextNetwork.js
    │
    ├── assets/
    ├── scripts/
    │
    └── src/
        └── app/
            ├── _layout.tsx
            └── index.tsx
```

Additional folders and configuration files may be present in the repository.

### Important Files

**`backend/main.py`**

Contains the FastAPI application, API endpoints, request models, database operations, delivery workflow, and robot status management.

**`backend/requirements.txt`**

Contains Python dependencies required to run the backend.

**`nia-mobile/src/app/index.tsx`**

Contains the main mobile application interface, delivery forms, batch management, API communication, and workflow actions.

**`nia-mobile/app.json`**

Contains Expo application configuration.

**`nia-mobile/eas.json`**

Contains Expo Application Services build configuration.

**`nia-mobile/package.json`**

Defines mobile application dependencies and scripts.

**`nia-mobile/package-lock.json`**

Maintains the locked versions of installed Node.js dependencies.

**`nia-mobile/plugins/withCleartextNetwork.js`**

Contains the custom Expo configuration plugin for Android network settings.

---

## 5. Application Architecture

NIA follows a client-server architecture.

### Architecture Diagram

```text
             RESTAURANT STAFF
                    |
                    v
          REACT NATIVE / EXPO
              MOBILE APP
                    |
                    |
             HTTP REQUEST
                JSON
                    |
                    v
             FASTAPI BACKEND
                    |
          +---------+----------+
          |         |          |
          v         v          v
       Delivery   Robot      Event
       Manager    Manager    Manager
          |         |          |
          +---------+----------+
                    |
                    v
                SQLITE DB
                 nia.db
```

### Component Responsibilities

**Mobile Application**

- Displays application information.
- Creates delivery requests.
- Manages single and multiple deliveries.
- Assigns tables and trays.
- Sends delivery actions to the backend.
- Displays robot and delivery information.

**Backend**

- Receives frontend API requests.
- Validates request data.
- Creates delivery records.
- Manages delivery batches.
- Maintains robot application status.
- Processes delivery workflow transitions.
- Manages pending delivery tasks.
- Stores event history.
- Returns JSON responses.

**Database**

- Stores delivery information.
- Maintains batch records.
- Stores robot state.
- Maintains delivery event history.

---

## 6. Frontend–Backend Communication

The React Native mobile application communicates with the FastAPI backend using HTTP requests and JSON data.

### Communication Flow

```text
       USER ACTION
            |
            v
     REACT NATIVE UI
            |
            v
     FRONTEND HANDLER
            |
            v
       API HELPER
            |
            v
    JAVASCRIPT FETCH()
            |
            |
       HTTP + JSON
            |
            v
      FASTAPI BACKEND
            |
            v
    PYDANTIC VALIDATION
            |
            v
     BUSINESS LOGIC
            |
            v
      SQLITE DATABASE
            |
            v
       JSON RESPONSE
            |
            v
    FRONTEND STATE UPDATE
            |
            v
       UPDATED UI
```

### API Configuration

The mobile application reads its backend URL from:

```text
EXPO_PUBLIC_API_URL
```

The frontend request helper:

1. Receives an API endpoint.
2. Prepares the HTTP method and headers.
3. Converts request data into JSON.
4. Sends the request using `fetch()`.
5. Parses the backend JSON response.
6. Handles unsuccessful HTTP responses.
7. Returns the response to the application.

### Example: Refresh Application Data

```text
Refresh Button
      |
      v
   refresh()
      |
      +------------------+
      |                  |
      v                  v
  GET /robot       GET /deliveries
      |                  |
      +---------+--------+
                |
                v
          JSON Responses
                |
                v
        Update Application
                |
                v
          Refresh UI
```

The application uses `Promise.all()` to retrieve robot and delivery information concurrently.

The mobile application also performs periodic refreshes.

### Example: Creating a Delivery

```text
Staff Enters Order Details
             |
             v
     Frontend Validation
             |
             v
    POST /kds/food-ready
             |
             v
      FastAPI Backend
             |
             v
       Request Validation
             |
             v
      Create Delivery
             |
             v
       Save to SQLite
             |
             v
      JSON Response
             |
             v
       Refresh Mobile UI
```

---

## 7. Application Workflow

The application supports the following restaurant delivery workflow:

1. Robot is displayed at the staging/docking station.
2. Staff enters or selects an order.
3. Staff submits a food-ready delivery request.
4. Backend validates the request.
5. Backend creates a delivery task.
6. The task is assigned or queued based on application state.
7. Staff confirms kitchen pickup arrival.
8. Staff confirms food loading.
9. Staff dispatches the delivery.
10. Staff records arrival at the destination.
11. Staff confirms customer handover.
12. Staff confirms completion.
13. The backend updates the delivery and robot application status.
14. The next queued delivery can be assigned, or the robot can enter the return-to-staging state.

### Delivery Status Sequence

```text
       ORDER READY
            |
            v
       TASK CREATED
            |
            v
   AWAITING FOOD LOADING
            |
            v
        FOOD LOADED
            |
            v
     EN ROUTE TO TABLE
            |
            v
      ARRIVED AT TABLE
            |
            v
    HANDOFF CONFIRMED
            |
            v
        COMPLETED
            |
            v
  RETURNING TO STAGING
            |
            v
          DOCKED
```

**Note:** The above sequence represents the application's simulated workflow. It does not represent confirmed physical robot movement.

---

## 8. Single and Multi-Delivery Management

Version 2 supports single and multi-delivery task creation.

### Single Delivery

A single delivery contains one order, one destination table, food items, and an assigned tray.

Example:

```json
{
  "order_id": "ORD-1001",
  "table_number": 5,
  "items": [
    "Burger",
    "French Fries"
  ],
  "tray": "Tray 1"
}
```

### Multi-Delivery

A multi-delivery batch contains multiple individual delivery tasks.

Example:

```json
{
  "mode": "multi",
  "items": [
    {
      "order_id": "ORD-2001",
      "table_number": 1,
      "items": ["Burger"],
      "tray": "Tray 1"
    },
    {
      "order_id": "ORD-2002",
      "table_number": 5,
      "items": ["Pasta"],
      "tray": "Tray 3"
    },
    {
      "order_id": "ORD-2003",
      "table_number": 10,
      "items": ["Pizza"],
      "tray": "Tray 2"
    }
  ]
}
```

### Validation Rules

- Single mode requires exactly one delivery.
- Multi mode requires at least two deliveries.
- Order IDs are required.
- Table numbers must be positive.
- Food item lists cannot be empty.
- Tray assignments must be valid.
- Duplicate table assignments are rejected within a batch.
- Duplicate tray assignments are rejected within a batch.
- Batch creation checks robot availability and battery level.
- The configured minimum battery requirement is 20%.

### Batch Processing

The backend creates the delivery batch and its associated delivery records.

- The first delivery is activated.
- Subsequent deliveries are queued.
- After a delivery is completed, the next eligible delivery in the batch is activated.
- After the batch is completed, the robot enters the return-to-staging workflow.

---

## 9. Backend Architecture

The backend entry point is:

```text
backend/main.py
```

### Main Responsibilities

- FastAPI application initialization.
- Database initialization.
- Request validation.
- Delivery management.
- Batch management.
- Robot status management.
- Queue processing.
- Event history.
- Delivery workflow validation.
- Exception and recovery workflow handling.

### Important Backend Functions

| Function | Responsibility |
|---|---|
| `connect()` | Opens SQLite database connection |
| `init_db()` | Creates and migrates database tables |
| `robot_row()` | Retrieves current robot information |
| `set_robot()` | Updates robot application state |
| `robot_json()` | Formats robot information |
| `event()` | Records delivery events |
| `delivery()` | Retrieves delivery details and history |
| `require_delivery()` | Validates delivery status |
| `active_robot()` | Checks current robot assignment |
| `assign_next_queued()` | Assigns the next eligible queued delivery |

### Robot Status Management

The backend maintains:

- Robot ID.
- Robot status.
- Current delivery ID.
- Robot location.
- Battery percentage.
- Updated timestamp.

### Delivery Status Management

The backend validates workflow transitions before updating delivery records.

For example, dispatching a delivery is allowed only after the food-loading confirmation and other required checks.

---

## 10. Database Architecture

NIA Version 2 uses SQLite for application data persistence.

Database file:

```text
backend/nia.db
```

### Database Tables

| Table | Purpose |
|---|---|
| `deliveries` | Stores individual delivery tasks |
| `delivery_batches` | Stores delivery batch information |
| `events` | Stores delivery events and status history |
| `robot` | Stores current robot application state |

### Deliveries Table

Maintains:

- Delivery ID.
- Order ID.
- Event ID.
- Batch ID.
- Tray number.
- Table number.
- Food items.
- Delivery status.
- Confirmation flags.
- Exception information.
- Creation and update timestamps.

### Delivery Batches Table

Groups individual delivery tasks and maintains batch status and timestamps.

### Events Table

Stores delivery actions and status changes with timestamps.

### Robot Table

Stores the current robot status, location, battery percentage, and active delivery assignment.

### Idempotency

The `/kds/food-ready` endpoint uses `event_id` to identify repeated requests.

If the same event is received again, the backend can return the existing task instead of creating a duplicate delivery.

### Database Initialization

The backend initializes and migrates the required database schema during application startup.

---

## 11. API Reference

### Base URL

Local development:

```text
http://127.0.0.1:8000
```

### General Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Application information |
| GET | `/health` | Backend health status |
| GET | `/robot` | Retrieve robot status |
| GET | `/deliveries` | Retrieve all deliveries |
| GET | `/deliveries/{did}` | Retrieve a specific delivery |
| GET | `/deliveries/{did}/history` | Retrieve delivery history |
| GET | `/history` | Retrieve recent global events |
| GET | `/queue` | Retrieve queued delivery information |
| GET | `/batches` | Retrieve delivery batches |

### Delivery Creation

| Method | Endpoint | Description |
|---|---|---|
| POST | `/kds/food-ready` | Create a delivery from a food-ready event |
| POST | `/batches` | Create a single or multi-delivery batch |

### Delivery Workflow Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/deliveries/{did}/pickup-arrived` | Confirm kitchen pickup arrival |
| POST | `/deliveries/{did}/pickup-confirm` | Confirm food loading |
| POST | `/deliveries/{did}/dispatch` | Dispatch delivery |
| POST | `/deliveries/{did}/arrive` | Record table arrival |
| POST | `/deliveries/{did}/handoff` | Confirm customer handover |
| POST | `/deliveries/{did}/station-confirm` | Confirm delivery completion |
| POST | `/deliveries/{did}/table-change` | Change destination table |
| POST | `/deliveries/{did}/cancel` | Cancel a delivery |
| POST | `/deliveries/{did}/route-blocked` | Record a blocked route |
| POST | `/deliveries/{did}/route-resume` | Resume the simulated route workflow |

### Robot and System Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/robot/returned` | Confirm return to staging |
| POST | `/robot/battery` | Update battery percentage |
| POST | `/system/outage` | Record a simulated system outage |
| POST | `/system/recover` | Recover from simulated outage |
| POST | `/ui-actions` | Record a frontend UI action |

### API Documentation

FastAPI automatically provides interactive API documentation.

Swagger UI:

```text
http://127.0.0.1:8000/docs
```

OpenAPI JSON:

```text
http://127.0.0.1:8000/openapi.json
```

Use Swagger UI to inspect request bodies, response schemas, and test API endpoints.

---

## 12. Mobile Application

The NIA mobile application is built using React Native, TypeScript, Expo, and Expo Router.

### Application Screens

**Login**

Provides the Admin and Staff demo login interface.

**Overview**

Displays:

- Robot readiness.
- Battery percentage.
- Robot status.
- Current location.
- Active deliveries.
- Queued deliveries.
- Last refresh time.

**Deliveries**

Displays delivery records retrieved from the backend.

**Robot Controls**

Provides application-level controls for robot status, battery updates, refresh, and simulated outage/recovery operations.

**User Workflow**

Provides:

- Single-delivery creation.
- Multi-delivery creation.
- Table selection.
- Tray assignment.
- Pickup confirmation.
- Food-loading confirmation.
- Delivery dispatch.
- Arrival confirmation.
- Handover confirmation.
- Delivery completion.
- Table changes and cancellation where allowed.

**API Events**

Displays the latest API response or error information for application debugging.

### Important Frontend Functions

| Function | Description |
|---|---|
| `request()` | Sends HTTP requests |
| `api()` | Handles API calls and response storage |
| `refresh()` | Refreshes robot and delivery information |
| `runAction()` | Executes application workflow actions |
| `createDelivery()` | Creates a single delivery |
| `createBatch()` | Creates multiple delivery tasks |
| `deliveryAction()` | Executes delivery actions |
| `updateTable()` | Changes the delivery destination |
| `updateBattery()` | Updates simulated battery percentage |
| `signIn()` | Handles demo login |
| `signOut()` | Handles logout |

---

## 13. Backend Setup

### Prerequisites

- Python 3.10 or compatible version.
- pip.
- Git.

### Clone Repository

```bash
git clone https://github.com/neuron-ai/nia-restaurant-robot-app.git
```

```bash
cd nia-restaurant-robot-app
```

### Navigate to Backend

```bash
cd backend
```

### Create Virtual Environment

Windows CMD:

```cmd
python -m venv .venv
```

### Activate Virtual Environment

```cmd
.venv\Scripts\activate.bat
```

### Install Dependencies

```bash
python -m pip install --upgrade pip
```

```bash
python -m pip install -r requirements.txt
```

### Start FastAPI Server

```bash
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Verify Backend

Open:

```text
http://127.0.0.1:8000/health
```

Open API documentation:

```text
http://127.0.0.1:8000/docs
```

---

## 14. Mobile Application Setup

Open another terminal from the repository root.

### Navigate to Mobile Application

```bash
cd nia-mobile
```

### Install Dependencies

```bash
npm ci
```

### Start Expo

```bash
npx expo start
```

Use the displayed QR code or an available Android emulator/development environment.

### Backend Connectivity

For a physical Android device, configure the API URL to use the reachable IP address of the backend computer or the deployed backend server.

Do not use `127.0.0.1` as the remote computer's address from a physical phone.

---

## 15. Frontend Configuration

The mobile application uses the environment variable:

```text
EXPO_PUBLIC_API_URL
```

Example local configuration:

```env
EXPO_PUBLIC_API_URL=http://YOUR_BACKEND_HOST:8000
```

Replace `YOUR_BACKEND_HOST` with the correct backend address.

The application uses this URL for its HTTP requests.

---

## 16. API Testing

Start the backend before executing API tests.

### Check Backend Health

```bash
curl http://127.0.0.1:8000/health
```

### Retrieve Robot Information

```bash
curl http://127.0.0.1:8000/robot
```

### Retrieve Deliveries

```bash
curl http://127.0.0.1:8000/deliveries
```

### Create a Delivery

Windows CMD:

```cmd
curl -X POST "http://127.0.0.1:8000/kds/food-ready" -H "Content-Type: application/json" -d "{\"order_id\":\"ORD-1001\",\"table_number\":5,\"items\":[\"Burger\",\"Fries\"],\"source\":\"KDS\",\"tray\":\"Tray 1\"}"
```

### Retrieve Batches

```bash
curl http://127.0.0.1:8000/batches
```

### Interactive API Testing

Open:

```text
http://127.0.0.1:8000/docs
```

Swagger UI can be used to test the available backend endpoints.

---

## 17. Development Guidelines

### Pull Latest Changes

```bash
git pull origin main
```

### Check Repository Status

```bash
git status
```

### Install Backend Dependencies

```bash
pip install -r backend/requirements.txt
```

### Install Mobile Dependencies

```bash
cd nia-mobile
npm ci
```

### Start Mobile Application

```bash
npx expo start
```

### Commit Changes

```bash
git add <required-files>
git commit -m "Describe the application update"
```

### Push Changes

```bash
git push origin main
```

Use the team's agreed Git workflow when multiple developers are working on the repository.

Do not commit generated environments, local databases, caches, or device logs unless they are explicitly required.

---

## 18. Current Implementation Status

| Component | Status |
|---|---|
| FastAPI backend | Implemented |
| REST API | Implemented |
| SQLite database | Implemented |
| Delivery creation | Implemented |
| Single-delivery workflow | Implemented |
| Multi-delivery batches | Implemented |
| Table assignment | Implemented |
| Tray assignment | Implemented |
| Delivery queue management | Implemented |
| Event history | Implemented |
| Robot application status | Implemented with simulated state |
| Battery status management | Implemented with simulated state |
| React Native mobile application | Implemented |
| Expo configuration | Implemented |
| Android network configuration plugin | Added |
| Physical robot execution | Not part of the current application implementation |

---

## Repository Information

**Project:** NIA Restaurant Robot App

**Version:** 2.0.0

**GitHub Repository:**  
https://github.com/neuron-ai/nia-restaurant-robot-app

**Main Branch:** `main`

---

## Project Summary

NIA Version 2 provides an application-level platform for managing restaurant delivery operations.

It includes a FastAPI backend, SQLite database, and React Native mobile application with delivery creation, batch management, table and tray assignment, queue processing, robot status management, and delivery history.

The current implementation focuses on the restaurant application workflow and its backend–frontend communication.
