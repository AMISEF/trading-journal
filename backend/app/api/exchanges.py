"""Multi-exchange API-key settings (LBank / XT / Ourbit / WEEX + Toobit).

One uniform surface for the «تنظیمات API» tab:

    GET    /api/settings/exchanges                 → every exchange + status
    PUT    /api/settings/exchanges/{slug}/api-key  → store credentials
    DELETE /api/settings/exchanges/{slug}/api-key  → remove credentials
    POST   /api/settings/exchanges/{slug}/sync     → sync now
    GET    /api/settings/exchanges/{slug}/debug    → raw diagnostics

``toobit`` is served from the legacy ``users.toobit_*`` columns so the existing,
proven Toobit pipeline keeps working untouched; every other slug is stored in
``exchange_credentials`` and driven by :mod:`app.services.exchange_sync`.

Secrets are encrypted at rest and never returned — only a masked preview.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import crypto
from app.core.config import settings as app_settings
from app.core.deps import get_current_user, get_db
from app.models.exchange_credential import ExchangeCredential
from app.models.user import User
from app.services import exchange_sync, plans, toobit_sync
from app.services.exchanges import EXCHANGES, ExchangeError, client_for_credential, get_meta
from app.services.toobit_client import ToobitError

router = APIRouter(prefix="/api/settings/exchanges", tags=["exchanges"])

_KEY_RE = re.compile(r"^[A-Za-z0-9_\-\.:]{8,256}$")


class ExchangeKeyIn(BaseModel):
    api_key: str = Field(..., alias="apiKey", min_length=8, max_length=256)
    secret_key: str = Field(..., alias="secretKey", min_length=8, max_length=256)
    passphrase: str | None = Field(None, max_length=256)

    model_config = {"populate_by_name": True}

    @field_validator("api_key", "secret_key")
    @classmethod
    def _valid(cls, v: str) -> str:
        v = (v or "").strip()
        if not _KEY_RE.match(v):
            raise ValueError("کلید واردشده معتبر نیست.")
        return v

    @field_validator("passphrase")
    @classmethod
    def _pass(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        return v or None


def _meta_or_404(slug: str):
    meta = get_meta(slug)
    if meta is None:
        raise HTTPException(status_code=404, detail="صرافی پشتیبانی نمی‌شود.")
    return meta


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _toobit_status(user: User) -> dict:
    meta = EXCHANGES["toobit"]
    connected = bool(user.toobit_api_key_enc and user.toobit_secret_key_enc)
    plain = crypto.decrypt(user.toobit_api_key_enc) if user.toobit_api_key_enc else None
    return {
        "slug": meta.slug,
        "label": meta.label,
        "color": meta.color,
        "needsPassphrase": meta.needs_passphrase,
        "legacy": True,
        "docsUrl": meta.docs_url,
        "connected": connected,
        "apiKeyMasked": crypto.mask(plain) if plain else None,
        "hasSecret": bool(user.toobit_secret_key_enc),
        "keyAt": _iso(user.toobit_key_at),
        "syncedAt": _iso(user.toobit_synced_at),
        "syncError": user.toobit_sync_error,
    }


def _generic_status(slug: str, credential: ExchangeCredential | None) -> dict:
    meta = EXCHANGES[slug]
    plain = crypto.decrypt(credential.api_key_enc) if (credential and credential.api_key_enc) else None
    return {
        "slug": meta.slug,
        "label": meta.label,
        "color": meta.color,
        "needsPassphrase": meta.needs_passphrase,
        "legacy": False,
        "docsUrl": meta.docs_url,
        "connected": bool(credential and credential.api_key_enc and credential.secret_key_enc),
        "apiKeyMasked": crypto.mask(plain) if plain else None,
        "hasSecret": bool(credential and credential.secret_key_enc),
        "keyAt": _iso(credential.key_at) if credential else None,
        "syncedAt": _iso(credential.synced_at) if credential else None,
        "syncError": credential.sync_error if credential else None,
    }


async def _all_status(db: AsyncSession, user: User) -> list[dict]:
    from sqlalchemy import select

    rows = (await db.execute(
        select(ExchangeCredential).where(ExchangeCredential.user_id == user.id)
    )).scalars().all()
    by_slug = {r.exchange: r for r in rows}
    out: list[dict] = []
    for slug, meta in EXCHANGES.items():
        out.append(_toobit_status(user) if meta.legacy else _generic_status(slug, by_slug.get(slug)))
    return out


@router.get("")
async def list_exchanges(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Every supported exchange with the caller's connection status."""
    return JSONResponse({
        "canUse": plans.can_use_toobit(user),
        "syncIntervalSeconds": max(15, app_settings.TOOBIT_SYNC_INTERVAL),
        "exchanges": await _all_status(db, user),
    })


@router.put("/{slug}/api-key")
async def save_key(
    slug: str,
    body: ExchangeKeyIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Store (encrypted) the user's API credentials for one exchange.

    ``key_at`` is stamped the first time so the importer only brings in trades
    opened from the moment the key was connected.
    """
    meta = _meta_or_404(slug)
    plans.assert_can_use_toobit(user)  # diamond-only feature
    if meta.needs_passphrase and not body.passphrase:
        raise HTTPException(status_code=400, detail=f"برای صرافی {meta.label} وارد کردن Passphrase الزامی است.")

    now = datetime.now(timezone.utc)
    if meta.legacy:
        first_time = not user.toobit_api_key_enc
        user.toobit_api_key_enc = crypto.encrypt(body.api_key)
        user.toobit_secret_key_enc = crypto.encrypt(body.secret_key)
        if first_time or user.toobit_key_at is None:
            user.toobit_key_at = now
        user.toobit_sync_error = None
        await db.commit()
        await db.refresh(user)
    else:
        credential = await exchange_sync.get_credential(db, user.id, meta.slug)
        if credential is None:
            credential = ExchangeCredential(user_id=user.id, exchange=meta.slug, key_at=now)
            db.add(credential)
        credential.api_key_enc = crypto.encrypt(body.api_key)
        credential.secret_key_enc = crypto.encrypt(body.secret_key)
        credential.passphrase_enc = crypto.encrypt(body.passphrase) if body.passphrase else None
        if credential.key_at is None:
            credential.key_at = now
        credential.sync_error = None
        await db.commit()
    return JSONResponse({"exchanges": await _all_status(db, user)})


@router.delete("/{slug}/api-key")
async def delete_key(
    slug: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Remove the stored credentials for one exchange (journal rows are kept)."""
    meta = _meta_or_404(slug)
    if meta.legacy:
        user.toobit_api_key_enc = None
        user.toobit_secret_key_enc = None
        user.toobit_key_at = None
        user.toobit_sync_error = None
        await db.commit()
        await db.refresh(user)
    else:
        credential = await exchange_sync.get_credential(db, user.id, meta.slug)
        if credential is not None:
            await db.delete(credential)
            await db.commit()
    return JSONResponse({"exchanges": await _all_status(db, user)})


@router.post("/{slug}/sync")
async def sync_now(
    slug: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Trigger an immediate import for one exchange."""
    meta = _meta_or_404(slug)
    plans.assert_can_use_toobit(user)

    if meta.legacy:
        if not (user.toobit_api_key_enc and user.toobit_secret_key_enc):
            raise HTTPException(status_code=400, detail="ابتدا API Key و Secret Key را ذخیره کنید.")
        try:
            touched = await toobit_sync.sync_user(db, user)
        except ToobitError as exc:
            await db.rollback()
            user.toobit_sync_error = str(exc)[:400]
            await db.commit()
            raise HTTPException(status_code=502, detail=f"خطا در ارتباط با توبیت: {exc}") from exc
        except Exception as exc:  # noqa: BLE001
            await db.rollback()
            msg = f"{type(exc).__name__}: {exc}"
            user.toobit_sync_error = msg[:400]
            await db.commit()
            raise HTTPException(status_code=500, detail=f"خطای داخلی در همگام‌سازی: {msg[:300]}") from exc
        await db.refresh(user)
        return JSONResponse({"touched": touched, "exchanges": await _all_status(db, user)})

    credential = await exchange_sync.get_credential(db, user.id, meta.slug)
    if credential is None or not (credential.api_key_enc and credential.secret_key_enc):
        raise HTTPException(status_code=400, detail="ابتدا API Key و Secret Key را ذخیره کنید.")
    try:
        touched = await exchange_sync.sync_user_exchange(db, user, credential)
    except ExchangeError as exc:
        await db.rollback()
        credential = await exchange_sync.get_credential(db, user.id, meta.slug)
        if credential is not None:
            credential.sync_error = str(exc)[:400]
            await db.commit()
        raise HTTPException(status_code=502, detail=f"خطا در ارتباط با {meta.label}: {exc}") from exc
    except Exception as exc:  # noqa: BLE001 - surface the REAL error, never a blank 500
        await db.rollback()
        msg = f"{type(exc).__name__}: {exc}"
        credential = await exchange_sync.get_credential(db, user.id, meta.slug)
        if credential is not None:
            credential.sync_error = msg[:400]
            await db.commit()
        raise HTTPException(status_code=500, detail=f"خطای داخلی در همگام‌سازی: {msg[:300]}") from exc
    return JSONResponse({"touched": touched, "exchanges": await _all_status(db, user)})


@router.get("/{slug}/debug")
async def debug(
    slug: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Self-serve diagnostics: which endpoint path answered, and a raw sample.

    Public REST paths differ slightly between an exchange's doc site and its
    live deployment, so each adapter probes a list of candidates and caches the
    winner. This endpoint exposes exactly what happened — no server logs needed.
    """
    meta = _meta_or_404(slug)
    since_ms = int(
        (datetime.now(timezone.utc) - timedelta(days=app_settings.TOOBIT_LOOKBACK_DAYS)).timestamp() * 1000
    )
    if meta.legacy:
        raise HTTPException(status_code=400, detail="برای توبیت از /api/settings/toobit-debug استفاده کنید.")

    credential = await exchange_sync.get_credential(db, user.id, meta.slug)
    if credential is None or not (credential.api_key_enc and credential.secret_key_enc):
        raise HTTPException(status_code=400, detail="ابتدا API Key و Secret Key را ذخیره کنید.")
    try:
        client = client_for_credential(credential)
    except ExchangeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        report = await client.debug(start_ms=since_ms)
    except Exception as exc:  # noqa: BLE001
        report = {"fatal": f"{type(exc).__name__}: {exc}"}
    return JSONResponse({
        "slug": meta.slug,
        "label": meta.label,
        "baseUrl": meta.base_url,
        "lookbackDays": app_settings.TOOBIT_LOOKBACK_DAYS,
        "report": report,
    })
