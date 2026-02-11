# Comprehensive Testing Strategy - ShedForge

This document establishes the formal testing strategy for the ShedForge Timetable Optimization System. It details the methodologies, tools, and properties verified across all layers of the application.

## 1. Testing Objectives

The primary goal of this strategy is to ensure:
- **Correctness**: The scheduling algorithm respects all 13 hard and soft constraints.
- **Reliability**: API endpoints handle edge cases, malformed data, and concurrent requests gracefully.
- **Security**: Role-Based Access Control (RBAC) is strictly enforced at the database and API layers.
- **Performance**: The evolutionary engine generates feasible schedules for large datasets (e.g., 50+ rooms, 100+ faculty) within acceptable timeframes (<10s).

---

## 2. Component Testing Matrix

| Component | Test Kind | Properties Verified | Tools/Frameworks |
| :--- | :--- | :--- | :--- |
| **Scheduling Engine** | Unit & Benchmark | Constraint satisfaction, Fitness scoring, Speed, Convergence | `pytest`, `perf_counter` |
| **API Layer** | Integration | HTTP status codes, Schema validation (Pydantic), Response consistency | `pytest`, `httpx`, `FastAPI TestClient` |
| **Data Layer** | Unit & Integration | Relationship integrity, CRUD operations, Migration stability | `SQLAlchemy`, `Alembic`, `pytest-sqlite` |
| **Auth & RBAC** | Integration | Token validation, Permission isolation, Inactive user handling | `python-jose`, `passlib`, `pytest` |
| **UI Components** | Unit & Snapshot | Render correctness, State management, Interactive response | `Vitest`, `React Testing Library` (Proposed) |
| **Timetable Grid** | Manual/Visual | Layout responsiveness, Filtering accuracy, Export quality | Browser Developer Tools |

---

## 3. Detailed Component Breakdown

### 3.1 Backend: Core Scheduling & API
Backend testing is the most critical layer, ensuring the validity of generated timetables.

#### **Unit Testing**
- **Focus**: `ConflictService`, `EvolutionaryScheduler`, and `PatchScheduler`.
- **Properties**: Hard conflict detection (Faculty/Room/Student overlaps), soft constraint scoring (workload balance).
- **Framework**: `pytest`.

#### **Integration Testing**
- **Focus**: API Routes (`/api/timetable`, `/api/generator`).
- **Properties**: Payload contract compliance, database persistence, and internal service orchestration.
- **Framework**: `FastAPI` with `TestClient` (Simulated requests).

#### **Behavioral Testing**
- **Focus**: Role-Based Access Control.
- **Properties**: Student/Faculty scoping (ensure they can only see their own sections/schedules).
- **Framework**: Custom Pytest fixtures to inject different user roles.

### 3.2 Backend: Performance Benchmarking
- **Focus**: `evolutionary_engine`.
- **Properties**: Execution time under various load conditions (Single Term vs. Full Cycle).
- **Metric**: Execution duration and Pareto front quality (fitness vs. conflicts).
- **Tool**: Custom timing decorators within the test suite.

### 3.3 Frontend: Next.js Portal
- **Focus**: Dashboard, Grid Preview, and Conflict Dashboard.
- **Properties**: Redux/State consistency, conditional rendering based on user role, and filter persistence.
- **Proposed Tools**: `Vitest` for fast unit tests and `Playwright` for critical user path E2E (e.g., "Publish Anyway" flow).

---

## 4. Verification & Validation (V&V) Tools

| Category | Library/Tool | Usage |
| :--- | :--- | :--- |
| **Framework** | `pytest` | Primary test runner and assertion framework. |
| **Mocking** | `unittest.mock` | Simulating external dependencies (SMTP, DB sessions). |
| **API Client** | `httpx` | Asynchronous HTTP client for testing endpoints. |
| **ORM/DB** | `SQLAlchemy` | Ensuring schema compliance and query accuracy. |
| **Evolutionary** | `EvolutionaryScheduler` | Self-validating constraint satisfaction checks. |
| **Manual** | Browser Tools | Network monitoring, Hydration checks, and Console audits. |

---

## 5. Execution Protocol

### 5.1 Automated Pipeline
All backend tests are executed via:
```bash
export PYTHONPATH=$PYTHONPATH:backend
pytest backend/tests/
```

### 5.2 Constraint Audits
For every generated schedule, the system performs a runtime "Sanity Check" that verifies:
1. No hard overlaps (Room/Faculty/Section).
2. Credit counts match program requirements.
3. Lunch break and session type rules (Theory vs. Lab) are met.
