# ShedForge 🧠📅

**ShedForge** is a constraint-driven academic timetable scheduling platform that applies optimization and heuristic methods to generate, analyze, and adapt institutional timetables while ensuring **workload fairness** and **operational feasibility**.

The system is built as a **full-stack monorepo**, combining a modern React-based frontend with a FastAPI backend for scalable scheduling, analytics, and conflict resolution.

---

## ✨ Key Features

- Automated timetable generation using optimization techniques
- Constraint intelligence (faculty availability, room capacity, lab continuity, elective overlap)
- Faculty workload analytics and fairness metrics
- Alternative schedule generation and comparison
- Conflict detection and resolution dashboard
- Exportable schedules for administrative use
- Modular, extensible monorepo architecture

---

## 🧠 Optimization Approach

ShedForge uses a **Genetic Algorithm with Local Search** to iteratively evolve feasible timetables:

- Constraint satisfaction scoring
- Fitness-based selection
- Local refinement to minimize conflicts
- Multiple alternatives generated for comparison

This hybrid approach balances solution quality and computation time, making it suitable for real-world academic datasets.

---

## 🖥️ Tech Stack

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

## 📁 Project Structure

