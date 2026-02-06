# ShedForge
SchedForge is a constraint-driven academic scheduling platform that applies optimization and heuristic methods to generate, analyze, and adapt institutional timetables while ensuring workload fairness and operational feasibility.

## Project structure
This repository is organized as a monorepo. Place the React + Tailwind frontend inside `frontend/`.

```
backend/           # FastAPI backend
  app/
    api/           # API routes
      v1/          # Versioned endpoints
    core/          # Settings, config, security
    db/            # DB session, base, init
    models/        # ORM models
    schemas/       # Pydantic schemas
    services/      # Business logic
  tests/           # Backend tests
frontend/          # React + Tailwind app (teammate should push here)
database/          # DB migrations/seeds
ci/                # CI/CD configs (GitHub Actions, etc.)
docs/              # Project documentation
scripts/           # Helper scripts
```

## Verified by Amritha
