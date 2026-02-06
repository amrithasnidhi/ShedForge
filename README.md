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
---
## System Architecture

ShedForge follows a modular full-stack architecture designed for scalability and clear separation of concerns.

- The **frontend** is a React + Next.js application responsible for user interaction, visualization, and configuration of scheduling inputs.
- The **backend** is a FastAPI service that handles constraint modeling, optimization logic, analytics computation, and API exposure.
- The **optimization engine** resides in the backend services layer and applies heuristic and genetic search techniques to generate feasible timetables.
- The frontend communicates with the backend through RESTful APIs.


---
## Usage Instructions

Once the system is running, the typical workflow is as follows:

1. Access the application via the dashboard at `http://localhost:3000`.
2. Define academic data such as:
   - Faculty members and availability
   - Courses and credit structures
   - Rooms and capacity constraints
3. Configure scheduling constraints including workload limits, lab continuity, and elective overlap rules.
4. Use the **Generate Timetable** option to produce an optimized schedule.
5. Review the generated timetable and system-reported conflicts.
6. Generate alternative schedules if required and compare them using built-in analytics.
7. Resolve conflicts manually or regenerate schedules with adjusted constraints.
8. Export finalized schedules for administrative use.

---
## Configuration and Constraints

ShedForge supports multiple academic and operational constraints, including:

- Faculty availability and workload limits
- Room capacity and allocation rules
- Lab session continuity
- Elective overlap prevention
- Section-wise timetable consistency


---
## Limitations and Assumptions

- The system assumes a single-institution scheduling context.
- Optimization performance depends on dataset size and constraint complexity.
- Cross-campus or multi-university scheduling is outside the current scope.

---

## Contribution Guidelines

- Follow a feature-based or module-based development approach.
- Ensure frontend and backend changes are tested independently.
- Use meaningful commit messages describing the change scope.
- Avoid committing generated files or environment-specific artifacts.

---
## Future Enhancements

- Support for multi-department and multi-campus scheduling
- Real-time constraint tuning and live re-optimization
- Cloud deployment with persistent storage
- Advanced analytics for long-term workload planning

---
## License and Usage

This project is developed for academic and educational purposes.
It may be extended or adapted for research and non-commercial use.

---
## Authors
```
AMRITHA S NIDHI - CB.SC.U4CSE23404
SHOLINGARAM HEMANTH - CB.SC.U4CSE23446
TEJAESHWAR RAGURAMCHANDRAM - CB.SC.U4CSE23451
VARADA VISHWANADHA SUBRAHMANYA VAMSI - CB.SC.U4CSE23454
YELLA REDDY KALUVAI - CB.SC.U4CSE23463
```
---









