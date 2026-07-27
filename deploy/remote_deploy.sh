#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Trading Journal — on-server deploy script.
#
# Run by GitHub Actions right after the repo is synced, and safe to run by hand:
#
#     bash /var/www/trading-journal/deploy/remote_deploy.sh
#
# Useful switches:
#     SKIP_PNL=1      build only the journal site (saves ~1 build worth of RAM)
#     SKIP_BUILD=1    only restart PM2 + health check, no rebuild
#     FORCE_DEPS=1    reinstall backend + frontend dependencies
#     DEPLOY_TRACE=0  turn the per-command trace off
#
# Everything the CI does lives here, so a manual run and a CI run can never
# drift apart.
# ---------------------------------------------------------------------------

set -Eeuo pipefail

ROOT="${ROOT:-/var/www/trading-journal}"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
STAMPS="$ROOT/.deploy-stamps"

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

[ "${DEPLOY_TRACE:-1}" = "1" ] && set -x

# ───────────────────── sanity checks ───────────────────────────────
step "Environment"
[ -d "$ROOT" ]     || fail "project directory $ROOT is missing"
[ -d "$BACKEND" ]  || fail "backend directory $BACKEND is missing"
[ -d "$FRONTEND" ] || fail "frontend directory $FRONTEND is missing"
command -v python3 >/dev/null || fail "python3 not found in PATH ($PATH)"
command -v node    >/dev/null || fail "node not found in PATH ($PATH)"
command -v npm     >/dev/null || fail "npm not found in PATH ($PATH)"
command -v pm2     >/dev/null || fail "pm2 not found in PATH ($PATH)"
node -v
npm -v
python3 --version
git -C "$ROOT" log -1 --oneline
free -m || true
swapon --show || true
df -h "$ROOT" || true

# 2 sequential Next builds on a 3 GB box with no swap is the known failure mode.
if ! swapon --show 2>/dev/null | grep -q .; then
  echo "⚠ no swap configured — if a build dies with 'Killed', add 2 GB of swap:"
  echo "    fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile"
fi

mkdir -p "$STAMPS"

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

# ───────────────── backend (FastAPI / uvicorn, port 8001) ───────────────
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

step "Backend: (re)starting PM2 process tj-backend"
if pm2 describe tj-backend >/dev/null 2>&1; then
  pm2 restart tj-backend --update-env
else
  pm2 start ecosystem.config.js
fi

# ──────────────────── frontend (Next.js, 3001 + 3012) ───────────────────
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
  step "Frontend: journal build (basePath=/journal, distDir=.next, port 3001)"
  build_try journal npm run build || fail "journal build failed on every heap size"
fi

step "Frontend: (re)starting PM2 process tj-frontend"
if pm2 describe tj-frontend >/dev/null 2>&1; then
  pm2 restart tj-frontend --update-env
else
  pm2 start ecosystem.config.js --only tj-frontend
fi

if [ "${SKIP_PNL:-0}" = "1" ]; then
  echo "  SKIP_PNL=1 — skipping the pnl build"
elif [ "${SKIP_BUILD:-0}" = "1" ]; then
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

step "Frontend: (re)starting PM2 process tj-pnl-frontend"
if pm2 describe tj-pnl-frontend >/dev/null 2>&1; then
  pm2 restart tj-pnl-frontend --update-env
else
  pm2 start ecosystem.config.js --only tj-pnl-frontend
fi

# ───────────────────────── health check ─────────────────────────────
check_port() {
  local port="$1" i code=""
  for i in $(seq 1 40); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/" || true)"
    if [ "$code" = "200" ]; then
      echo "  ✅ port $port answered 200"
      return 0
    fi
    sleep 3
  done
  echo "  ❌ port $port never answered (last status: ${code:-none})"
  pm2 list || true
  pm2 logs --lines 60 --nostream || true
  return 1
}

step "Health check"
check_port 3001 || fail "journal site (port 3001) is not serving"
if [ "${SKIP_PNL:-0}" = "1" ]; then
  echo "  SKIP_PNL=1 — skipping the port 3012 check"
else
  check_port 3012 || fail "pnl site (port 3012) is not serving"
fi

pm2 save
set +x
echo
echo "✅ Deploy complete — https://trading-journal.cryptosmart.site + https://pnl.cryptosmart.site"
