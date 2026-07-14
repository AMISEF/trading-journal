"""Reconcile a user's Toobit futures activity into their journal.

Flow (per user, every ``TOOBIT_SYNC_INTERVAL`` seconds):
  1. discover the symbols they've traded recently (open positions + closed
     history);
  2. pull each symbol's fills since the last sync;
  3. group the fills into position instances and map them to journal fields
     (:mod:`app.services.toobit_import`);
  4. upsert one journal trade per position (``source="toobit"``), keyed by a
     stable ``toobit_position_id`` so repeated syncs update in place;
  5. render entry / exit chart images with the position overlay.

Everything is wrapped so one user's bad key can never break another's sync or
the app. ``sync_user`` accepts an injected client for testing.

⚠️ The live REST paths/field names come from the Toobit docs but haven't been
run against the real exchange here — validate on the server on first rollout.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core import crypto
from app.models.trade import Trade
from app.models.user import User
from app.services import toobit_chart
from app.services.toobit_client import ToobitClient, ToobitError
from app.services.toobit_import import ToobitFill  # used by _parse_fills (kept for tests)

logger = logging.getLogger("app.services.toobit_sync")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _base_symbol(contract: str) -> str:
    """"ARB-SWAP-USDT" -> "ARB" (journal stores the base symbol)."""
    return (contract or "").split("-")[0].upper()


def _f(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def client_for(user: User) -> ToobitClient | None:
    """Build a signed client from the user's stored credentials, or None."""
    key = crypto.decrypt(user.toobit_api_key_enc)
    secret = crypto.decrypt(user.toobit_secret_key_enc)
    if not key or not secret:
        return None
    return ToobitClient(
        key, secret,
        base_url=settings.TOOBIT_BASE_URL,
        recv_window=settings.TOOBIT_RECV_WINDOW,
    )


def _parse_fills(rows: list[dict]) -> dict[str, list[ToobitFill]]:
    """Group raw userTrades rows by contract symbol into ToobitFill lists."""
    by_symbol: dict[str, list[ToobitFill]] = {}
    for r in rows or []:
        price, qty = _f(r.get("price")), _f(r.get("qty"))
        side = (r.get("side") or "").upper()
        ts = r.get("time")
        if price is None or qty is None or not side or ts is None:
            continue
        try:
            when = datetime.fromtimestamp(int(ts) / 1000, tz=timezone.utc)
        except (TypeError, ValueError, OSError):
            continue
        sym = r.get("symbol") or ""
        by_symbol.setdefault(sym, []).append(ToobitFill(when, side, price, qty))
    return by_symbol


def _dt(ms) -> datetime | None:
    try:
        return datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


def _fields_from_open(p: dict) -> dict | None:
    """Journal fields for one OPEN position (GET /futures/positions).

    Uses the exchange's own units — avgPrice, positionValue and margin — so the
    contract-vs-base quantity quirk in the fills feed never affects us.
    """
    sym = p.get("symbol")
    entry = _f(p.get("avgPrice"))
    if not sym or not entry:
        return None
    side = (p.get("side") or "LONG").upper()
    lev = _f(p.get("leverage"))
    margin = _f(p.get("margin"))
    notional = _f(p.get("positionValue"))
    if (margin is None or margin <= 0) and notional and lev:
        margin = notional / lev
    return {
        "toobit_position_id": f"open:{sym}:{side}",
        "symbol": sym, "direction": side, "status": "OPEN",
        "entry_price": entry, "exit_price": None, "leverage": lev,
        "margin": margin, "realized_pnl": _f(p.get("realizedPnL")) or 0.0,
        "open_date": None, "close_date": None,
    }


def _fields_from_closed(h: dict) -> dict | None:
    """Journal fields for one CLOSED position (GET /futures/historyPositions).

    Carries the exchange's exact realized PnL (fees included) and the average
    open/close prices, keyed by the stable historical-position id.
    """
    sym = h.get("symbol")
    pid = h.get("id")
    entry = _f(h.get("openAvgPrice"))
    exit_ = _f(h.get("closeAvgPrice"))
    if not sym or not pid or not entry:
        return None
    side = (h.get("side") or "LONG").upper()
    lev = _f(h.get("leverage"))
    notional = _f(h.get("closeValue")) or ((_f(h.get("maxPosition")) or 0.0) * entry)
    margin = notional / lev if (notional and lev) else None
    return {
        "toobit_position_id": f"hist:{pid}",
        "symbol": sym, "direction": side, "status": "CLOSED",
        "entry_price": entry, "exit_price": exit_, "leverage": lev,
        "margin": margin, "realized_pnl": _f(h.get("realizedPnL")) or 0.0,
        "open_date": _dt(h.get("openTime")), "close_date": _dt(h.get("closeTime")),
    }


async def _next_trade_number(db: AsyncSession, user_id: int) -> int:
    res = await db.execute(
        select(func.coalesce(func.max(Trade.number), 0)).where(Trade.user_id == user_id)
    )
    return int(res.scalar() or 0) + 1


async def _upsert_trade(
    db: AsyncSession, user: User, fields: dict, leverage: float | None,
) -> tuple[Trade, bool]:
    """Create or update the journal row for one Toobit position."""
    pos_id = fields["toobit_position_id"]
    # selectinload is required: with async SQLAlchemy, touching take_profits on a
    # lazily-loaded trade raises MissingGreenlet and kills the whole upsert.
    res = await db.execute(
        select(Trade)
        .where(Trade.user_id == user.id, Trade.toobit_position_id == pos_id)
        .options(selectinload(Trade.take_profits))
    )
    trade = res.scalars().first()
    created = trade is None
    # Preserve the user's own edits, but keep everything else in sync with the
    # exchange. We only freeze a row once the user has edited it *after* the last
    # sync (updated_at noticeably later than synced_at). Untouched rows — including
    # ones imported by an older version — are refreshed so fixes reach them.
    if trade is not None and trade.synced_at is not None and trade.updated_at is not None:
        if trade.updated_at > trade.synced_at + timedelta(seconds=5):
            return trade, False
    if trade is None:
        trade = Trade(
            user_id=user.id,
            number=await _next_trade_number(db, user.id),
            source="toobit",
            toobit_position_id=pos_id,
            tags=["toobit"],
        )
        db.add(trade)

    trade.symbol = _base_symbol(fields["symbol"])
    trade.direction = fields["direction"]
    trade.status = fields["status"]
    trade.entry_price = fields["entry_price"]                 # avg open price
    trade.exit_price = fields.get("exit_price")               # avg close price (closed only)
    trade.stop_loss = None
    trade.leverage = fields.get("leverage")
    trade.is_risk_free_mgmt = bool(fields.get("is_risk_free_mgmt"))
    trade.realized_pnl = fields.get("realized_pnl")           # exact PnL from the exchange
    trade.open_date = fields.get("open_date")
    trade.close_date = fields.get("close_date")
    trade.synced_at = _utcnow()
    if not trade.tags:
        trade.tags = ["toobit"]

    # Record the real margin the trader committed. The journal derives margin as
    # balance_snapshot × margin_percent/100, so pin the snapshot to the margin and
    # the percent to 100 — then margin (e.g. 24), position size (24×leverage) and
    # PnL all come out right.
    margin = fields.get("margin")
    if margin and margin > 0:
        trade.balance_snapshot = margin
        trade.margin_percent = 100.0

    trade.take_profits.clear()
    await db.flush()
    return trade, created


async def _attach_charts(client: ToobitClient, trade: Trade, contract: str) -> None:
    """Generate the entry image once, and the exit image once the trade closes."""
    need_entry = not trade.image_before
    need_exit = trade.status == "CLOSED" and not trade.image_after
    if not (need_entry or need_exit):
        return
    try:
        rows = await client.klines(
            contract, settings.TOOBIT_CHART_INTERVAL, limit=120
        )
    except Exception as exc:  # noqa: BLE001 - charts are optional, never fatal
        logger.warning("toobit klines failed for %s: %s", contract, exc)
        return
    candles = toobit_chart.candles_from_klines(rows)
    if not candles:
        return
    target = trade.take_profits[-1].price if trade.take_profits else None
    if need_entry:
        svg = toobit_chart.render_position_svg(
            contract, trade.direction, candles,
            entry=trade.entry_price or 0.0, target=target, stop=trade.stop_loss,
            mode="entry",
        )
        trade.image_before = toobit_chart.save_chart(settings.UPLOAD_DIR, svg)
    if need_exit:
        svg = toobit_chart.render_position_svg(
            contract, trade.direction, candles,
            entry=trade.entry_price or 0.0, target=target, stop=trade.stop_loss,
            exit_price=trade.exit_price, mode="exit",
        )
        trade.image_after = toobit_chart.save_chart(settings.UPLOAD_DIR, svg)


async def sync_user(db: AsyncSession, user: User, client: ToobitClient | None = None) -> int:
    """Sync one user's Toobit futures into the journal. Returns rows touched."""
    client = client or client_for(user)
    if client is None:
        return 0

    since_ms = int((_utcnow() - timedelta(days=settings.TOOBIT_LOOKBACK_DAYS)).timestamp() * 1000)

    # Build straight from the authoritative endpoints (correct units + exact PnL):
    # open positions → OPEN trades, closed history → CLOSED trades. The userTrades
    # fills feed is intentionally NOT used for sizing (its qty is in contract units
    # that differ from the base amount, e.g. 5933 vs 593.3).
    touched = 0
    errors: list[str] = []
    chart_targets: list[tuple[Trade, str]] = []

    try:
        positions = await client.positions()
        history = await client.history_positions(start_ms=since_ms, limit=500)
    except ToobitError as exc:
        user.toobit_sync_error = str(exc)[:400]
        await db.commit()
        raise

    open_keys: set[tuple[str, str]] = set()
    for p in positions:
        fields = _fields_from_open(p)
        if not fields:
            continue
        open_keys.add((_base_symbol(fields["symbol"]), fields["direction"]))
        try:
            trade, _c = await _upsert_trade(db, user, fields, fields.get("leverage"))
            chart_targets.append((trade, fields["symbol"]))
            touched += 1
            await db.commit()
        except Exception as exc:  # noqa: BLE001
            await db.rollback()
            errors.append(f"{fields.get('symbol')}: {type(exc).__name__}: {exc}")
            logger.exception("toobit open import failed")

    for h in history:
        fields = _fields_from_closed(h)
        if not fields:
            continue
        try:
            trade, _c = await _upsert_trade(db, user, fields, fields.get("leverage"))
            chart_targets.append((trade, fields["symbol"]))
            touched += 1
            await db.commit()
        except Exception as exc:  # noqa: BLE001
            await db.rollback()
            errors.append(f"{fields.get('symbol')}: {type(exc).__name__}: {exc}")
            logger.exception("toobit closed import failed")

    # Remove phantom OPEN rows for positions that have since closed (they now live
    # as a hist:* row). Skip any the user edited after the last sync.
    try:
        existing = (await db.execute(
            select(Trade).where(
                Trade.user_id == user.id, Trade.source == "toobit",
                Trade.toobit_position_id.like("open:%"),
            )
        )).scalars().all()
        for t in existing:
            edited = (t.synced_at and t.updated_at and t.updated_at > t.synced_at + timedelta(seconds=5))
            still_open = (t.symbol, t.direction) in open_keys
            if not still_open and not edited:
                await db.delete(t)
        await db.commit()
    except Exception:  # noqa: BLE001
        await db.rollback()
        logger.exception("toobit phantom-open cleanup failed")

    # 5) charts: strictly best-effort, each isolated so image failures never
    # affect the already-committed trades.
    for trade, sym in chart_targets:
        try:
            await _attach_charts(client, trade, sym)
            await db.commit()
        except Exception:  # noqa: BLE001
            await db.rollback()
            logger.warning("toobit chart failed for %s (trade %s)", sym, trade.id)

    user.toobit_synced_at = _utcnow()
    # Surface exactly what failed in the settings panel; None when all clean.
    user.toobit_sync_error = ("; ".join(errors))[:400] if errors else None
    await db.commit()
    return touched


async def sync_all_users(session_factory) -> None:
    """Run one sync pass for every user that has Toobit credentials."""
    async with session_factory() as db:
        res = await db.execute(
            select(User).where(User.toobit_api_key_enc.is_not(None),
                               User.toobit_secret_key_enc.is_not(None))
        )
        users = list(res.scalars().all())
    for user in users:
        async with session_factory() as db:
            fresh = await db.get(User, user.id)
            if fresh is None:
                continue
            try:
                await sync_user(db, fresh)
            except ToobitError as exc:
                fresh.toobit_sync_error = str(exc)[:400]
                await db.commit()
                logger.warning("toobit sync failed for user %s: %s", fresh.id, exc)
            except Exception:  # noqa: BLE001 - never let one user break the loop
                logger.exception("unexpected toobit sync error for user %s", fresh.id)
