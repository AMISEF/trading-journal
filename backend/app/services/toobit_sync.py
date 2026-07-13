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
from app.models.trade import TakeProfit, Trade
from app.models.user import User
from app.services import toobit_chart
from app.services.toobit_client import ToobitClient, ToobitError
from app.services.toobit_import import ToobitFill, build_trades_from_toobit_fills

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
    # A closed Toobit trade is final: don't rebuild it on later polls. This both
    # avoids clobbering any edits the user made to the closed trade and keeps the
    # import idempotent when we re-scan the lookback window.
    if trade is not None and trade.status == "CLOSED":
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
    trade.entry_price = fields["entry_price"]
    trade.leverage = leverage if leverage is not None else fields.get("leverage")
    trade.stop_loss = fields["stop_loss"]
    trade.exit_price = fields["exit_price"]
    trade.is_risk_free_mgmt = fields["is_risk_free_mgmt"]
    trade.realized_pnl = fields["realized_pnl"]
    trade.open_date = fields["open_date"]
    trade.close_date = fields["close_date"]
    trade.synced_at = _utcnow()
    if not trade.tags:
        trade.tags = ["toobit"]

    # Replace take-profits with the freshly computed set.
    trade.take_profits.clear()
    for tp in fields["take_profits"]:
        trade.take_profits.append(
            TakeProfit(order=tp["order"], price=tp["price"], save_percent=tp["save_percent"])
        )
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

    # Always scan a fixed lookback window rather than only new fills: an open
    # position started before the last poll needs its *full* fill history for a
    # correct weighted entry. Closed trades are frozen on upsert, so re-scanning
    # is idempotent and cheap.
    since = _utcnow() - timedelta(days=settings.TOOBIT_LOOKBACK_DAYS)
    since_ms = int(since.timestamp() * 1000)

    # 1) discover symbols + leverage from open + closed positions.
    leverage_by_symbol: dict[str, float] = {}
    symbols: set[str] = set()
    positions = await client.positions()
    history = await client.history_positions(start_ms=since_ms)
    for p in [*positions, *history]:
        sym = p.get("symbol")
        if not sym:
            continue
        symbols.add(sym)
        lev = _f(p.get("leverage"))
        if lev:
            leverage_by_symbol[sym] = lev

    # 2) pull fills per symbol, 3) map them into trades, and 4) upsert. The
    # import is committed per symbol so a later failure (e.g. chart rendering)
    # can never roll back trades that were already imported.
    touched = 0
    errors: list[str] = []
    chart_targets: list[tuple[Trade, str]] = []
    for sym in symbols:
        try:
            rows = await client.user_trades(sym, start_ms=since_ms)
            fills = _parse_fills(rows).get(sym, [])
            if not fills:
                continue
            trades = build_trades_from_toobit_fills(
                sym, fills, leverage=leverage_by_symbol.get(sym)
            )
            for fields in trades:
                trade, _created = await _upsert_trade(db, user, fields, leverage_by_symbol.get(sym))
                chart_targets.append((trade, sym))
                touched += 1
            await db.commit()
        except ToobitError as exc:
            await db.rollback()
            errors.append(f"{sym}: {exc}")
            logger.warning("toobit userTrades failed for %s: %s", sym, exc)
            continue
        except Exception as exc:  # noqa: BLE001 - one symbol must not sink the rest
            await db.rollback()
            errors.append(f"{sym}: {type(exc).__name__}: {exc}")
            logger.exception("toobit import failed for %s", sym)
            continue

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
