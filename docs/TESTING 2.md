# Unit Testing Documentation

## Overview
ShedForge maintains a high standard of code quality through comprehensive unit testing.

## Backend Testing
We use **pytest** for backend testing.

### Running Tests
Execute from the project root:
```bash
export PYTHONPATH=$PYTHONPATH:$(pwd)/backend
.venv/bin/python -m pytest backend/tests
```

### Coverage
- **Core Services**: Conflict Detection, Evolutionary Engine.
- **API Routes**: Auth, Timetable, Academic Entities.
- **Utilities**: Email, Validation.

## Frontend Testing
We use **Jest** and **React Testing Library**.

### Running Tests
Execute from `frontend` directory:
```bash
cd frontend
npm test
```

### Scope
- **Components**: UI components in `components/ui`.
- **Smoke Tests**: Basic rendering verification.
- **Future Work**: Integration tests for complex flows.
