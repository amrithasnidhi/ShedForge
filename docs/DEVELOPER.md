# Developer Documentation

## Architecture Overview
ShedForge is a full-stack university timetable scheduling platform.

### Backend (FastAPI + Python)
- **Framework**: FastAPI
- **Database**: PostgreSQL (via SQLAlchemy & Alembic)
- **Auth**: JWT & Email OTP
- **Core Logic**: Evolutionary Algorithm for Timetable Generation (`app/core/engine`)

### Frontend (Next.js + TypeScript)
- **Framework**: Next.js 14+ (App Router)
- **UI**: Tailwind CSS + Radix UI (shadcn/ui)
- **State**: React Server Components & Client Hooks

## Setup & Installation

### Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL
- Docker (Optional)

### Backend Setup
1. `cd backend`
2. `python -m venv .venv`
3. `source .venv/bin/activate`
4. `pip install -r requirements.txt`
5. Configure `.env` (copy from `.env.example`)
6. Run migrations: `alembic upgrade head`
7. Start server: `python -m uvicorn app.main:app --reload`

### Frontend Setup
1. `cd frontend`
2. `npm install`
3. Configure `.env.local`
4. Start dev server: `npm run dev`

## Key Workflows
- **Conflict Resolution**: Detected via `ConflictService` in backend. UI in `frontend/app/(dashboard)/conflicts`.
- **Timetable Generation**: Triggered via `POST /api/generate`. Async process.

## Troubleshooting
- **Database Connection**: Ensure `DATABASE_URL` is correct in `backend/.env`.
- **SMTP Errors**: Check `SMTP_` variables. Use `LOGIN_OTP_LOG_TO_TERMINAL=true` for local dev without email.
