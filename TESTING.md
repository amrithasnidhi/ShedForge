# Testing Guide

## Overview

This project uses `pytest` for backend testing. Tests cover unit logic, service integration, and API endpoints (via mocks).

## Running Tests

To run all tests, ensure you are in the root directory and the virtual environment is activated.

```bash
# Run all tests
PYTHONPATH=./backend .venv/bin/pytest

# Run specific test file
PYTHONPATH=./backend .venv/bin/pytest backend/tests/test_conflict_service.py
```

## Test Structure

- **`backend/tests/test_conflict_service.py`**: Unit tests for `ConflictService`. Verifies detection logic for room conflicts, capacity issues, and faculty overlaps. Note: Mocks `OfficialTimetablePayload` and resources.
- **`backend/tests/test_scheduler_error.py`**: Verifies the custom `SchedulerError` exception class structure.
- **`backend/tests/test_api_integration.py`**: Integration tests for API endpoints (e.g., `/api/conflicts/detect`). Uses `unittest.mock` to bypass database and authentication dependencies.
- **`backend/tests/test_performance.py`**: Performance benchmark for the Evolution Scheduler.

## Mocks & Fixtures

- **Database**: API tests use `app.dependency_overrides` to mock `get_db` and return `MagicMock` sessions.
- **Authentication**: API tests override `get_current_user` to return a mocked Admin user, bypassing JWT validation.

## Adding New Tests

When adding new tests for API routes:
1. Import `app` from `app.main`.
2. Patch `app.db.bootstrap.ensure_runtime_schema_compatibility` to avoid DB connection on startup.
3. Use `app.dependency_overrides` to mock `get_db` and `get_current_user`.
