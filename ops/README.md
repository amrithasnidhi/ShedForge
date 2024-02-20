# Operations Runbook

## Deployment Layout

- `ops/deploy/docker-compose.remote.yml`: production/staging runtime stack used by CD.
- `ops/deploy/deploy.sh`: idempotent remote deploy script.
- `ops/deploy/.env.remote.example`: template for remote environment variables.

## GitHub Environments

Create two GitHub environments:

- `staging`
- `production`

Store the same secret names in each environment, with environment-specific values:

- `DEPLOY_HOST`: remote server hostname or IP.
- `DEPLOY_USER`: SSH user for deployment.
- `DEPLOY_SSH_KEY`: private SSH key (PEM format).
- `DEPLOY_PATH`: absolute deployment directory on the remote host.
- `GHCR_USERNAME`: GitHub username/org with package read permission.
- `GHCR_PAT`: Personal Access Token with `read:packages` scope.
- `HEALTHCHECK_URL`: full URL for post-deploy health probe (optional).

## Remote Host Prerequisites

Install these on the deployment host:

- Docker Engine
- Docker Compose v2 plugin
- `curl`

Prepare deployment directory:

1. `mkdir -p <DEPLOY_PATH>`
2. Copy `ops/deploy/.env.remote.example` to `<DEPLOY_PATH>/.env` and replace values.

## Release Flow

1. Open PR to `main`.
2. `CI` and `Security` workflows validate quality and security.
3. Merge to `main`.
4. `CD` auto-builds and pushes backend/frontend images to GHCR.
5. `CD` auto-deploys to `staging`.
6. Trigger manual `CD` run with `deploy_target=production` for production rollout.

## Rollback

1. In GitHub Actions, run `CD` manually.
2. Set `deploy_target` to the desired environment.
3. Set `image_tag` to a previous known-good tag (for example `sha-<commit_sha>`).
4. Run workflow.
