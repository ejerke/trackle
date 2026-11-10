#!/usr/bin/env bash
# Deploy the latest master on the server. Run as the app owner:
#   sudo -u trackle /opt/trackle/deploy/deploy.sh            # deploy origin/master
#   sudo -u trackle /opt/trackle/deploy/deploy.sh <commit>   # deploy (or roll back to) a commit
#
# Steps: fetch → install → test → build → back up the database → restart
# (migrations run on start) → wait for the health check. Stops at the first
# failure, before touching the running service when possible.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/trackle}"
TARGET="${1:-origin/master}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
export DATABASE_PATH="${DATABASE_PATH:-/var/lib/trackle/trackle.db}"
export BACKUP_DIR="${BACKUP_DIR:-/var/lib/trackle/backups}"

cd "$APP_DIR"
echo "==> Fetching"
git fetch --quiet origin
previous="$(git rev-parse --short HEAD)"
git checkout --quiet --detach "$TARGET"
echo "    $previous -> $(git rev-parse --short HEAD)"

echo "==> Installing dependencies"
npm ci --no-audit --no-fund

echo "==> Testing"
npm test --silent

echo "==> Building web app"
npm run build --silent

if [[ -f "$DATABASE_PATH" ]]; then
  echo "==> Backing up database"
  npm run backup --silent
fi

echo "==> Restarting service"
sudo systemctl restart trackle

echo "==> Waiting for health check"
for _ in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "Deployed $(git rev-parse --short HEAD)."
    exit 0
  fi
  sleep 1
done
echo "Health check failed. Logs: journalctl -u trackle -n 100" >&2
echo "Roll back with: $0 $previous   (restore the DB backup too if a migration ran)" >&2
exit 1
