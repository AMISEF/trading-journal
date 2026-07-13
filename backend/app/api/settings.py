"""User settings routes — currently the Toobit exchange API key.

The key is encrypted at rest (app.core.crypto) and never returned in plaintext;
responses only carry ``hasToobitApiKey`` + a masked preview via the standard
UserOut serializer.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import crud
from app.api.serializers import user_to_out
from app.core import crypto
from app.core.config import settings
from app.core.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.user import ToobitApiKeyIn, UserOut
from app.services import toobit_sync
from app.services.toobit_client import ToobitError

router = APIRouter(prefix="/api/settings", tags=["settings"])


async def _user_out(db: AsyncSession, user: User) -> UserOut:
    trades = await crud.load_user_trades(db, user.id)
    transactions = await crud.load_user_transactions(db, user.id)
    return user_to_out(user, trades, transactions)


@router.put("/toobit-api-key", response_model=UserOut)
async def save_toobit_api_key(
    body: ToobitApiKeyIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """Store (encrypted) the user's Toobit Access API Key and Secret Key."""
    user.toobit_api_key_enc = crypto.encrypt(body.access_api_key)
    if body.secret_api_key:
        user.toobit_secret_key_enc = crypto.encrypt(body.secret_api_key)
    await db.commit()
    await db.refresh(user)
    return await _user_out(db, user)


@router.delete("/toobit-api-key", response_model=UserOut)
async def delete_toobit_api_key(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """Remove the stored Toobit API credentials."""
    user.toobit_api_key_enc = None
    user.toobit_secret_key_enc = None
    await db.commit()
    await db.refresh(user)
    return await _user_out(db, user)


@router.get("/toobit-debug")
async def toobit_debug(
    user: User = Depends(get_current_user),
    _db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Self-serve diagnostics: show the *raw* Toobit responses so a mismatch in
    shape/auth/paths is visible without server logs. Only the caller's own data.
    """
    client = toobit_sync.client_for(user)
    if client is None:
        raise HTTPException(status_code=400, detail="ابتدا Access API Key و Secret Key را ذخیره کنید.")

    since_ms = int((datetime.now(timezone.utc) - timedelta(days=settings.TOOBIT_LOOKBACK_DAYS)).timestamp() * 1000)
    out: dict = {"base_url": settings.TOOBIT_BASE_URL, "lookback_days": settings.TOOBIT_LOOKBACK_DAYS}

    async def probe(name: str, coro):
        try:
            raw = await coro
            out[name] = {"ok": True, "type": type(raw).__name__,
                         "sample": raw[:2] if isinstance(raw, list) else raw}
        except Exception as exc:  # noqa: BLE001 - surface the exact failure
            out[name] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}

    # Raw (un-normalised) calls so wrappers/errors are visible as-is.
    await probe("positions_raw", client._get("/api/v1/futures/positions", {}, signed=True))
    await probe("historyPositions_raw",
                client._get("/api/v1/futures/historyPositions", {"startTime": since_ms, "limit": 5}, signed=True))
    # Discover a symbol to probe userTrades.
    symbol = None
    for key in ("positions_raw", "historyPositions_raw"):
        rows = client._as_list(out.get(key, {}).get("sample"))
        for r in rows:
            if isinstance(r, dict) and r.get("symbol"):
                symbol = r["symbol"]; break
        if symbol:
            break
    out["discovered_symbol"] = symbol
    if symbol:
        await probe("userTrades_raw",
                    client._get("/api/v1/futures/userTrades", {"symbol": symbol, "startTime": since_ms, "limit": 5}, signed=True))
    # Also probe a *closed* symbol's fills, to confirm history fills are returned.
    closed_rows = client._as_list(out.get("historyPositions_raw", {}).get("sample"))
    closed_sym = next((r.get("symbol") for r in closed_rows if isinstance(r, dict) and r.get("symbol")), None)
    out["closed_symbol"] = closed_sym
    if closed_sym and closed_sym != symbol:
        await probe("closed_userTrades_raw",
                    client._get("/api/v1/futures/userTrades", {"symbol": closed_sym, "startTime": since_ms, "limit": 5}, signed=True))
    return JSONResponse(out)


@router.post("/toobit-sync", response_model=UserOut)
async def sync_toobit_now(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """Trigger an immediate Toobit futures import for the current user."""
    if not (user.toobit_api_key_enc and user.toobit_secret_key_enc):
        raise HTTPException(status_code=400, detail="ابتدا Access API Key و Secret Key را ذخیره کنید.")
    try:
        await toobit_sync.sync_user(db, user)
    except ToobitError as exc:
        await db.rollback()
        user.toobit_sync_error = str(exc)[:400]
        await db.commit()
        raise HTTPException(status_code=502, detail=f"خطا در ارتباط با توبیت: {exc}") from exc
    except Exception as exc:  # noqa: BLE001 - surface the REAL error, never a blank 500
        await db.rollback()
        msg = f"{type(exc).__name__}: {exc}"
        user.toobit_sync_error = msg[:400]
        await db.commit()
        raise HTTPException(status_code=500, detail=f"خطای داخلی در همگام‌سازی: {msg[:300]}") from exc
    await db.refresh(user)
    return await _user_out(db, user)
