#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Trading Journal — on-server deploy script.
#
# Run by GitHub Actions right after the repo is synced, and safe to run by hand:
#
#     bash /var/www/trading-journal/deploy/remote_deploy.sh
#
# It is incremental: the previously deployed commit is remembered in
# .deploy-stamps/last-deployed-sha, so a backend-only push never pays for the
# two Next builds (~2.5 min) and finishes in seconds.
#
# Useful switches:
#     FORCE_BUILD=1         rebuild the frontend even if nothing there changed
#     FORCE_ALL=1           treat every path as changed (full deploy)
#     FORCE_DEPS=1          reinstall backend + frontend dependencies
#     SKIP_PNL=1            build only the journal site (saves a build's worth of RAM)
#     SKIP_BUILD=1          only restart PM2 + health check, no rebuild
#     SKIP_HEALTHCHECK=1    deploy without waiting on the HTTP probes
#     JOURNAL_HEALTH_PATH   path the journal app is served under (default /journal)
#     DEPLOY_PREV_SHA       commit to diff against (CI passes the pre-sync HEAD)
#     DEPLOY_TRACE=0        turn the per-command trace off
#
# Everything the CI does lives here, so a manual run and a CI run can never
# drift apart.
# ---------------------------------------------------------------------------

set -Eeuo pipefail

ROOT="${ROOT:-/var/www/trading-journal}"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
STAMPS="$ROOT/.deploy-stamps"
SHA_STAMP="$STAMPS/last-deployed-sha"
JOURNAL_HEALTH_PATH="${JOURNAL_HEALTH_PATH:-/journal}"
STARTED_AT=$(date +%s)

step() { echo; echo "▶ $*"; }
fail() { echo "❌ $*" >&2; exit 1; }

# Report the exact line that broke — the old inline script died silently.
trap 'code=$?; set +x; echo "❌ deploy aborted at line $LINENO with exit code $code" >&2; exit $code' ERR

# A non-interactive SSH session does not read .bashrc, so nvm/global bins can be
# missing from PATH even though they work in your own shell.
for d in /usr/local/bin /usr/local/sbin /snap/bin /root/.nvm/versions/node/*/bin; do
  [ -d "$d" ] && PATH="$d:$PATH"
done
export PATH
export NEXT_TELEMETRY_DISABLED=1

[ "${DEPLOY_TRACE:-1}" = "1" ] && set -x

# ──────────────────── sanity checks ───────────────────────────────
step "Environment"
[ -d "$ROOT" ]     || fail "project directory $ROOT is missing"
[ -d "$BACKEND" ]  || fail "backend directory $BACKEND is missing"
[ -d "$FRONTEND" ] || fail "frontend directory $FRONTEND is missing"
command -v python3 >/dev/null || fail "python3 not found in PATH ($PATH)"
command -v node    >/dev/null || fail "node not found in PATH ($PATH)"
command -v npm     >/dev/null || fail "npm not found in PATH ($PATH)"
command -v pm2     >/dev/null || fail "pm2 not found in PATH ($PATH)"
git -C "$ROOT" log -1 --oneline

mkdir -p "$STAMPS"

# ──────────────────── what actually changed? ──────────────────────
# Keyed off commits, so a re-run of the same commit is a no-op instead of a
# full rebuild. CI hands us the pre-sync HEAD; a manual run falls back to the
# stamp written by the last successful deploy.
NEW_SHA="$(git -C "$ROOT" rev-parse HEAD)"
PREV_SHA="${DEPLOY_PREV_SHA:-}"
[ -z "$PREV_SHA" ] && [ -f "$SHA_STAMP" ] && PREV_SHA="$(cat "$SHA_STAMP")"

CHANGED=""
if [ "${FORCE_ALL:-0}" = "1" ]; then
  CHANGED="all"
elif [ -n "$PREV_SHA" ] && git -C "$ROOT" cat-file -e "${PREV_SHA}^{commit}" 2>/dev/null; then
  if [ "$PREV_SHA" = "$NEW_SHA" ]; then
    CHANGED=""
  else
    CHANGED="$(git -C "$ROOT" diff --name-only "$PREV_SHA" "$NEW_SHA" || echo all)"
  fi
else
  CHANGED="all"
fi

changed_in() {
  [ "$CHANGED" = "all" ] && return 0
  echo "$CHANGED" | grep -qE "$1"
}

BACKEND_CHANGED=0
FRONTEND_CHANGED=0
changed_in '^backend/'  && BACKEND_CHANGED=1
changed_in '^frontend/' && FRONTEND_CHANGED=1
[ "${FORCE_BUILD:-0}" = "1" ] && FRONTEND_CHANGED=1
[ "${FORCE_DEPS:-0}" = "1" ] && { BACKEND_CHANGED=1; FRONTEND_CHANGED=1; }

set +x
echo "  previous: ${PREV_SHA:-<unknown>}"
echo "  current : $NEW_SHA"
if [ "$CHANGED" = "all" ]; then
  echo "  changed : (unknown history — full deploy)"
elif [ -z "$CHANGED" ]; then
  echo "  changed : nothing"
else
  echo "$CHANGED" | sed 's/^/  changed : /'
fi
echo "  plan    : backend=$BACKEND_CHANGED frontend=$FRONTEND_CHANGED"
[ "${DEPLOY_TRACE:-1}" = "1" ] && set -x

if [ "$BACKEND_CHANGED" = "0" ] && [ "$FRONTEND_CHANGED" = "0" ]; then
  set +x
  echo "$NEW_SHA" > "$SHA_STAMP"
  echo
  echo "✅ Nothing to deploy (no backend or frontend changes) — $(( $(date +%s) - STARTED_AT ))s"
  exit 0
fi

# Memory report only matters when a Next build is about to run.
if [ "$FRONTEND_CHANGED" = "1" ] && [ "${SKIP_BUILD:-0}" != "1" ]; then
  free -m || true
  if ! swapon --show 2>/dev/null | grep -q .; then
    echo "⚠ no swap configured — if a build dies with 'Killed', add 2 GB of swap:"
    echo "    fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile"
  fi
fi

# Dependency installs are keyed off file hashes instead of git diffs, so a
# manual run, a re-run and a fresh clone all behave the same way.
hash_of()  { sha256sum "$1" | awk '{print $1}'; }
stamp_of() { echo "$STAMPS/$1"; }
needs_install() {
  [ "${FORCE_DEPS:-0}" = "1" ] && return 0
  local file="$1" stamp
  stamp="$(stamp_of "$2")"
  [ -f "$stamp" ] || return 0
  [ "$(cat "$stamp")" = "$(hash_of "$file")" ] && return 1
  return 0
}
write_stamp() { hash_of "$1" > "$(stamp_of "$2")"; }

FRESH_PM2=0
PROBE_JOURNAL=0
PROBE_PNL=0

restart_pm2() {
  local name="$1"; shift
  if pm2 describe "$name" >/dev/null 2>&1; then
    pm2 restart "$name" --update-env
  else
    pm2 start "$@"
    FRESH_PM2=1
  fi
}

# ───────────────── backend (FastAPI / uvicorn, port 8001) ───────────────
if [ "$BACKEND_CHANGED" = "1" ]; then
  step "Backend: virtualenv"
  cd "$BACKEND"
  if [ ! -x venv/bin/python ]; then
    echo "  creating venv..."
    python3 -m venv venv
  fi
  if [ ! -x venv/bin/uvicorn ] || needs_install requirements.txt backend-requirements; then
    step "Backend: installing dependencies"
    ./venv/bin/pip install --upgrade pip
    ./venv/bin/pip install -r requirements.txt
    write_stamp requirements.txt backend-requirements
  else
    echo "  dependencies unchanged — skipping pip install"
  fi

  step "Backend: restarting PM2 process tj-backend"
  restart_pm2 tj-backend ecosystem.config.js
else
  echo "  backend unchanged — not touching tj-backend"
fi

# ──────────────────── frontend (Next.js, 3001 + 3012) ───────────────────
if [ "$FRONTEND_CHANGED" = "1" ]; then
  step "Frontend: dependencies"
  cd "$FRONTEND"
  if [ ! -d node_modules ] || needs_install package-lock.json frontend-lock; then
    echo "  installing node modules..."
    npm ci --prefer-offline --no-audit --fund=false
    write_stamp package-lock.json frontend-lock
  else
    echo "  dependencies unchanged — skipping npm ci"
  fi

  # The box has ~3 GB RAM and no swap, and this build has been OOM-killed before.
  # When the kernel kills node, a *lower* heap ceiling is what lets it finish.
  # The .next / .next-pnl caches are kept on purpose so builds stay incremental.
  build_try() {
    local label="$1"; shift
    local heap
    for heap in 2048 1536 1024; do
      echo "  building $label (heap=${heap}MB)..."
      if NODE_OPTIONS="--max-old-space-size=$heap" "$@"; then
        echo "  ✅ $label build OK"
        return 0
      fi
      echo "  ⚠ $label build failed at heap=${heap}MB"
      free -m || true
      dmesg 2>/dev/null | tail -n 8 || true
    done
    return 1
  }

  if [ "${SKIP_BUILD:-0}" = "1" ]; then
    echo "  SKIP_BUILD=1 — no rebuild, restarting only"
  else
    step "Frontend: journal build (basePath=$JOURNAL_HEALTH_PATH, distDir=.next, port 3001)"
    build_try journal npm run build || fail "journal build failed on every heap size"
  fi

  step "Frontend: restarting PM2 process tj-frontend"
  restart_pm2 tj-frontend ecosystem.config.js --only tj-frontend
  PROBE_JOURNAL=1

  if [ "${SKIP_PNL:-0}" = "1" ]; then
    echo "  SKIP_PNL=1 — skipping the pnl build and its restart"
  else
    if [ "${SKIP_BUILD:-0}" = "1" ]; then
      echo "  SKIP_BUILD=1 — skipping the pnl build"
    else
      step "Frontend: pnl build (root path, SITE_MODE=pnl, distDir=.next-pnl, port 3012)"
      build_try pnl env \
        NEXT_PUBLIC_SITE_MODE=pnl \
        NEXT_PUBLIC_BASE_PATH= \
        NEXT_PUBLIC_API_BASE=/api \
        NEXT_DIST_DIR=.next-pnl \
        npm run build || fail "pnl build failed on every heap size"
    fi
    step "Frontend: restarting PM2 process tj-pnl-frontend"
    restart_pm2 tj-pnl-frontend ecosystem.config.js --only tj-pnl-frontend
    PROBE_PNL=1
  fi
else
  echo "  frontend unchanged — no npm, no builds, no restarts"
fi

# ───────────────────────── health check ─────────────────────────────
# Only the services that were actually restarted are probed, and the poll is
# fast (1s) so a healthy deploy costs a second or two, not half a minute.
# The journal app is served under a basePath (/journal), so GET / on its port is
# a 404 *by design*. Waiting for a 200 on / is what made the old check spin.
#   2xx / 3xx        → healthy
#   404              → server is up, just not on this path (warn, do not fail)
#   000 (refused)    → not listening yet, keep waiting
#   5xx              → app is crashing, keep waiting then fail
probe() { curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$1" || echo "000"; }

check_site() {
  local name="$1" port="$2" path="$3" i code="000" url
  url="http://127.0.0.1:${port}${path}"
  for i in $(seq 1 45); do
    code="$(probe "$url")"
    case "$code" in
      2??|3??)
        echo "  ✅ $name: $url → $code"
        return 0
        ;;
      404)
        echo "  ⚠ $name: $url → 404 (server is listening; check the basePath)"
        return 0
        ;;
    esac
    sleep 1
  done
  echo "  ❌ $name: $url never became healthy (last status: $code)"
  (command -v ss >/dev/null && ss -ltnp | grep -E ":(3001|3012|8001)" ) || true
  pm2 list || true
  pm2 logs "$name" --lines 60 --nostream || true
  return 1
}

if [ "${SKIP_HEALTHCHECK:-0}" = "1" ]; then
  step "Health check skipped (SKIP_HEALTHCHECK=1)"
else
  step "Health check"
  if [ "$BACKEND_CHANGED" = "1" ]; then
    check_site tj-backend 8001 "/api/public/demo/trades" || fail "backend (port 8001) is not serving"
  fi
  if [ "$PROBE_JOURNAL" = "1" ]; then
    check_site tj-frontend 3001 "$JOURNAL_HEALTH_PATH" || fail "journal site (port 3001) is not serving"
  fi
  if [ "$PROBE_PNL" = "1" ]; then
    check_site tj-pnl-frontend 3012 "/" || fail "pnl site (port 3012) is not serving"
  fi
fi

# Only needed when the process list itself changed.
[ "$FRESH_PM2" = "1" ] && pm2 save

echo "$NEW_SHA" > "$SHA_STAMP"
set +x
echo
echo "✅ Deploy complete in $(( $(date +%s) - STARTED_AT ))s — https://trading-journal.cryptosmart.site + https://pnl.cryptosmart.site"
