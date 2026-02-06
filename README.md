# ShedForge

**ShedForge** is a constraint-driven academic timetable scheduling platform that applies optimization and heuristic methods to generate, analyze, and adapt institutional timetables while ensuring **workload fairness** and **operational feasibility**.

The system is built as a **full-stack monorepo**, combining a modern React-based frontend with a FastAPI backend for scalable scheduling, analytics, and conflict resolution.

---

## Key Features

- Automated timetable generation using optimization techniques
- Constraint intelligence (faculty availability, room capacity, lab continuity, elective overlap)
- Faculty workload analytics and fairness metrics
- Alternative schedule generation and comparison
- Conflict detection and resolution dashboard
- Exportable schedules for administrative use
- Modular, extensible monorepo architecture

---

## Optimization Approach

ShedForge uses a **Genetic Algorithm with Local Search** to iteratively evolve feasible timetables:

- Constraint satisfaction scoring
- Fitness-based selection
- Local refinement to minimize conflicts
- Multiple alternatives generated for comparison

This hybrid approach balances solution quality and computation time, making it suitable for real-world academic datasets.

---

## Tech Stack

### Frontend
- React
- TypeScript
- Tailwind CSS
- Next.js
- Chart-based analytics dashboards

### Backend
- FastAPI (Python)
- Pydantic for data validation
- Modular service-based architecture

### Database
- Relational database via ORM models
- Migration and seeding support

### Tooling & DevOps
- Node.js (LTS)
- npm
- GitHub Actions (CI-ready)

---

## Project Structure
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

---

## Getting Started

### Prerequisites

- Node.js (LTS v24.x)
- Python 3.10+
- npm

---


### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Frontend runs at:
```
http://localhost:3000
```

### Backend Setup
```
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Backend runs at:
```
http://localhost:8000
```
---
## Dashboard Highlights
- Optimization summary with constraint satisfaction metrics
- Faculty workload analytics (min / max / average hours)
- Weekly timetable preview
- Conflict resolution panel
---

## Environment Variables
```
DATABASE_URL=
SECRET_KEY=
```
---
## Testing
```
cd backend
pytest
```

