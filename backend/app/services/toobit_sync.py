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


def _ts_dt(dt: datetime | None) -> float:
    """Sortable epoch seconds tolerating None and naive/aware datetimes."""
    if dt is None:
        return 0.0
    try:
        return dt.timestamp()
    except (ValueError, OverflowError, OSError):
        return 0.0


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


def _split_instances(fills: list[dict]) -> list[dict]:
    """Split one contract's time-ordered fills into position *instances*.

    An instance starts with the first fill after being flat and ends when the
    net quantity returns to zero. This is the unit the journal cares about: one
    instance = one trade, no matter how many entries (پله) or partial exits it
    had — Toobit's historyPositions returns one row per *close event*, which is
    why importing rows 1:1 created duplicates.
    """
    out: list[dict] = []
    cur: list[dict] = []
    open_side = ""
    net = 0.0
    for f in fills:
        if not cur:
            open_side = f["side"]
            net = 0.0
        cur.append(f)
        net += f["qty"] if f["side"] == open_side else -f["qty"]
        if net <= 1e-9 and any(x["side"] != open_side for x in cur):
            out.append({
                "direction": "LONG" if open_side == "BUY" else "SHORT",
                "fills": cur,
                "closed": True,
            })
            cur = []
    if cur:
        out.append({
            "direction": "LONG" if open_side == "BUY" else "SHORT",
            "fills": cur,
            "closed": False,
        })
    return out


def _merge_by_price(rows: list[dict]) -> list[list[float]]:
    """[(price, qty)] with consecutive same-price fills merged (one order often
    executes as several fills at the same price)."""
    merged: list[list[float]] = []
    for f in sorted(rows, key=lambda x: x["ts"]):
        if merged and abs(merged[-1][0] - f["price"]) < 1e-12:
            merged[-1][1] += f["qty"]
        else:
            merged.append([f["price"], f["qty"]])
    return merged


def _fields_from_instance(
    contract: str, inst: dict, hist_rows: list[dict], used_hist: set,
) -> dict | None:
    """Build the journal fields for one CLOSED position instance.

    Structure (entries/TPs/stop/dates) comes from the fills; the authoritative
    money numbers (realized PnL, leverage, margin) come from the historyPositions
    rows whose close time falls inside the instance's window — all of them, since
    Toobit emits one row per partial close.
    """
    fills = inst["fills"]
    direction = inst["direction"]
    open_side = "BUY" if direction == "LONG" else "SELL"
    opens = [f for f in fills if f["side"] == open_side]
    closes = [f for f in fills if f["side"] != open_side]
    opened_qty = sum(f["qty"] for f in opens)
    closed_qty = sum(f["qty"] for f in closes)
    if opened_qty <= 0 or not closes:
        return None
    avg_entry = sum(f["price"] * f["qty"] for f in opens) / opened_qty
    avg_exit = sum(f["price"] * f["qty"] for f in closes) / closed_qty

    open_dt: datetime = fills[0]["ts"]
    close_dt: datetime = fills[-1]["ts"]

    # ── authoritative numbers from the matching history rows ──
    lo = open_dt - timedelta(seconds=120)
    hi = close_dt + timedelta(seconds=120)
    matched: list[dict] = []
    for h in hist_rows:
        hid = h.get("id")
        if hid in used_hist:
            continue
        if (h.get("side") or "LONG").upper() != direction:
            continue
        cdt = _dt(h.get("closeTime"))
        if cdt is None or cdt < lo or cdt > hi:
            continue
        matched.append(h)
    if not matched:
        # No authoritative record (e.g. the instance is a tail of an older
        # position that started before the fetch window) — don't guess.
        return None
    for h in matched:
        used_hist.add(h.get("id"))

    realized = sum(_f(h.get("realizedPnL")) or 0.0 for h in matched)
    leverage = next((_f(h.get("leverage")) for h in matched if _f(h.get("leverage"))), None)
    close_value = sum(_f(h.get("closeValue")) or 0.0 for h in matched)
    if not close_value:
        close_value = sum(
            (_f(h.get("maxPosition")) or 0.0) * (_f(h.get("openAvgPrice")) or 0.0)
            for h in matched
        )
    margin = (close_value / leverage) if (close_value and leverage) else None

    # ── entry ladder: one level per distinct opening price ──
    entry_levels = [
        {"order": i + 1, "price": round(p, 10),
         "margin_percent": round(q / opened_qty * 100.0, 2), "is_activated": True}
        for i, (p, q) in enumerate(_merge_by_price(opens))
    ]

    # ── exits: profit-side partial closes are TPs; a loss-side final close is the stop ──
    profit = (lambda px: px > avg_entry) if direction == "LONG" else (lambda px: px < avg_entry)
    take_profits = [
        {"order": i + 1, "price": round(p, 10),
         "save_percent": round(min(q / opened_qty, 1.0) * 100.0, 2)}
        for i, (p, q) in enumerate(_merge_by_price([f for f in closes if profit(f["price"])]))
    ]
    final_px = closes[-1]["price"]
    if profit(final_px):
        exit_type = "LAST_TP"
        stop_loss = None
    else:
        exit_type = "STOP_LOSS"
        stop_loss = round(final_px, 10)

    return {
        "toobit_position_id": f"pos:{contract}:{direction}:{int(open_dt.timestamp() * 1000)}",
        "symbol": contract, "direction": direction, "status": "CLOSED",
        "entry_price": round(avg_entry, 10), "exit_price": round(avg_exit, 10),
        "leverage": leverage, "margin": margin, "realized_pnl": realized,
        "open_date": open_dt, "close_date": close_dt,
        "entry_levels": entry_levels, "take_profits": take_profits,
        "stop_loss": stop_loss, "exit_type": exit_type,
    }


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
    trade.exit_type = fields.get("exit_type")                 # LAST_TP / STOP_LOSS
    trade.leverage = fields.get("leverage")
    trade.is_risk_free_mgmt = bool(fields.get("is_risk_free_mgmt"))
    trade.realized_pnl = fields.get("realized_pnl")           # exact PnL from the exchange
    trade.open_date = fields.get("open_date")
    trade.close_date = fields.get("close_date")
    trade.synced_at = _utcnow()
    if not trade.tags:
        trade.tags = ["toobit"]

    # Record the real margin the trader committed, expressed against the capital
    # registered in the journal: margin_percent = margin / capital × 100, with the
    # snapshot pinned to the capital so the derived margin (snapshot × percent)
    # reproduces the exchange's exact margin. Falls back to pinning the snapshot
    # to the margin itself when no capital is registered.
    margin = fields.get("margin")
    capital = user.wallet_margin or 0.0
    if margin and margin > 0:
        if capital > 0:
            trade.balance_snapshot = capital
            trade.margin_percent = round(margin / capital * 100.0, 2)
        else:
            trade.balance_snapshot = margin
            trade.margin_percent = 100.0

    # Entry-ladder percentages: the reconstruction stores each level's share of
    # the *position* (sums to 100). The journal expects each level as a share of
    # the wallet, so rescale by the trade's total margin percent.
    levels = fields.get("entry_levels") or []
    total_pct = trade.margin_percent or 0.0
    if levels and total_pct:
        levels = [
            {**lvl, "margin_percent": round((lvl.get("margin_percent") or 0.0) * total_pct / 100.0, 2)}
            for lvl in levels
        ]
    trade.entry_levels = levels

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

    produced: set[str] = set()

    # History rows grouped by contract, for matching money numbers to instances.
    hist_by_contract: dict[str, list[dict]] = {}
    for h in history:
        sym = h.get("symbol")
        if sym:
            hist_by_contract.setdefault(sym, []).append(h)

    # Open positions from the authoritative endpoint (margin/leverage in real units).
    open_by_key: dict[tuple[str, str], dict] = {}
    for p in positions:
        f = _fields_from_open(p)
        if f:
            open_by_key[(f["symbol"], f["direction"])] = f

    contracts = sorted(set(hist_by_contract) | {k[0] for k in open_by_key})

    # ── Reconstruct every position instance per contract from the fills ──
    closed_fields: list[dict] = []
    for contract in contracts:
        fills = await _fills_for_contract(client, contract, fills_cache, since_ms)
        hist_rows = hist_by_contract.get(contract, [])
        used_hist: set = set()

        if fills:
            for inst in _split_instances(fills):
                if inst["closed"]:
                    fields = _fields_from_instance(contract, inst, hist_rows, used_hist)
                    if fields is not None:
                        closed_fields.append(fields)
                else:
                    base = open_by_key.pop((contract, inst["direction"]), None)
                    if base is None:
                        continue
                    base.update(_reconstruct(inst["direction"], inst["fills"], is_loss=False, fallback_exit=None))
                    if not base.get("open_date"):
                        base["open_date"] = inst["fills"][0]["ts"]
                    open_by_key[(contract, inst["direction"])] = base  # keep enriched

        # Fallback: history rows with no usable fills → one journal row per
        # exchange row, exactly as before (better than dropping them).
        for h in hist_rows:
            if h.get("id") in used_hist:
                continue
            fields = _fields_from_closed(h)
            if not fields:
                continue
            is_loss = (fields.get("realized_pnl") or 0.0) < 0
            if is_loss:
                fields["stop_loss"] = fields.get("exit_price")
                fields["exit_type"] = "STOP_LOSS"
            elif fields.get("exit_price"):
                fields["take_profits"] = [
                    {"order": 1, "price": fields["exit_price"], "save_percent": 100.0}
                ]
                fields["exit_type"] = "LAST_TP"
            closed_fields.append(fields)

    # ── Upsert closed instances in chronological order (stable numbering) ──
    closed_fields.sort(key=lambda f: _ts_dt(f.get("open_date")))
    for fields in closed_fields:
        if key_floor and fields.get("open_date") and fields["open_date"] < key_floor:
            continue
        try:
            await _upsert_trade(db, user, fields, fields.get("leverage"))
            produced.add(fields["toobit_position_id"])
            touched += 1
            await db.commit()
        except Exception as exc:  # noqa: BLE001
            await db.rollback()
            errors.append(f"{fields.get('symbol')}: {type(exc).__name__}: {exc}")
            logger.exception("toobit closed import failed")

    # ── Upsert still-open positions ──
    for fields in open_by_key.values():
        if key_floor and fields.get("open_date") and fields["open_date"] < key_floor:
            continue
        try:
            await _upsert_trade(db, user, fields, fields.get("leverage"))
            produced.add(fields["toobit_position_id"])
            touched += 1
            await db.commit()
        except Exception as exc:  # noqa: BLE001
            await db.rollback()
            errors.append(f"{fields.get('symbol')}: {type(exc).__name__}: {exc}")
            logger.exception("toobit open import failed")

    # ── Cleanup: drop unedited toobit rows inside the window that this pass did
    # not produce. This removes the old one-row-per-partial-close duplicates
    # (hist:*), superseded ids, and phantom open:* rows after a position closes.
    try:
        existing = (await db.execute(
            select(Trade).where(Trade.user_id == user.id, Trade.source == "toobit")
        )).scalars().all()
        since_s = since_ms / 1000.0
        for t in existing:
            if t.toobit_position_id in produced:
                continue
            edited = (t.synced_at and t.updated_at and t.updated_at > t.synced_at + timedelta(seconds=5))
            if edited:
                continue
            in_window = _ts_dt(t.open_date) >= since_s if t.open_date else t.toobit_position_id and t.toobit_position_id.startswith("open:")
            if in_window:
                await db.delete(t)
        await db.commit()
    except Exception:  # noqa: BLE001
        await db.rollback()
        logger.exception("toobit stale-row cleanup failed")

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
