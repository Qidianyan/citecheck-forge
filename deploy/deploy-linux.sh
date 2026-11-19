#!/usr/bin/env bash
# Deploy the CiteCheck web companion (static) to a target Linux host, bound to 127.0.0.1 only.
# Runs an isolated loopback container (127.0.0.1:<port>) with backup + rollback.
# Public ingress exposure requires explicit maintainer authorization.
#
# Usage (from a machine that can `ssh linux`, e.g. the team build Mac, inside the repo):
#   node web/build.mjs && bash deploy/deploy-linux.sh
# Env: HOST (default linux), PORT (default 5414), NAME (default citecheck-web)
set -euo pipefail
HOST="${HOST:-linux}"; PORT="${PORT:-5414}"; NAME="${NAME:-citecheck-web}"
REMOTE_DIR="projects/${NAME}"; IMAGE="nginx:1.27-alpine"
cd "$(dirname "$0")/.."
[ -f web/dist/index.html ] || { echo "web/dist missing: run node web/build.mjs first" >&2; exit 1; }
# refuse to ship anything that looks secret
if grep -rIlE "(sk-[A-Za-z0-9]{20,}|ghp_|github_pat_|BEGIN [A-Z ]*PRIVATE KEY|_API_KEY=)" web/dist; then
  echo "secret-like string in web/dist; aborting" >&2; exit 1; fi
TS=$(date +%Y%m%d-%H%M%S)
ssh "$HOST" "mkdir -p ~/${REMOTE_DIR} ~/backups && if [ -d ~/${REMOTE_DIR}/dist ]; then tar czf ~/backups/${NAME}-dist-${TS}.tgz -C ~/${REMOTE_DIR} dist; fi"
rsync -az --delete --exclude '._*' web/dist/ "$HOST:${REMOTE_DIR}/dist/"
cp deploy/nginx.conf /tmp/${NAME}-nginx.conf && rsync -az /tmp/${NAME}-nginx.conf "$HOST:${REMOTE_DIR}/nginx.conf"
rsync -az --delete web/server/ "$HOST:${REMOTE_DIR}/server/"
ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
if ss -ltn | grep -q "127.0.0.1:${PORT} " && ! docker ps --format '{{.Names}}' | grep -qx "${NAME}"; then
  echo "port ${PORT} is used by something else; aborting" >&2; exit 1; fi
docker network inspect citecheck-net >/dev/null 2>&1 || docker network create citecheck-net >/dev/null
# Advisory API env: OFF by default. Any key lives only in this chmod 600 file and is never in git.
mkdir -p ~/${REMOTE_DIR}/secrets && chmod 700 ~/${REMOTE_DIR}/secrets
[ -f ~/${REMOTE_DIR}/secrets/advisory.env ] || printf 'ADVISORY_ENABLED=0\nADVISORY_DAILY_CAP=200\n' > ~/${REMOTE_DIR}/secrets/advisory.env
chmod 600 ~/${REMOTE_DIR}/secrets/advisory.env
if docker ps -a --format '{{.Names}}' | grep -qx "citecheck-api"; then docker rm -f citecheck-api >/dev/null; fi
docker run -d --name citecheck-api --restart unless-stopped --network citecheck-net \
  --env-file \$HOME/${REMOTE_DIR}/secrets/advisory.env -e HOST=0.0.0.0 -e PORT=8080 \
  -v \$HOME/${REMOTE_DIR}/server:/app/server:ro -v \$HOME/${REMOTE_DIR}/dist:/app/dist:ro \
  --read-only --cap-drop ALL --security-opt no-new-privileges --memory 128m \
  node:22-alpine node /app/server/server.mjs >/dev/null
if docker ps -a --format '{{.Names}}' | grep -qx "${NAME}"; then docker rm -f "${NAME}" >/dev/null; fi
docker run -d --name "${NAME}" --restart unless-stopped --network citecheck-net \
  -p 127.0.0.1:${PORT}:80 \
  -v \$HOME/${REMOTE_DIR}/dist:/usr/share/nginx/html:ro \
  -v \$HOME/${REMOTE_DIR}/nginx.conf:/etc/nginx/conf.d/default.conf:ro \
  ${IMAGE} >/dev/null
sleep 1
for p in / /playground.html /BUILD.json /api/advisory/status; do
  printf '%s %s\n' "\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${PORT}\$p)" "\$p"; done
echo "deployed ${NAME} -> http://127.0.0.1:${PORT} (127.0.0.1 only; public via the existing citecheck tunnel ingress)" | tee -a ~/${REMOTE_DIR}/deploy.log
REMOTE
