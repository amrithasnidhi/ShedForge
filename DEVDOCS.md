# Developer Documentation (DevDocs)

## Project Structure

- **`backend/`**: FastAPI application.
    - **`app/main.py`**: Entry point. Contains global exception handlers.
    - **`app/api/`**: API routes and dependencies.
    - **`app/core/`**: Core configurations, exceptions, security.
    - **`app/services/`**: Business logic (Scheduler, Conflicts).
    - **`app/models/`**: SQLAlchemy models.
    - **`app/schemas/`**: Pydantic schemas.
    - **`tests/`**: Unit and Integration tests.
- **`frontend/`**: Next.js application.
    - **`app/`**: App router pages.
    - **`components/`**: React components (UI, Dashboard, Timetable).
    - **`lib/`**: Utilities and API clients (`timetable-api.ts`, `timetable-types.ts`).

## Key Components

### 1. Evolution Scheduler (`backend/app/services/evolution_scheduler.py`)
- Implements the core constructive heuristic for timetable generation.
- Uses `SchedulerError` for structured error reporting.
- **Key Methods**: `generate()`, `_generate_schedule()`, `_assign_slot()`.

### 2. Conflict Service (`backend/app/services/conflict_service.py`)
- Detects conflicts in `OfficialTimetablePayload` (Draft or Published).
- Checks for:
    - **Room Overlaps**: Multiple courses in same room at same time.
    - **Faculty Overlaps**: Faculty assigned multiple classes at same time.
    - **Capacity Issues**: Student count exceeds room capacity.
- Supports generating resolution suggestions (move, swap, change room).

### 3. API Integration
- **`timetable-api.ts`**: Frontend API client.
- **`timetable-types.ts`**: Shared TypeScript interfaces mirroring backend Pydantic models.

## Error Handling

- **Backend**: Uses `AppError` base class.
    - `SchedulerError`: For scheduling logic failures.
    - `ResourceNotFoundError`: For missing DB entities.
    - `ConstraintError`: For validation failures.
- **Global Handler**: `app_error_handler` in `main.py` converts exceptions to standard JSON error responses.

## Development Workflow

1. **Install Dependencies**: `pip install -r backend/requirements.txt`, `npm install`.
2. **Run Backend**: `uvicorn app.main:app --reload` (Port 8000).
3. **Run Frontend**: `npm run dev` (Port 3000).
4. **Run Tests**: See `TESTING.md`.

## Database
- Uses PostgreSQL (via `psycopg`).
- Migrations managed by `alembic` (if configured) or `bootstrap.py` for schema compatibility.
