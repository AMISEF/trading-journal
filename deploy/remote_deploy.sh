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
# two Next builds and finishes in seconds.
#
# It is also crash-safe. Each Next build is written to a scratch distDir and
# swapped into place only once it produced a BUILD_ID, and the previous build is
# kept around so a site that fails its health check is rolled back instead of
# left broken. A build that is OOM-killed halfway can no longer take a live site
# down.
#
# Useful switches:
#     ONLY_PNL=1            deploy just the pnl site (port 3012)
#     ONLY_JOURNAL=1        deploy just the journal site (port 3001)
#     FORCE_BUILD=1         rebuild the frontend even if nothing there changed
#     FORCE_ALL=1           treat every path as changed (full deploy)
#     FORCE_DEPS=1          reinstall backend + frontend dependencies
#     SKIP_PNL=1            build only the journal site (saves a build's worth of RAM)
#     SKIP_BUILD=1          only restart PM2 + health check, no rebuild
#     SKIP_HEALTHCHECK=1    deploy without waiting on the HTTP probes
#     AUTO_SWAP=0           do not create a swapfile when the box has none
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
JOURNAL_DIST=".next"
PNL_DIST=".next-pnl"
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

# Which of the two frontends to touch. Self-heal below can turn these back on.
BUILD_JOURNAL=$FRONTEND_CHANGED
BUILD_PNL=$FRONTEND_CHANGED
[ "${SKIP_PNL:-0}" = "1" ] && BUILD_PNL=0

if [ "${ONLY_PNL:-0}" = "1" ]; then
  BACKEND_CHANGED=0; BUILD_JOURNAL=0; BUILD_PNL=1; FRONTEND_CHANGED=1
fi
if [ "${ONLY_JOURNAL:-0}" = "1" ]; then
  BACKEND_CHANGED=0; BUILD_PNL=0; BUILD_JOURNAL=1; FRONTEND_CHANGED=1
fi

# ──────────────────── self-heal ───────────────────────────────────
# A dist without a BUILD_ID is a half-written build: `next start` will crash on
# it forever. A pm2 process that is not online is the same story. Either way the
# site is down right now, so rebuild it even if git says nothing changed.
dist_ok()   { [ -f "$FRONTEND/$1/BUILD_ID" ]; }
pm2_online() { pm2 describe "$1" 2>/dev/null | grep -qE 'status[^a-z]+online'; }

set +x
if [ "${ONLY_JOURNAL:-0}" != "1" ] && [ "${SKIP_PNL:-0}" != "1" ]; then
  if ! dist_ok "$PNL_DIST"; then
    echo "⚠ $PNL_DIST has no BUILD_ID (missing or interrupted build) — rebuilding the pnl site"
    BUILD_PNL=1; FRONTEND_CHANGED=1
  elif ! pm2_online tj-pnl-frontend; then
    echo "⚠ tj-pnl-frontend is not online — restarting the pnl site"
    BUILD_PNL=1; FRONTEND_CHANGED=1
  fi
fi
if [ "${ONLY_PNL:-0}" != "1" ]; then
  if ! dist_ok "$JOURNAL_DIST"; then
    echo "⚠ $JOURNAL_DIST has no BUILD_ID (missing or interrupted build) — rebuilding the journal site"
    BUILD_JOURNAL=1; FRONTEND_CHANGED=1
  elif ! pm2_online tj-frontend; then
    echo "⚠ tj-frontend is not online — restarting the journal site"
    BUILD_JOURNAL=1; FRONTEND_CHANGED=1
  fi
fi

echo "  previous: ${PREV_SHA:-<unknown>}"
echo "  current : $NEW_SHA"
if [ "$CHANGED" = "all" ]; then
  echo "  changed : (unknown history — full deploy)"
elif [ -z "$CHANGED" ]; then
  echo "  changed : nothing"
else
  echo "$CHANGED" | sed 's/^/  changed : /'
fi
echo "  plan    : backend=$BACKEND_CHANGED journal=$BUILD_JOURNAL pnl=$BUILD_PNL"
[ "${DEPLOY_TRACE:-1}" = "1" ] && set -x

if [ "$BACKEND_CHANGED" = "0" ] && [ "$BUILD_JOURNAL" = "0" ] && [ "$BUILD_PNL" = "0" ]; then
  set +x
  echo "$NEW_SHA" > "$SHA_STAMP"
  echo
  echo "✅ Nothing to deploy (both sites healthy, no backend or frontend changes) — $(( $(date +%s) - STARTED_AT ))s"
  exit 0
fi

# ──────────────────── memory / swap ───────────────────────────────
# Two Next builds on a ~3 GB box with zero swap is exactly how the pnl build got
# OOM-killed. Swap is cheap insurance and costs nothing when it is not needed.
ensure_swap() {
  swapon --show 2>/dev/null | grep -q . && return 0
  [ "${AUTO_SWAP:-1}" = "1" ] || { echo "  no swap, AUTO_SWAP=0 — leaving it alone"; return 0; }
  [ "$(id -u)" = "0" ] || { echo "  no swap and not root — skipping"; return 0; }
  echo "  no swap configured — creating /swapfile (2 GB)"
  (
    set -e
    fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ) || echo "  ⚠ could not create swap — continuing without it"
}

if [ "$FRONTEND_CHANGED" = "1" ] && [ "${SKIP_BUILD:-0}" != "1" ]; then
  step "Memory"
  free -m || true
  ensure_swap
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

  # The box has ~3 GB RAM and this build has been OOM-killed before. When the
  # kernel kills node, a *lower* heap ceiling is what lets it finish.
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

  # Build into <dist>.build, then swap it in. The live dist is never written to,
  # so an interrupted build cannot break the running site. The webpack cache is
  # copied across first, which is what keeps rebuilds incremental (~30s).
  build_site() {
    local label="$1" dist="$2"; shift 2
    local scratch="$dist.build"
    cd "$FRONTEND"
    rm -rf "$scratch"
    mkdir -p "$scratch"
    [ -d "$dist/cache" ] && cp -a "$dist/cache" "$scratch/cache" || true
    build_try "$label" env NEXT_DIST_DIR="$scratch" "$@" npm run build || return 1
    [ -f "$scratch/BUILD_ID" ] || fail "$label build left no BUILD_ID in $scratch"
    rm -rf "$dist.prev"
    [ -d "$dist" ] && mv "$dist" "$dist.prev"
    mv "$scratch" "$dist"
    echo "  ↷ $label: $scratch → $dist (previous kept as $dist.prev)"
  }

  # A site that fails its health check goes back to the build that was serving
  # traffic a minute ago, so "bad build" never means "site down".
  rollback_site() {
    local label="$1" dist="$2" name="$3"
    cd "$FRONTEND"
    [ -d "$dist.prev" ] || { echo "  ✖ no $dist.prev to roll $label back to"; return 1; }
    echo "  ↩ rolling $label back to the previous build"
    rm -rf "$dist.broken"
    [ -d "$dist" ] && mv "$dist" "$dist.broken"
    mv "$dist.prev" "$dist"
    pm2 restart "$name" --update-env || true
    return 0
  }

  if [ "$BUILD_JOURNAL" = "1" ]; then
    if [ "${SKIP_BUILD:-0}" = "1" ]; then
      echo "  SKIP_BUILD=1 — no journal rebuild, restarting only"
    else
      step "Frontend: journal build (basePath=$JOURNAL_HEALTH_PATH, distDir=$JOURNAL_DIST, port 3001)"
      build_site journal "$JOURNAL_DIST" || fail "journal build failed on every heap size"
    fi
    step "Frontend: restarting PM2 process tj-frontend"
    cd "$FRONTEND"
    restart_pm2 tj-frontend ecosystem.config.js --only tj-frontend
    PROBE_JOURNAL=1
  else
    echo "  journal site unchanged and healthy — not touching tj-frontend"
  fi

  if [ "$BUILD_PNL" = "1" ]; then
    if [ "${SKIP_BUILD:-0}" = "1" ]; then
      echo "  SKIP_BUILD=1 — no pnl rebuild, restarting only"
    else
      step "Frontend: pnl build (root path, SITE_MODE=pnl, distDir=$PNL_DIST, port 3012)"
      build_site pnl "$PNL_DIST" \
        NEXT_PUBLIC_SITE_MODE=pnl \
        NEXT_PUBLIC_BASE_PATH= \
        NEXT_PUBLIC_API_BASE=/api \
        || fail "pnl build failed on every heap size"
    fi
    step "Frontend: restarting PM2 process tj-pnl-frontend"
    cd "$FRONTEND"
    restart_pm2 tj-pnl-frontend ecosystem.config.js --only tj-pnl-frontend
    PROBE_PNL=1
  else
    echo "  pnl site unchanged and healthy — not touching tj-pnl-frontend"
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
probe() { curl -sL -o /dev/null -w '%{http_code}' --max-time 5 "$1" || echo "000"; }

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
    if ! check_site tj-frontend 3001 "$JOURNAL_HEALTH_PATH"; then
      rollback_site journal "$JOURNAL_DIST" tj-frontend \
        && check_site tj-frontend 3001 "$JOURNAL_HEALTH_PATH" \
        && fail "the new journal build was broken — rolled back, the site is up on the previous build"
      fail "journal site (port 3001) is not serving"
    fi
  fi
  if [ "$PROBE_PNL" = "1" ]; then
    if ! check_site tj-pnl-frontend 3012 "/"; then
      rollback_site pnl "$PNL_DIST" tj-pnl-frontend \
        && check_site tj-pnl-frontend 3012 "/" \
        && fail "the new pnl build was broken — rolled back, the site is up on the previous build"
      fail "pnl site (port 3012) is not serving"
    fi
  fi
fi

# Green deploy: the rollback copies are no longer needed (they are ~200 MB each).
rm -rf "$FRONTEND/$JOURNAL_DIST.prev" "$FRONTEND/$PNL_DIST.prev" \
       "$FRONTEND/$JOURNAL_DIST.broken" "$FRONTEND/$PNL_DIST.broken" || true

# Only needed when the process list itself changed.
[ "$FRESH_PM2" = "1" ] && pm2 save

echo "$NEW_SHA" > "$SHA_STAMP"
set +x
echo
echo "✅ Deploy complete in $(( $(date +%s) - STARTED_AT ))s — https://trading-journal.cryptosmart.site + https://pnl.cryptosmart.site"
