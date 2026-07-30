"""Generic multi-exchange sync (LBank / XT / Ourbit / WEEX).

This is the slug-scoped twin of :mod:`app.services.toobit_sync`.  It keeps the
exact same protocol so imported trades look and behave identically no matter
which exchange they came from:

  1. read the user's stored credential row for ``slug``;
  2. pull open positions + closed history + per-symbol fills;
  3. split the fills into position *instances* (one instance = one journal
     trade, however many entries/partial exits it had);
  4. upsert one journal row per instance, keyed by a stable
     ``toobit_position_id`` of the form ``"<slug>:<key>"`` so repeated syncs
     update in place instead of duplicating;
  5. reconstruct the entry ladder (پله‌ها) and partial take-profits.

Differences from the Toobit worker:

* credentials live in ``exchange_credentials`` (not ``users.toobit_*``);
* ``Trade.source`` is the exchange slug, so each exchange owns its own rows and
  the cleanup pass can never touch another exchange's trades;
* adapters that expose no closed-position history (XT) set
  ``derive_pnl_from_fills``; for those we compute realized PnL and margin from
  the fills themselves instead of dropping the trade.

Every failure is contained: one bad key can never break another user, another
exchange, or the app.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.exchange_credential import ExchangeCredential
from app.models.trade import TakeProfit, Trade
from app.models.user import User
from app.services.exchanges import (
    ExchangeError,
    GENERIC_SLUGS,
    client_for_credential,
    get_meta,
)

logger = logging.getLogger("app.services.exchange_sync")

POSITION_ID_MAX = 80


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _f(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _base_symbol(contract: str) -> str:
    """Normalise an exchange contract name to the journal's base symbol.

    ``btc_usdt`` (XT) / ``BTC-SWAP-USDT`` (Toobit-style) / ``cmt_btcusdt``
    (WEEX) / ``BTC_USDT`` (Ourbit, LBank) all collapse to ``BTC``.
    """
    s = (contract or "").strip().upper()
    if not s:
        return ""
    for sep in ("-", "_", "/"):
        if sep in s:
            parts = [p for p in s.split(sep) if p]
            # drop known noise segments and the quote currency
            parts = [p for p in parts if p not in ("SWAP", "PERP", "CMT", "UMCBL", "FUTURES")]
            if len(parts) > 1:
                parts = parts[:-1] if parts[-1] in ("USDT", "USD", "USDC", "BUSD") else parts
            return parts[0] if parts else s
    for quote in ("USDT", "USDC", "BUSD", "USD"):
        if s.endswith(quote) and len(s) > len(quote):
            return s[: -len(quote)]
    return s


def _dt(ms) -> datetime | None:
    try:
        value = int(ms)
    except (TypeError, ValueError):
        return None
    if value <= 0:
        return None
    if value > 1e12 * 10:  # microseconds
        value = value // 1000
    elif value < 1e11:  # seconds
        value = value * 1000
    try:
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


def _ts_dt(dt: datetime | None) -> float:
    if dt is None:
        return 0.0
    try:
        return dt.timestamp()
    except (ValueError, OverflowError, OSError):
        return 0.0


def _pid(slug: str, key: str) -> str:
    """Stable, collision-free, length-bounded position id."""
    full = f"{slug}:{key}"
    if len(full) <= POSITION_ID_MAX:
        return full
    import hashlib

    digest = hashlib.sha1(full.encode("utf-8")).hexdigest()[:16]
    head = full[: POSITION_ID_MAX - 17]
    return f"{head}~{digest}"


# --------------------------------------------------------------------------- #
# fill-level reconstruction (identical maths to the Toobit worker)
# --------------------------------------------------------------------------- #

def _plain_fills(rows: list[dict]) -> list[dict]:
    """Normalise adapter fills to ``{price, qty, side (BUY/SELL), ts}``."""
    out: list[dict] = []
    for r in rows or []:
        price, qty = _f(r.get("price")), _f(r.get("qty"))
        raw_side = (r.get("side") or "").upper()
        side = "BUY" if raw_side.startswith("BUY") else "SELL" if raw_side.startswith("SELL") else ""
        when = r.get("time")
        when = when if isinstance(when, datetime) else _dt(when)
        if price is None or qty is None or qty <= 0 or price <= 0 or not side or when is None:
            continue
        out.append({"price": price, "qty": qty, "side": side, "ts": when})
    out.sort(key=lambda f: f["ts"])
    return out


def _split_instances(fills: list[dict]) -> list[dict]:
    """Split time-ordered fills into position instances (flat -> flat)."""
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
    merged: list[list[float]] = []
    for f in sorted(rows, key=lambda x: x["ts"]):
        if merged and abs(merged[-1][0] - f["price"]) < 1e-12:
            merged[-1][1] += f["qty"]
        else:
            merged.append([f["price"], f["qty"]])
    return merged


def _reconstruct(direction: str, fills: list[dict], *, is_loss: bool, fallback_exit: float | None) -> dict:
    """Entry ladder + take-profits + stop for one position's fills."""
    open_side = "BUY" if direction == "LONG" else "SELL"
    opens = [f for f in fills if f["side"] == open_side]
    closes = [f for f in fills if f["side"] != open_side]
    opened_qty = sum(f["qty"] for f in opens)
    if opened_qty <= 0:
        return {}
    avg_entry = sum(f["price"] * f["qty"] for f in opens) / opened_qty

    entry_levels = [
        {"order": i + 1, "price": round(p, 10),
         "margin_percent": round(q / opened_qty * 100.0, 2), "is_activated": True}
        for i, (p, q) in enumerate(_merge_by_price(opens))
    ]

    take_profits: list[dict] = []
    stop_loss: float | None = None
    if is_loss:
        stop_loss = fallback_exit or (closes[-1]["price"] if closes else None)
    else:
        profit = (lambda px: px > avg_entry) if direction == "LONG" else (lambda px: px < avg_entry)
        for i, (p, q) in enumerate(_merge_by_price([f for f in closes if profit(f["price"])])):
            take_profits.append({
                "order": i + 1,
                "price": round(p, 10),
                "save_percent": round(min(q / opened_qty, 1.0) * 100.0, 2),
            })

    return {"entry_levels": entry_levels, "take_profits": take_profits, "stop_loss": stop_loss}


def _fields_from_instance(
    slug: str,
    contract: str,
    inst: dict,
    hist_rows: list[dict],
    used_hist: set,
    *,
    derive_from_fills: bool,
    default_leverage: float | None = None,
) -> dict | None:
    """Journal fields for one CLOSED instance.

    Structure comes from the fills; the money numbers come from the matching
    history rows.  When the exchange exposes no history (``derive_from_fills``)
    we compute realized PnL and margin from the fills instead of skipping.
    """
    fills = inst["fills"]
    direction = inst["direction"]
    open_side = "BUY" if direction == "LONG" else "SELL"
    opens = [f for f in fills if f["side"] == open_side]
    closes = [f for f in fills if f["side"] != open_side]
    opened_qty = sum(f["qty"] for f in opens)
    closed_qty = sum(f["qty"] for f in closes)
    if opened_qty <= 0 or closed_qty <= 0 or not closes:
        return None
    avg_entry = sum(f["price"] * f["qty"] for f in opens) / opened_qty
    avg_exit = sum(f["price"] * f["qty"] for f in closes) / closed_qty

    open_dt: datetime = fills[0]["ts"]
    close_dt: datetime = fills[-1]["ts"]

    lo = open_dt - timedelta(seconds=120)
    hi = close_dt + timedelta(seconds=120)
    matched: list[dict] = []
    for h in hist_rows:
        hid = h.get("id")
        if hid is not None and hid in used_hist:
            continue
        if (h.get("side") or "LONG").upper() != direction:
            continue
        cdt = h.get("closeTime")
        cdt = cdt if isinstance(cdt, datetime) else _dt(cdt)
        if cdt is None or cdt < lo or cdt > hi:
            continue
        matched.append(h)

    if matched:
        for h in matched:
            if h.get("id") is not None:
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
    elif derive_from_fills:
        # No closed-position feed (XT): derive the money numbers from the fills.
        sign = 1.0 if direction == "LONG" else -1.0
        realized = (avg_exit - avg_entry) * closed_qty * sign
        leverage = default_leverage
        margin = (avg_entry * opened_qty / leverage) if leverage else None
    else:
        return None

    entry_levels = [
        {"order": i + 1, "price": round(p, 10),
         "margin_percent": round(q / opened_qty * 100.0, 2), "is_activated": True}
        for i, (p, q) in enumerate(_merge_by_price(opens))
    ]

    profit = (lambda px: px > avg_entry) if direction == "LONG" else (lambda px: px < avg_entry)
    take_profits = [
        {"order": i + 1, "price": round(p, 10),
         "save_percent": round(min(q / opened_qty, 1.0) * 100.0, 2)}
        for i, (p, q) in enumerate(_merge_by_price([f for f in closes if profit(f["price"])]))
    ]
    final_px = closes[-1]["price"]
    if profit(final_px):
        exit_type, stop_loss = "LAST_TP", None
    else:
        exit_type, stop_loss = "STOP_LOSS", round(final_px, 10)

    return {
        "toobit_position_id": _pid(slug, f"pos:{contract}:{direction}:{int(open_dt.timestamp() * 1000)}"),
        "symbol": contract, "direction": direction, "status": "CLOSED",
        "entry_price": round(avg_entry, 10), "exit_price": round(avg_exit, 10),
        "leverage": leverage, "margin": margin, "realized_pnl": realized,
        "open_date": open_dt, "close_date": close_dt,
        "entry_levels": entry_levels, "take_profits": take_profits,
        "stop_loss": stop_loss, "exit_type": exit_type,
    }


def _fields_from_open(slug: str, p: dict) -> dict | None:
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
    open_dt = p.get("createTime")
    open_dt = open_dt if isinstance(open_dt, datetime) else _dt(open_dt)
    return {
        "toobit_position_id": _pid(slug, f"open:{sym}:{side}"),
        "symbol": sym, "direction": side, "status": "OPEN",
        "entry_price": entry, "exit_price": None, "leverage": lev,
        "margin": margin, "realized_pnl": _f(p.get("realizedPnL")) or 0.0,
        "open_date": open_dt, "close_date": None,
    }


def _fields_from_closed(slug: str, h: dict) -> dict | None:
    sym = h.get("symbol")
    pid = h.get("id")
    entry = _f(h.get("openAvgPrice"))
    exit_ = _f(h.get("closeAvgPrice"))
    if not sym or pid is None or not entry:
        return None
    side = (h.get("side") or "LONG").upper()
    lev = _f(h.get("leverage"))
    notional = _f(h.get("closeValue")) or ((_f(h.get("maxPosition")) or 0.0) * entry)
    margin = notional / lev if (notional and lev) else None
    open_dt = h.get("openTime")
    close_dt = h.get("closeTime")
    return {
        "toobit_position_id": _pid(slug, f"hist:{pid}"),
        "symbol": sym, "direction": side, "status": "CLOSED",
        "entry_price": entry, "exit_price": exit_, "leverage": lev,
        "margin": margin, "realized_pnl": _f(h.get("realizedPnL")) or 0.0,
        "open_date": open_dt if isinstance(open_dt, datetime) else _dt(open_dt),
        "close_date": close_dt if isinstance(close_dt, datetime) else _dt(close_dt),
    }


# --------------------------------------------------------------------------- #
# persistence
# --------------------------------------------------------------------------- #

async def _next_trade_number(db: AsyncSession, user_id: int) -> int:
    res = await db.execute(
        select(func.coalesce(func.max(Trade.number), 0)).where(Trade.user_id == user_id)
    )
    return int(res.scalar() or 0) + 1


async def _upsert_trade(db: AsyncSession, user: User, slug: str, fields: dict) -> tuple[Trade, bool]:
    pos_id = fields["toobit_position_id"]
    res = await db.execute(
        select(Trade).where(Trade.user_id == user.id, Trade.toobit_position_id == pos_id)
    )
    trade = res.scalars().first()
    created = trade is None
    # Freeze rows the user edited after the last sync; refresh everything else.
    if trade is not None and trade.synced_at is not None and trade.updated_at is not None:
        if trade.updated_at > trade.synced_at + timedelta(seconds=5):
            return trade, False
    if trade is None:
        trade = Trade(
            user_id=user.id,
            number=await _next_trade_number(db, user.id),
            source=slug,
            toobit_position_id=pos_id,
            tags=[slug],
        )
        db.add(trade)

    trade.source = slug
    trade.symbol = _base_symbol(fields["symbol"])
    trade.direction = fields["direction"]
    trade.status = fields["status"]
    trade.entry_price = fields["entry_price"]
    trade.exit_price = fields.get("exit_price")
    trade.stop_loss = fields.get("stop_loss")
    trade.exit_type = fields.get("exit_type")
    trade.leverage = fields.get("leverage")
    trade.is_risk_free_mgmt = bool(fields.get("is_risk_free_mgmt"))
    trade.realized_pnl = fields.get("realized_pnl")
    trade.open_date = fields.get("open_date")
    trade.close_date = fields.get("close_date")
    trade.synced_at = _utcnow()
    if not trade.tags:
        trade.tags = [slug]

    margin = fields.get("margin")
    capital = user.wallet_margin or 0.0
    if margin and margin > 0:
        if capital > 0:
            trade.balance_snapshot = capital
            trade.margin_percent = round(margin / capital * 100.0, 2)
        else:
            trade.balance_snapshot = margin
            trade.margin_percent = 100.0

    levels = fields.get("entry_levels") or []
    total_pct = trade.margin_percent or 0.0
    if levels and total_pct:
        levels = [
            {**lvl, "margin_percent": round((lvl.get("margin_percent") or 0.0) * total_pct / 100.0, 2)}
            for lvl in levels
        ]
    trade.entry_levels = levels

    realized = fields.get("realized_pnl")
    if fields["status"] == "CLOSED" and margin and margin > 0 and realized is not None:
        trade.rr_achieved = round(realized / margin, 4)
    else:
        trade.rr_achieved = None

    # Core DELETE/INSERT keyed by trade_id (mutating the lazy relationship under
    # async SQLAlchemy raises MissingGreenlet).
    await db.flush()
    await db.execute(delete(TakeProfit).where(TakeProfit.trade_id == trade.id))
    order = 0
    for tp in fields.get("take_profits") or []:
        price = tp.get("price")
        if price is None:
            continue
        order += 1
        db.add(TakeProfit(
            trade_id=trade.id,
            order=int(tp.get("order") or order),
            price=float(price),
            save_percent=float(tp.get("save_percent") or 0.0),
        ))
    await db.flush()
    return trade, created


async def _fills_for_contract(client, contract: str, cache: dict[str, list[dict]], since_ms: int | None) -> list[dict]:
    if contract in cache:
        return cache[contract]
    try:
        rows = await client.user_trades(contract, start_ms=since_ms, limit=1000)
        fills = _plain_fills(rows)
    except Exception as exc:  # noqa: BLE001 - fills are optional enrichment
        logger.warning("%s userTrades failed for %s: %s", client.slug, contract, exc)
        fills = []
    cache[contract] = fills
    return fills


# --------------------------------------------------------------------------- #
# public entry points
# --------------------------------------------------------------------------- #

async def get_credential(db: AsyncSession, user_id: int, slug: str) -> ExchangeCredential | None:
    res = await db.execute(
        select(ExchangeCredential).where(
            ExchangeCredential.user_id == user_id,
            ExchangeCredential.exchange == slug,
        )
    )
    return res.scalars().first()


async def sync_user_exchange(
    db: AsyncSession,
    user: User,
    credential: ExchangeCredential,
    client=None,
) -> int:
    """Sync one (user, exchange) pair into the journal. Returns rows touched."""
    slug = credential.exchange
    meta = get_meta(slug)
    if meta is None or meta.legacy:
        return 0
    client = client or client_for_credential(credential)

    key_floor = credential.key_at
    lookback_ms = int((_utcnow() - timedelta(days=settings.TOOBIT_LOOKBACK_DAYS)).timestamp() * 1000)
    floor_ms = int(key_floor.timestamp() * 1000) if key_floor else None
    since_ms = max(lookback_ms, floor_ms) if floor_ms else lookback_ms

    touched = 0
    errors: list[str] = []
    fills_cache: dict[str, list[dict]] = {}

    try:
        positions = await client.positions()
    except ExchangeError as exc:
        credential.sync_error = str(exc)[:400]
        await db.commit()
        raise

    try:
        history = await client.history_positions(start_ms=since_ms, limit=500)
    except ExchangeError as exc:
        # Not every exchange exposes closed positions (XT) — degrade, never fail.
        logger.info("%s history unavailable: %s", slug, exc)
        history = []

    produced: set[str] = set()

    hist_by_contract: dict[str, list[dict]] = {}
    for h in history:
        sym = h.get("symbol")
        if sym:
            hist_by_contract.setdefault(sym, []).append(h)

    open_by_key: dict[tuple[str, str], dict] = {}
    lev_by_contract: dict[str, float] = {}
    for p in positions:
        f = _fields_from_open(slug, p)
        if f:
            open_by_key[(f["symbol"], f["direction"])] = f
            if f.get("leverage"):
                lev_by_contract[f["symbol"]] = float(f["leverage"])

    contracts = sorted(set(hist_by_contract) | {k[0] for k in open_by_key})
    if not contracts and getattr(client, "fills_are_global", False):
        # Some adapters return every symbol's fills in one call; probe with "".
        contracts = [""]

    closed_fields: list[dict] = []
    for contract in contracts:
        fills = await _fills_for_contract(client, contract, fills_cache, since_ms)
        hist_rows = hist_by_contract.get(contract, [])
        used_hist: set = set()

        if fills:
            for inst in _split_instances(fills):
                if inst["closed"]:
                    fields = _fields_from_instance(
                        slug, contract, inst, hist_rows, used_hist,
                        derive_from_fills=bool(getattr(client, "derive_pnl_from_fills", False)),
                        default_leverage=lev_by_contract.get(contract),
                    )
                    if fields is not None:
                        closed_fields.append(fields)
                else:
                    base = open_by_key.pop((contract, inst["direction"]), None)
                    if base is None:
                        continue
                    base.update(_reconstruct(inst["direction"], inst["fills"], is_loss=False, fallback_exit=None))
                    if not base.get("open_date"):
                        base["open_date"] = inst["fills"][0]["ts"]
                    open_by_key[(contract, inst["direction"])] = base

        for h in hist_rows:
            if h.get("id") is not None and h.get("id") in used_hist:
                continue
            fields = _fields_from_closed(slug, h)
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

    closed_fields.sort(key=lambda f: _ts_dt(f.get("open_date")))
    for fields in closed_fields:
        if key_floor and fields.get("open_date") and fields["open_date"] < key_floor:
            continue
        try:
            await _upsert_trade(db, user, slug, fields)
            produced.add(fields["toobit_position_id"])
            touched += 1
            await db.commit()
        except Exception as exc:  # noqa: BLE001
            await db.rollback()
            errors.append(f"{fields.get('symbol')}: {type(exc).__name__}: {exc}")
            logger.exception("%s closed import failed", slug)

    for fields in open_by_key.values():
        if key_floor and fields.get("open_date") and fields["open_date"] < key_floor:
            continue
        try:
            await _upsert_trade(db, user, slug, fields)
            produced.add(fields["toobit_position_id"])
            touched += 1
            await db.commit()
        except Exception as exc:  # noqa: BLE001
            await db.rollback()
            errors.append(f"{fields.get('symbol')}: {type(exc).__name__}: {exc}")
            logger.exception("%s open import failed", slug)

    # Cleanup: drop unedited rows *of this exchange* that this pass didn't produce.
    try:
        existing = (await db.execute(
            select(Trade).where(Trade.user_id == user.id, Trade.source == slug)
        )).scalars().all()
        since_s = since_ms / 1000.0
        open_prefix = _pid(slug, "open:")[: len(slug) + 6]
        for t in existing:
            if t.toobit_position_id in produced:
                continue
            edited = (t.synced_at and t.updated_at and t.updated_at > t.synced_at + timedelta(seconds=5))
            if edited:
                continue
            if t.open_date:
                in_window = _ts_dt(t.open_date) >= since_s
            else:
                in_window = bool(t.toobit_position_id and t.toobit_position_id.startswith(open_prefix))
            if in_window:
                await db.delete(t)
        await db.commit()
    except Exception:  # noqa: BLE001
        await db.rollback()
        logger.exception("%s stale-row cleanup failed", slug)

    credential.synced_at = _utcnow()
    credential.sync_error = ("; ".join(errors))[:400] if errors else None
    await db.commit()
    return touched


async def sync_all_users(session_factory) -> None:
    """One sync pass over every stored non-Toobit exchange credential."""
    async with session_factory() as db:
        res = await db.execute(
            select(ExchangeCredential).where(
                ExchangeCredential.exchange.in_(GENERIC_SLUGS),
                ExchangeCredential.api_key_enc.is_not(None),
                ExchangeCredential.secret_key_enc.is_not(None),
            )
        )
        pairs = [(c.user_id, c.exchange) for c in res.scalars().all()]

    from app.services import plans

    for user_id, slug in pairs:
        async with session_factory() as db:
            try:
                user = await db.get(User, user_id)
                if user is None:
                    continue
                # Exchange sync is a diamond-only feature.
                if not plans.can_use_toobit(user):
                    continue
                credential = await get_credential(db, user_id, slug)
                if credential is None:
                    continue
                await sync_user_exchange(db, user, credential)
            except ExchangeError as exc:
                logger.warning("%s sync failed for user %s: %s", slug, user_id, exc)
            except Exception:  # noqa: BLE001 - never let one pair break the loop
                logger.exception("unexpected %s sync error for user %s", slug, user_id)
