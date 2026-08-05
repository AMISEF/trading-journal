#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Trading Journal — on-server deploy script.
#
# Run by GitHub Actions right after the repo is synced, and safe to run by hand:
#
#     bash /var/www/trading-journal/deploy/remote_deploy.sh
#
# Design goals, in order:
#   1. The live sites never go down because of a deploy.
#   2. A deploy costs as little time as possible — nothing is rebuilt unless the
#      files that feed that build actually changed.
#   3. A failure is loud and explains itself.
#
# What that means in practice:
#   * backend-only push          → pip (if requirements changed) + pm2 restart, seconds
#   * frontend push              → one journal build; the pnl site is NOT rebuilt
#                                  unless you ask for it (SKIP_PNL=0 / FORCE_ALL=1)
#   * docs/workflow-only push    → nothing at all
#   * a build that fails         → the previous build keeps serving, pm2 is
#                                  restarted, the site stays up, and the job
#                                  exits non-zero so you still see the red X
#
# Useful switches:
#     SKIP_BUILD=1          only restart PM2 + health check, no rebuild at all
#     ONLY_PNL=1            deploy just the pnl site (port 3012)
#     ONLY_JOURNAL=1        deploy just the journal site (port 3001)
#     SKIP_PNL=0            also rebuild the pnl site (default: 1, i.e. skipped)
#     FORCE_BUILD=1         rebuild the journal frontend even if nothing changed
#     FORCE_ALL=1           treat every path as changed (full deploy, both sites)
#     FORCE_DEPS=1          reinstall backend + frontend dependencies
#     SKIP_HEALTHCHECK=1    deploy without waiting on the HTTP probes
#     AUTO_SWAP=0           do not create a swapfile when the box has none
#     KEEP_TSCONFIG=1       leave the tsconfig.json edits Next makes in place
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

# Set to 1 by a build that failed. The deploy carries on (so the running site is
# restarted and probed) and only reports the failure at the very end.
BUILD_FAILED=0

step() { echo; echo "▶ $*"; }
fail() { echo "❌ $*" >&2; exit 1; }
warn() { echo "⚠ $*" >&2; }

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

# ─────────────────── sanity checks ──────────────────
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

# ────────────────── what actually changed? ──────────────────
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
# Only files that Next actually compiles justify a rebuild. Touching a README,
# the workflow file or the deploy script does not.
changed_in '^frontend/(src/|public/|package|next\.config|tailwind\.config|postcss|tsconfig)' && FRONTEND_CHANGED=1
[ "${FORCE_BUILD:-0}" = "1" ] && FRONTEND_CHANGED=1
[ "${FORCE_DEPS:-0}" = "1" ] && { BACKEND_CHANGED=1; FRONTEND_CHANGED=1; }

# The pnl site is a second full Next build of the same source. It is the single
# most expensive thing this script can do and it is almost never what a journal
# push is about, so it is opt-in now: SKIP_PNL=0, ONLY_PNL=1 or FORCE_ALL=1.
SKIP_PNL="${SKIP_PNL:-1}"
[ "${FORCE_ALL:-0}" = "1" ] && SKIP_PNL=0

BUILD_JOURNAL=$FRONTEND_CHANGED
BUILD_PNL=$FRONTEND_CHANGED
[ "$SKIP_PNL" = "1" ] && BUILD_PNL=0

if [ "${ONLY_PNL:-0}" = "1" ]; then
  BACKEND_CHANGED=0; BUILD_JOURNAL=0; BUILD_PNL=1; FRONTEND_CHANGED=1
fi
if [ "${ONLY_JOURNAL:-0}" = "1" ]; then
  BACKEND_CHANGED=0; BUILD_PNL=0; BUILD_JOURNAL=1; FRONTEND_CHANGED=1
fi

# ────────────────── self-heal ────────────────────────
# A dist without a BUILD_ID is a half-written build: `next start` will crash on
# it forever. A pm2 process that is not online is the same story. Either way the
# site is down right now — that is the one case where we rebuild uninvited.
dist_ok()   { [ -f "$FRONTEND/$1/BUILD_ID" ]; }
pm2_online() { pm2 describe "$1" 2>/dev/null | grep -qE 'status[^a-z]+online'; }

RESTART_JOURNAL=$BUILD_JOURNAL
RESTART_PNL=$BUILD_PNL

set +x
if [ "${ONLY_JOURNAL:-0}" != "1" ]; then
  if ! dist_ok "$PNL_DIST"; then
    echo "⚠ $PNL_DIST has no BUILD_ID (missing or interrupted build) — rebuilding the pnl site"
    BUILD_PNL=1; RESTART_PNL=1; FRONTEND_CHANGED=1
  elif ! pm2_online tj-pnl-frontend; then
    echo "⚠ tj-pnl-frontend is not online — restarting the pnl site (no rebuild needed)"
    RESTART_PNL=1
  fi
fi
if [ "${ONLY_PNL:-0}" != "1" ]; then
  if ! dist_ok "$JOURNAL_DIST"; then
    echo "⚠ $JOURNAL_DIST has no BUILD_ID (missing or interrupted build) — rebuilding the journal site"
    BUILD_JOURNAL=1; RESTART_JOURNAL=1; FRONTEND_CHANGED=1
  elif ! pm2_online tj-frontend; then
    echo "⚠ tj-frontend is not online — restarting the journal site (no rebuild needed)"
    RESTART_JOURNAL=1
  fi
fi

# Restart-only mode: keep the builds that are already on disk.
if [ "${SKIP_BUILD:-0}" = "1" ]; then
  echo "⚠ SKIP_BUILD=1 — no rebuild, PM2 restart only"
  BUILD_JOURNAL=0; BUILD_PNL=0
  [ "${ONLY_PNL:-0}" = "1" ]     || RESTART_JOURNAL=1
  [ "${ONLY_JOURNAL:-0}" = "1" ] || RESTART_PNL=1
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
echo "  plan    : backend=$BACKEND_CHANGED build[journal=$BUILD_JOURNAL pnl=$BUILD_PNL] restart[journal=$RESTART_JOURNAL pnl=$RESTART_PNL]"
[ "${DEPLOY_TRACE:-1}" = "1" ] && set -x

if [ "$BACKEND_CHANGED" = "0" ] && [ "$BUILD_JOURNAL" = "0" ] && [ "$BUILD_PNL" = "0" ] \
   && [ "$RESTART_JOURNAL" = "0" ] && [ "$RESTART_PNL" = "0" ]; then
  set +x
  echo "$NEW_SHA" > "$SHA_STAMP"
  echo
  echo "✅ Nothing to deploy (both sites healthy, no backend or frontend changes) — $(( $(date +%s) - STARTED_AT ))s"
  exit 0
fi

ANY_BUILD=0
[ "$BUILD_JOURNAL" = "1" ] && ANY_BUILD=1
[ "$BUILD_PNL" = "1" ] && ANY_BUILD=1

# ────────────────── memory / swap ────────────────────
# A Next build on a ~3 GB box with zero swap is exactly how the pnl build got
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

if [ "$ANY_BUILD" = "1" ]; then
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

# ───────────────── backend (FastAPI / uvicorn, port 8001) ─────────────
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

# ────────────────── frontend (Next.js, 3001 + 3012) ───────────────────
# `next build` writes a per-route type stub into <distDir>/types and appends
# that folder to tsconfig's "include". Two things used to go wrong there, and
# together they were by far the biggest source of red deploys:
#
#   1. tsconfig included **/*.ts with only node_modules excluded, so TypeScript
#      checked EVERY dist folder on disk (.next, .next-pnl, .next.prev,
#      .next.broken, …). Each stub imports its source route back, so a route
#      that was later deleted or renamed left an orphan behind and every build
#      from then on died with
#         Cannot find module '../../../../src/app/<gone>/route.js'
#      — a file nobody wrote, in a folder nobody edits, unrelated to the commit
#      being deployed. .next-pnl made it permanent, because the pnl site is
#      skipped by default so its stubs were never regenerated.
#   2. Next rewrites tsconfig.json mid-build, leaving the checkout dirty and the
#      "include" list growing on every deploy.
#
# tsconfig.json now scopes "include" to src/ and excludes every dist folder.
# The two helpers below make a server that still carries old artefacts heal
# itself instead of needing a manual rm -rf.
purge_generated_types() {
  cd "$FRONTEND"
  echo "  sweeping generated route types + stale dists (orphaned stubs break later builds)"
  rm -rf "$JOURNAL_DIST/types" "$PNL_DIST/types" \
         "$JOURNAL_DIST.prev" "$PNL_DIST.prev" \
         "$JOURNAL_DIST.broken" "$PNL_DIST.broken" \
         "$JOURNAL_DIST.build" "$PNL_DIST.build" 2>/dev/null || true
}

# Next edits tsconfig.json in place; the committed version stays authoritative.
restore_tsconfig() {
  if [ "${KEEP_TSCONFIG:-0}" = "1" ]; then
    return 0
  fi
  git -C "$ROOT" checkout -- frontend/tsconfig.json 2>/dev/null || true
}

if [ "$ANY_BUILD" = "1" ]; then
  step "Frontend: pre-build cleanup"
  restore_tsconfig
  purge_generated_types

  step "Frontend: dependencies"
  cd "$FRONTEND"
  if [ ! -d node_modules ] || needs_install package-lock.json frontend-lock; then
    echo "  installing node modules..."
    npm ci --prefer-offline --no-audit --fund=false
    write_stamp package-lock.json frontend-lock
  else
    echo "  dependencies unchanged — skipping npm ci"
  fi
fi

# One attempt per heap size, but only when the previous attempt looks like an
# out-of-memory kill (node exits 134/137/139, or is killed by a signal → >128).
# A real compile error exits 1, and repeating it two more times used to waste
# minutes and hide the actual message at the top of the log.
build_try() {
  local label="$1"; shift
  local heap code
  for heap in 2048 1536 1024; do
    echo "  building $label (heap=${heap}MB)..."
    set +e
    NODE_OPTIONS="--max-old-space-size=$heap" "$@"
    code=$?
    set -e
    if [ "$code" = "0" ]; then
      echo "  ✅ $label build OK"
      return 0
    fi
    if [ "$code" -le 128 ] && [ "$code" != "134" ]; then
      echo "  ✖ $label build failed with exit code $code — this is a compile error, not memory pressure; not retrying"
      return 1
    fi
    echo "  ⚠ $label build was killed (exit $code) — looks like memory pressure, retrying with a smaller heap"
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
  [ -f "$scratch/BUILD_ID" ] || { warn "$label build left no BUILD_ID in $scratch"; return 1; }
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
  step "Frontend: journal build (basePath=$JOURNAL_HEALTH_PATH, distDir=$JOURNAL_DIST, port 3001)"
  if build_site journal "$JOURNAL_DIST"; then
    RESTART_JOURNAL=1
  else
    BUILD_FAILED=1
    warn "journal build failed — keeping the build that is already serving; the site stays up"
    rm -rf "$FRONTEND/$JOURNAL_DIST.build" || true
    # Only restart if the running process is unhealthy; a healthy site is left alone.
    dist_ok "$JOURNAL_DIST" && pm2_online tj-frontend && RESTART_JOURNAL=0
  fi
fi

if [ "$RESTART_JOURNAL" = "1" ]; then
  step "Frontend: restarting PM2 process tj-frontend"
  cd "$FRONTEND"
  restart_pm2 tj-frontend ecosystem.config.js --only tj-frontend
  PROBE_JOURNAL=1
else
  echo "  journal site untouched (no new build, process healthy)"
fi

if [ "$BUILD_PNL" = "1" ]; then
  step "Frontend: pnl build (root path, SITE_MODE=pnl, distDir=$PNL_DIST, port 3012)"
  if build_site pnl "$PNL_DIST" \
      NEXT_PUBLIC_SITE_MODE=pnl \
      NEXT_PUBLIC_BASE_PATH= \
      NEXT_PUBLIC_API_BASE=/api; then
    RESTART_PNL=1
  else
    BUILD_FAILED=1
    warn "pnl build failed — keeping the build that is already serving; the site stays up"
    rm -rf "$FRONTEND/$PNL_DIST.build" || true
    dist_ok "$PNL_DIST" && pm2_online tj-pnl-frontend && RESTART_PNL=0
  fi
elif [ "$FRONTEND_CHANGED" = "1" ] && [ "$SKIP_PNL" = "1" ]; then
  echo "  pnl site skipped (SKIP_PNL=1) — run the workflow with 'force_all' to rebuild it"
fi

if [ "$RESTART_PNL" = "1" ]; then
  step "Frontend: restarting PM2 process tj-pnl-frontend"
  cd "$FRONTEND"
  restart_pm2 tj-pnl-frontend ecosystem.config.js --only tj-pnl-frontend
  PROBE_PNL=1
else
  echo "  pnl site untouched (no new build, process healthy)"
fi

# Leave the checkout clean so the next `git reset --hard` has nothing to undo.
if [ "$ANY_BUILD" = "1" ]; then
  restore_tsconfig
fi

# ───────────────────── health check ───────────────────────
# Only the services that were actually restarted are probed, and the poll is
# fast (1s) so a healthy deploy costs a second or two, not half a minute.
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

set +x
ELAPSED=$(( $(date +%s) - STARTED_AT ))

if [ "$BUILD_FAILED" = "1" ]; then
  echo
  echo "⚠ The sites are UP and serving the previous build, but a build failed — the"
  echo "  new commit is not live. Scroll up to the first '✖ ... build failed' line"
  echo "  for the compiler message. Nothing was rolled back or deleted."
  echo "❌ Deploy finished with a failed build in ${ELAPSED}s"
  exit 1
fi

echo "$NEW_SHA" > "$SHA_STAMP"
echo
echo "✅ Deploy complete in ${ELAPSED}s — https://trading-journal.cryptosmart.site + https://pnl.cryptosmart.site"
