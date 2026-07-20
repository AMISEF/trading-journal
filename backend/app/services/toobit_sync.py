"""Reconcile a user's Toobit futures activity into their journal.

Flow (per user, every ``TOOBIT_SYNC_INTERVAL`` seconds):
  1. discover the symbols they've traded recently (open positions + closed
     history);
  2. pull each symbol's fills since the last sync;
  3. group the fills into position instances and map them to journal fields
     (:mod:`app.services.toobit_import`);
  4. upsert one journal trade per position (``source="toobit"``), keyed by a
     stable ``toobit_position_id`` so repeated syncs update in place;
  5. enrich each trade with the entry ladder + partial take-profits reconstructed
     from the fills.

Everything is wrapped so one user's bad key can never break another's sync or
the app. ``sync_user`` accepts an injected client for testing.

⚠️ The live REST paths/field names come from the Toobit docs but haven't been
run against the real exchange here — validate on the server on first rollout.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core import crypto
from app.models.trade import TakeProfit, Trade
from app.models.user import User
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


# --- fill-level reconstruction (entry ladders + partial take-profits) ---------
# The authoritative position endpoints give exact PnL/margin/avg prices but hide
# *how* the trade was built. The userTrades fills feed exposes each executed
# piece, so we reconstruct the ladder: every opening fill price becomes an entry
# level, every profitable closing fill becomes a take-profit (with the % of the
# position closed there), and a losing trade's close becomes the stop. The fills'
# qty is in contract units (a constant multiple of the base amount), but we only
# ever use *ratios* and prices here, so that scale cancels out.

def _plain_fills(rows: list[dict]) -> list[dict]:
    """Normalise raw userTrades rows to {price, qty, side (BUY/SELL), ts}."""
    out: list[dict] = []
    for r in rows or []:
        price, qty = _f(r.get("price")), _f(r.get("qty"))
        raw_side = (r.get("side") or "").upper()
        side = "BUY" if raw_side.startswith("BUY") else "SELL" if raw_side.startswith("SELL") else ""
        when = _dt(r.get("time"))
        if price is None or qty is None or qty <= 0 or price <= 0 or not side or when is None:
            continue
        out.append({"price": price, "qty": qty, "side": side, "ts": when})
    out.sort(key=lambda f: f["ts"])
    return out


def _window_closed(fills: list[dict], open_dt: datetime | None, close_dt: datetime | None) -> list[dict]:
    """Fills belonging to one closed position, by its [open, close] time window."""
    lo = (open_dt.timestamp() - 60) if open_dt else None
    hi = (close_dt.timestamp() + 60) if close_dt else None
    out = []
    for f in fills:
        t = f["ts"].timestamp()
        if lo is not None and t < lo:
            continue
        if hi is not None and t > hi:
            continue
        out.append(f)
    return out


def _current_open_segment(fills: list[dict], direction: str) -> list[dict]:
    """The fills of the still-open position instance (from the last flat point)."""
    open_side = "BUY" if direction == "LONG" else "SELL"
    seg: list[dict] = []
    net = 0.0
    for f in fills:
        delta = f["qty"] if f["side"] == open_side else -f["qty"]
        if net <= 1e-9 and delta > 0:
            seg = []  # a fresh instance starts here
        seg.append(f)
        net += delta
        if net <= 1e-9:
            seg = []  # returned to flat — previous instance is fully closed
            net = 0.0
    return seg


def _reconstruct(direction: str, fills: list[dict], *, is_loss: bool, fallback_exit: float | None) -> dict:
    """Derive entry levels, take-profits and stop from one position's fills."""
    open_side = "BUY" if direction == "LONG" else "SELL"
    opens = [f for f in fills if f["side"] == open_side]
    closes = [f for f in fills if f["side"] != open_side]
    opened_qty = sum(f["qty"] for f in opens)
    if opened_qty <= 0:
        return {}
    avg_entry = sum(f["price"] * f["qty"] for f in opens) / opened_qty

    # Entry levels: one per opening fill (merge consecutive fills at the same price).
    merged: list[list[float]] = []
    for f in sorted(opens, key=lambda x: x["ts"]):
        if merged and abs(merged[-1][0] - f["price"]) < 1e-12:
            merged[-1][1] += f["qty"]
        else:
            merged.append([f["price"], f["qty"]])
    entry_levels = [
        {"order": i + 1, "price": round(p, 10),
         "margin_percent": round(q / opened_qty * 100.0, 2), "is_activated": True}
        for i, (p, q) in enumerate(merged)
    ]

    take_profits: list[dict] = []
    stop_loss: float | None = None
    if is_loss:
        # Losing trade → its close price is the stop; no realised targets.
        stop_loss = fallback_exit or (closes[-1]["price"] if closes else None)
    else:
        for f in sorted(closes, key=lambda x: x["ts"]):
            profit = (f["price"] > avg_entry) if direction == "LONG" else (f["price"] < avg_entry)
            if profit:
                take_profits.append({
                    "order": len(take_profits) + 1,
                    "price": round(f["price"], 10),
                    "save_percent": round(min(f["qty"] / opened_qty, 1.0) * 100.0, 2),
                })

    return {"entry_levels": entry_levels, "take_profits": take_profits, "stop_loss": stop_loss}


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
    # Best-effort open time (field name varies across Toobit deploys).
    open_dt = _dt(p.get("createTime") or p.get("openTime") or p.get("ctime") or p.get("time"))
    return {
        "toobit_position_id": f"open:{sym}:{side}",
        "symbol": sym, "direction": side, "status": "OPEN",
        "entry_price": entry, "exit_price": None, "leverage": lev,
        "margin": margin, "realized_pnl": _f(p.get("realizedPnL")) or 0.0,
        "open_date": open_dt, "close_date": None,
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
    res = await db.execute(
        select(Trade)
        .where(Trade.user_id == user.id, Trade.toobit_position_id == pos_id)
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
    trade.stop_loss = fields.get("stop_loss")                 # set on a losing close
    trade.entry_levels = fields.get("entry_levels") or []     # the entry ladder (پله‌ها)
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

    # Achieved R for imported trades. Toobit doesn't expose the bot's intended
    # stop (there's no reliable per-trade SL for a winner), so we express the
    # realised PnL as a multiple of the committed margin — a consistent, always
    # defined risk unit. Only meaningful once the position has closed.
    realized = fields.get("realized_pnl")
    if fields["status"] == "CLOSED" and margin and margin > 0 and realized is not None:
        trade.rr_achieved = round(realized / margin, 4)
    else:
        trade.rr_achieved = None

    # Rebuild the take-profit ladder from the reconstructed partial closes.
    # We do this with Core DELETE/INSERT keyed by trade_id rather than mutating
    # trade.take_profits: touching that lazily-loaded relationship under async
    # SQLAlchemy raises MissingGreenlet (IO in a sync context) and aborts the
    # whole position's upsert.
    await db.flush()  # ensure a new trade has its PK before we key on trade.id
    await db.execute(delete(TakeProfit).where(TakeProfit.trade_id == trade.id))
    order = 0
    for tp in fields.get("take_profits") or []:
        price = tp.get("price")
        if price is None:
            continue
        order += 1
        db.add(
            TakeProfit(
                trade_id=trade.id,
                order=int(tp.get("order") or order),
                price=float(price),
                save_percent=float(tp.get("save_percent") or 0.0),
            )
        )
    await db.flush()
    return trade, created


async def _fills_for_contract(
    client: ToobitClient, contract: str, cache: dict[str, list[dict]], since_ms: int | None
) -> list[dict]:
    """Fetch (and cache) one contract's normalised fills. Never fatal."""
    if contract in cache:
        return cache[contract]
    try:
        rows = await client.user_trades(contract, start_ms=since_ms, limit=1000)
        fills = _plain_fills(rows)
    except Exception as exc:  # noqa: BLE001 - fills are optional enrichment
        logger.warning("toobit userTrades failed for %s: %s", contract, exc)
        fills = []
    cache[contract] = fills
    return fills


async def sync_user(db: AsyncSession, user: User, client: ToobitClient | None = None) -> int:
    """Sync one user's Toobit futures into the journal. Returns rows touched.

    Sizing/PnL come from the authoritative position endpoints (correct units +
    exact PnL); the userTrades fills feed is used only to reconstruct the entry
    ladder (پله‌ها) and partial take-profits, where relative ratios (not absolute
    contract-unit quantities) are all that matter. Only positions opened at/after
    the user connected their key are imported.
    """
    client = client or client_for(user)
    if client is None:
        return 0

    key_floor = user.toobit_key_at
    lookback_ms = int((_utcnow() - timedelta(days=settings.TOOBIT_LOOKBACK_DAYS)).timestamp() * 1000)
    floor_ms = int(key_floor.timestamp() * 1000) if key_floor else None
    since_ms = max(lookback_ms, floor_ms) if floor_ms else lookback_ms

    touched = 0
    errors: list[str] = []
    fills_cache: dict[str, list[dict]] = {}

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
        # Skip positions opened before the key was connected.
        if key_floor and fields.get("open_date") and fields["open_date"] < key_floor:
            continue
        open_keys.add((_base_symbol(fields["symbol"]), fields["direction"]))
        try:
            fills = await _fills_for_contract(client, fields["symbol"], fills_cache, since_ms)
            seg = _current_open_segment(fills, fields["direction"])
            fields.update(_reconstruct(fields["direction"], seg, is_loss=False, fallback_exit=None))
            await _upsert_trade(db, user, fields, fields.get("leverage"))
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
        if key_floor and fields.get("open_date") and fields["open_date"] < key_floor:
            continue
        try:
            is_loss = (fields.get("realized_pnl") or 0.0) < 0
            fills = await _fills_for_contract(client, fields["symbol"], fills_cache, since_ms)
            window = _window_closed(fills, fields.get("open_date"), fields.get("close_date"))
            fields.update(_reconstruct(
                fields["direction"], window, is_loss=is_loss, fallback_exit=fields.get("exit_price")
            ))
            # Fallbacks when fills are unavailable: a loss's close is the stop; a
            # win with no reconstructed ladder still shows the exit as the target.
            if is_loss and not fields.get("stop_loss"):
                fields["stop_loss"] = fields.get("exit_price")
            if not is_loss and not fields.get("take_profits") and fields.get("exit_price"):
                fields["take_profits"] = [
                    {"order": 1, "price": fields["exit_price"], "save_percent": 100.0}
                ]
            await _upsert_trade(db, user, fields, fields.get("leverage"))
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
    from app.services import plans

    for user in users:
        async with session_factory() as db:
            fresh = await db.get(User, user.id)
            if fresh is None:
                continue
            # Toobit sync is a gold-only feature — skip users who aren't on gold
            # (e.g. downgraded/expired) so their import quietly stops.
            if not plans.can_use_toobit(fresh):
                continue
            try:
                await sync_user(db, fresh)
            except ToobitError as exc:
                fresh.toobit_sync_error = str(exc)[:400]
                await db.commit()
                logger.warning("toobit sync failed for user %s: %s", fresh.id, exc)
            except Exception:  # noqa: BLE001 - never let one user break the loop
                logger.exception("unexpected toobit sync error for user %s", fresh.id)
