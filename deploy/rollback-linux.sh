#!/usr/bin/env bash
# Stop the web companion container by name (never a broad kill). Optional: restore a dist backup.
#   bash deploy/rollback-linux.sh                 # stop + remove container
#   BACKUP=citecheck-web-dist-YYYYmmdd-HHMMSS.tgz bash deploy/rollback-linux.sh   # restore dist, restart
set -euo pipefail
HOST="${HOST:-linux}"; NAME="${NAME:-citecheck-web}"
if [ -n "${BACKUP:-}" ]; then
  ssh "$HOST" "cd ~/projects/${NAME} && rm -rf dist && tar xzf ~/backups/${BACKUP} && docker restart ${NAME}"
else
  ssh "$HOST" "docker rm -f ${NAME}"
fi
