#!/usr/bin/env bash
# Deploy Trackle on the server. Run as the app owner (see docs/deployment.md):
#
#   deploy.sh            deploy origin/production (the last commit CI passed)
#                        and resume automatic deploys
#   deploy.sh <commit>   deploy (or roll back to) a specific commit and PAUSE
#                        automatic deploys, so the timer doesn't undo it
#   deploy.sh --auto     what trackle-deploy.timer runs: deploy
#                        origin/production only if it moved, unless paused or
#                        that commit already failed
#
# Layout under $APP_DIR:
#   repo.git/            bare clone of the GitHub repo
#   releases/<sha>/      one immutable folder per deployed commit
#   current -> releases/<sha>   what the service runs; switched atomically
#   HOLD                 present = automatic deploys paused
#   last-failed          commit whose deploy failed (auto mode won't retry it)
#
# Each release is built in its own folder while the old one keeps serving,
# so a deploy never changes files under a running server. Rolling back to a
# release that's still on disk skips the build and takes seconds.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/trackle}"
REPO="$APP_DIR/repo.git"
RELEASES="$APP_DIR/releases"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
# Overridable so the script can be tried out locally without systemd.
RESTART_CMD="${RESTART_CMD:-sudo systemctl restart trackle}"
export DATABASE_PATH="${DATABASE_PATH:-/var/lib/trackle/trackle.db}"
export BACKUP_DIR="${BACKUP_DIR:-/var/lib/trackle/backups}"

log() { echo "==> $*"; }

current_sha() {
  if [[ -L "$APP_DIR/current" ]]; then basename "$(readlink "$APP_DIR/current")"; fi
}

# Point `current` at a release with a rename, which is atomic: there is never
# a moment without a valid `current`.
switch_to() {
  ln -sfn "releases/$1" "$APP_DIR/current.tmp"
  mv -T "$APP_DIR/current.tmp" "$APP_DIR/current"
}

restart_and_check() {
  # 9>&-: don't hand the deploy lock to whatever the restart starts.
  $RESTART_CMD 9>&- || return 1
  for _ in $(seq 1 30); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

build_release() {
  local sha="$1" dir="$RELEASES/$1"
  if [[ -f "$dir/.complete" ]]; then
    log "Release ${sha:0:7} is already built"
    return
  fi
  rm -rf "$dir"
  mkdir -p "$dir"
  # Called from an `if`, where bash ignores `set -e`: every step checks itself.
  log "Unpacking ${sha:0:7}"
  git --git-dir="$REPO" archive "$sha" | tar -x -C "$dir" || return 1
  log "Installing dependencies"
  (cd "$dir" && npm ci --no-audit --no-fund) || return 1
  log "Testing"
  (cd "$dir" && npm test --silent) || return 1
  log "Building web app"
  (cd "$dir" && npm run build --silent) || return 1
  touch "$dir/.complete"
}

# Keep the newest $KEEP_RELEASES releases (by build time), never `current`.
prune_releases() {
  local keep_sha
  keep_sha="$(current_sha)"
  ls -1t "$RELEASES" | tail -n +"$((KEEP_RELEASES + 1))" | while read -r old; do
    [[ "$old" == "$keep_sha" ]] && continue
    log "Removing old release ${old:0:7}"
    rm -rf "${RELEASES:?}/$old"
  done
}

main() {
  local mode="manual" target="origin/production"
  case "${1:-}" in
    --auto) mode="auto" ;;
    "") ;;
    *) mode="pinned"; target="$1" ;;
  esac

  # One deploy at a time (the timer and a manual run could overlap).
  exec 9>"$APP_DIR/.deploy.lock"
  if ! flock -n 9; then
    [[ "$mode" == auto ]] && exit 0
    echo "Another deploy is running." >&2
    exit 1
  fi

  if [[ "$mode" == auto && -f "$APP_DIR/HOLD" ]]; then exit 0; fi

  git --git-dir="$REPO" fetch --quiet --prune origin '+refs/heads/*:refs/remotes/origin/*'
  local sha previous
  sha="$(git --git-dir="$REPO" rev-parse --verify "$target^{commit}")"
  previous="$(current_sha)"

  if [[ "$mode" == auto ]]; then
    [[ "$sha" == "$previous" ]] && exit 0
    [[ "$sha" == "$(cat "$APP_DIR/last-failed" 2>/dev/null)" ]] && exit 0
  fi

  log "Deploying ${sha:0:7} (was ${previous:0:7})"
  mkdir -p "$RELEASES"
  if ! build_release "$sha"; then
    echo "$sha" >"$APP_DIR/last-failed"
    echo "Build failed; ${previous:0:7} is still running." >&2
    exit 1
  fi

  if [[ -f "$DATABASE_PATH" ]]; then
    log "Backing up database"
    (cd "$RELEASES/$sha" && npm run backup --silent)
  fi

  log "Switching and restarting"
  switch_to "$sha"
  if restart_and_check; then
    rm -f "$APP_DIR/last-failed"
    case "$mode" in
      pinned)
        touch "$APP_DIR/HOLD"
        echo "Automatic deploys paused. Run deploy.sh without arguments to resume." ;;
      manual) rm -f "$APP_DIR/HOLD" ;;
    esac
    prune_releases
    log "Deployed ${sha:0:7}"
    exit 0
  fi

  echo "$sha" >"$APP_DIR/last-failed"
  echo "Health check failed for ${sha:0:7}. Logs: journalctl -u trackle -n 100" >&2
  if [[ -n "$previous" && -d "$RELEASES/$previous" ]]; then
    log "Rolling back to ${previous:0:7}"
    switch_to "$previous"
    if restart_and_check; then
      echo "Rolled back to ${previous:0:7}; the site is up." >&2
    else
      # Most likely the new release ran a migration and the old code refuses
      # the newer schema. Restore the backup taken just above (docs/deployment.md).
      echo "Rollback is unhealthy too. Restore the latest backup in $BACKUP_DIR." >&2
    fi
  fi
  exit 1
}

# Everything runs from main, so bash has read the whole file before any of it
# executes.
main "$@"
