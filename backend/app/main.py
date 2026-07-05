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
    export,
    market,
    templates,
    trades,
    uploads,
    wallet,
    subscription,
)
from app.core.config import settings
from app.db.session import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run once on startup: ensure the uploads folder and DB tables exist."""
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    await init_db()
    yield
    # (Nothing to clean up on shutdown for Phase 1.)


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
app.include_router(dashboard.router)
app.include_router(uploads.router)
app.include_router(wallet.router)
app.include_router(subscription.router)
app.include_router(ai.router)
