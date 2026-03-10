#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_PATH:?DEPLOY_PATH is required}"
: "${GHCR_USERNAME:?GHCR_USERNAME is required}"
: "${GHCR_PAT:?GHCR_PAT is required}"
: "${BACKEND_IMAGE:?BACKEND_IMAGE is required}"
: "${FRONTEND_IMAGE:?FRONTEND_IMAGE is required}"

cd "${DEPLOY_PATH}"

if [[ ! -f ".env" ]]; then
  echo "Missing ${DEPLOY_PATH}/.env. Create it from ops/deploy/.env.remote.example before deploying."
  exit 1
fi

if [[ ! -f "docker-compose.remote.yml" ]]; then
  echo "Missing ${DEPLOY_PATH}/docker-compose.remote.yml"
  exit 1
fi

echo "${GHCR_PAT}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin

export BACKEND_IMAGE
export FRONTEND_IMAGE

docker compose --env-file .env -f docker-compose.remote.yml pull
docker compose --env-file .env -f docker-compose.remote.yml up -d --remove-orphans

if [[ -n "${HEALTHCHECK_URL:-}" ]]; then
  curl --fail --silent --show-error "${HEALTHCHECK_URL}" >/dev/null
fi

docker image prune -f >/dev/null 2>&1 || true
