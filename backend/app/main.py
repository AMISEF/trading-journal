"""FastAPI application entry point.

Wires together all the routers, sets up CORS, mounts the uploads folder, and
creates the database tables on startup (Phase 1: no Alembic migrations needed).

Importing this module must NOT require a running database — table creation only
happens inside the startup event.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import (
    admin,
    ai,
    auth,
    calc,
    dashboard,
    exchanges as exchanges_router,
    export,
    groups as groups_router,
    league as league_router,
    market,
    password,
    public,
    referrals as referrals_router,
    service,
    settings as settings_router,
    templates,
    trades,
    uploads,
    wallet,
)
from app.core.config import settings
from app.db.session import init_db


async def _toobit_sync_loop():
    """Background poller: import every connected user's Toobit futures trades."""
    import asyncio
    import logging

    from app.db.session import AsyncSessionLocal
    from app.services import toobit_sync

    log = logging.getLogger("app.toobit")
    # Small initial delay so startup (migrations) settles first.
    await asyncio.sleep(10)
    while True:
        try:
            await toobit_sync.sync_all_users(AsyncSessionLocal)
        except Exception:  # noqa: BLE001 - the loop must never die
            log.exception("toobit sync pass failed")
        await asyncio.sleep(max(15, settings.TOOBIT_SYNC_INTERVAL))


async def _exchange_sync_loop():
    """Background poller for every other exchange (LBank / XT / Ourbit / WEEX).

    Runs on the same cadence as the Toobit loop but offset by a few seconds so
    both never hammer the database at the exact same moment.
    """
    import asyncio
    import logging

    from app.db.session import AsyncSessionLocal
    from app.services import exchange_sync

    log = logging.getLogger("app.exchanges")
    await asyncio.sleep(20)
    while True:
        try:
            await exchange_sync.sync_all_users(AsyncSessionLocal)
        except Exception:  # noqa: BLE001 - the loop must never die
            log.exception("exchange sync pass failed")
        await asyncio.sleep(max(15, settings.TOOBIT_SYNC_INTERVAL))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run once on startup: ensure the uploads folder and DB tables exist, and
    start the futures sync pollers (Toobit + the other exchanges)."""
    import asyncio

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    await init_db()
    tasks = []
    if settings.TOOBIT_SYNC_ENABLED:
        tasks.append(asyncio.create_task(_toobit_sync_loop()))
        tasks.append(asyncio.create_task(_exchange_sync_loop()))
    yield
    for task in tasks:
        task.cancel()


app = FastAPI(title="Crypto Smart Trading Journal API", lifespan=lifespan)

# --- CORS -----------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Static files for uploaded images -------------------------------------
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


# --- Health check ---------------------------------------------------------
@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


# --- Routers --------------------------------------------------------------
app.include_router(auth.router)
app.include_router(trades.router)
app.include_router(calc.router)
app.include_router(market.router)
app.include_router(templates.checklists_router)
app.include_router(templates.reasons_router)
app.include_router(export.router)
app.include_router(admin.router)
app.include_router(groups_router.router)
app.include_router(dashboard.router)
app.include_router(league_router.router)
app.include_router(uploads.router)
app.include_router(wallet.router)
app.include_router(ai.router)
app.include_router(settings_router.router)
app.include_router(exchanges_router.router)
app.include_router(password.auth_router)
app.include_router(password.settings_router)
app.include_router(public.router)
app.include_router(referrals_router.router)
app.include_router(service.router)
