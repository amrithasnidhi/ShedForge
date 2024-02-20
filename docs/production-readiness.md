# ShedForge Production Readiness Guide

## Minimum Startup Sequence

1. Configure environment variables in `backend/.env` (database, JWT, SMTP, CORS).
2. Run migrations:
   - `alembic upgrade head`
3. Start backend:
   - `python -m uvicorn app.main:app --app-dir backend`
4. Verify readiness:
   - `GET /api/health/ready`
   - Expect `200` and `status: "ok"`.

## Security and Hardening

- Auth endpoints are rate-limited (`/register`, `/login`, `/login/request-otp`, `/login/verify-otp`, `/password/forgot`, `/password/reset`).
- Request size limiting is enabled through middleware.
- Security headers are enabled (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).
- Optional HSTS is configurable via:
  - `SECURITY_ENABLE_HSTS`
  - `SECURITY_HSTS_MAX_AGE_SECONDS`

## Email Diagnostics

- Admin/Scheduler can inspect SMTP status:
  - `GET /api/settings/smtp/config`
- Admin/Scheduler can send test email:
  - `POST /api/settings/smtp/test`

## CI

GitHub Actions workflows:
- `.github/workflows/ci.yml`
  - Backend tests (`pytest`)
  - Frontend typecheck + tests + build (`pnpm`)
  - Docker build verification for backend/frontend images
- `.github/workflows/security.yml`
  - Dependency review on pull requests
  - CodeQL static analysis on push/PR + weekly schedule
- `.github/workflows/cd.yml`
  - Builds and publishes versioned backend/frontend images to GHCR
  - Auto-deploys to `staging` after successful `CI` on `main`
  - Supports manual `staging` / `production` deployments
Deployment runbook:
- `ops/README.md`
- `ops/deploy/.env.remote.example`

## Containers

Local production-like stack:
- `docker compose up --build`
- Services:
  - Backend: `http://localhost:8000`
  - Frontend: `http://localhost:3000`
  - MailHog UI: `http://localhost:8025`

## Release Gate Checklist

- `GET /api/health/ready` returns `200`.
- `python -m pytest -q backend/tests` passes.
- `cd frontend && pnpm -s exec tsc --noEmit` passes.
- `cd frontend && pnpm -s exec jest --ci --runInBand --passWithNoTests` passes.
- `cd frontend && pnpm run build` passes.
- OTP and SMTP test email verified in staging.
- Staging deployment healthy after `CD` rollout.
