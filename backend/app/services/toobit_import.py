"""Toobit futures → journal trade mapping engine (pure, testable logic).

Phase 2 of the Toobit auto-import: given the *fills* (executed order pieces) of a
single futures position on Toobit, derive the journal fields the app already
understands — entry, direction, leverage, take-profits (each with the % of the
position closed there), stop, risk-free flag, realized PnL and open/closed
status.

This module deliberately knows **nothing** about HTTP, signing or the exact
Toobit JSON shape. The live sync layer (Phase 3) fetches a position's fills,
normalises each one into a :class:`Fill`, and hands the list here. That keeps all
the trading logic unit-testable without network access.

Rules implemented (from the product spec):
  • Opening fills set the symbol, direction, leverage and (quantity-weighted)
    entry price.
  • Each partial close becomes a take-profit target whose ``save_percent`` is the
    share of the position closed at that price ("چند درصد خارج شده").
  • If the position is finally closed at a loss, that exit is recorded as the
    stop ("اگر کل معامله ضرر بست اون نقطه خروج را استاپ").
  • Taking profit and then closing the remainder back at (≈) the entry price
    marks the trade risk-free ("ریسک فری").
  • If the exchange exposes the user's own TP/SL orders, those are honoured; when
    it doesn't, the targets are inferred from the fills above.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Fill:
    """One executed piece of an order on a futures position.

    ``qty`` is a positive amount in base/contract units; ``side`` is the raw
    exchange side ("BUY" / "SELL"). Whether a fill opens or closes the position
    is derived from the position's direction, not stored here.
    """

    ts: datetime
    side: str
    price: float
    qty: float


# --- Toobit-specific grouping -------------------------------------------------
# Toobit's futures userTrades feed tags each fill with an explicit role:
#   BUY_OPEN / SELL_OPEN   -> increases the position
#   BUY_CLOSE / SELL_CLOSE -> reduces the position
# so we can split a symbol's fill stream into distinct position instances at the
# flat (size == 0) boundaries instead of guessing.


@dataclass(frozen=True)
class ToobitFill:
    """A raw Toobit futures fill (from GET /api/v1/futures/userTrades)."""

    ts: datetime
    side_raw: str            # BUY_OPEN | SELL_OPEN | BUY_CLOSE | SELL_CLOSE
    price: float
    qty: float

    @property
    def is_open(self) -> bool:
        return self.side_raw.upper().endswith("_OPEN")

    @property
    def plain_side(self) -> str:
        return "BUY" if self.side_raw.upper().startswith("BUY") else "SELL"


def _group_toobit_positions(fills: list[ToobitFill]) -> list[list[ToobitFill]]:
    """Split a chronological fill stream into position instances.

    A new instance starts on an opening fill while flat, and ends once closing
    fills bring the size back to (about) zero. Leftover open fills form a final
    still-open instance.
    """
    groups: list[list[ToobitFill]] = []
    current: list[ToobitFill] = []
    size = 0.0
    for f in fills:
        if not current and not f.is_open:
            continue  # a stray close with no open (already-closed history) — skip
        current.append(f)
        size += f.qty if f.is_open else -f.qty
        if size <= 1e-12 and current:
            groups.append(current)
            current = []
            size = 0.0
    if current:
        groups.append(current)
    return groups


def build_trades_from_toobit_fills(
    symbol: str,
    fills: list[ToobitFill],
    *,
    leverage: float | None = None,
    planned_targets: list[float] | None = None,
    planned_stop: float | None = None,
) -> list[dict]:
    """Turn a symbol's Toobit fills into one trade dict per position instance.

    Each result carries a stable ``toobit_position_id`` (symbol + the opening
    time of that instance) so repeated syncs update the same journal row.
    """
    fills = sorted((f for f in fills if f.qty > 0 and f.price > 0), key=lambda f: f.ts)
    out: list[dict] = []
    for group in _group_toobit_positions(fills):
        opens = [f for f in group if f.is_open]
        if not opens:
            continue
        plain = [Fill(f.ts, f.plain_side, f.price, f.qty) for f in group]
        trade = build_trade_from_fills(
            symbol, plain, leverage=leverage,
            planned_targets=planned_targets, planned_stop=planned_stop,
        )
        if trade is None:
            continue
        open_ms = int(opens[0].ts.timestamp() * 1000)
        trade["toobit_position_id"] = f"{symbol}|{open_ms}"
        out.append(trade)
    return out


def _dir_from_first(fills: Sequence[Fill]) -> str:
    """LONG if the position was opened by buying, SHORT if opened by selling."""
    first = fills[0]
    return "LONG" if first.side.upper() == "BUY" else "SHORT"


def build_trade_from_fills(
    symbol: str,
    fills: Sequence[Fill],
    *,
    leverage: float | None = None,
    planned_targets: Sequence[float] | None = None,
    planned_stop: float | None = None,
    breakeven_tol: float = 0.0015,
) -> dict | None:
    """Turn one position's fills into journal trade fields.

    Returns ``None`` if there are no fills. ``breakeven_tol`` is the relative
    distance from the entry price still considered "closed at breakeven" (default
    0.15%). ``planned_targets`` / ``planned_stop`` are the user's own TP/SL orders
    if the exchange exposes them.
    """
    fills = [f for f in fills if f.qty > 0 and f.price > 0]
    if not fills:
        return None

    fills = sorted(fills, key=lambda f: f.ts)
    direction = _dir_from_first(fills)
    open_side = "BUY" if direction == "LONG" else "SELL"
    dir_sign = 1.0 if direction == "LONG" else -1.0

    opened_qty = 0.0
    opened_notional = 0.0
    for f in fills:
        if f.side.upper() == open_side:
            opened_qty += f.qty
            opened_notional += f.qty * f.price
    if opened_qty <= 0:
        return None
    avg_entry = opened_notional / opened_qty

    # Walk the closing fills in order, recording each as an exit chunk.
    exits: list[dict] = []
    closed_qty = 0.0
    closed_notional = 0.0          # Σ price·qty over closing fills → weighted-avg exit
    realized_pnl = 0.0
    for f in fills:
        if f.side.upper() == open_side:
            continue
        chunk = min(f.qty, opened_qty - closed_qty)  # never close more than opened
        if chunk <= 0:
            continue
        closed_qty += chunk
        closed_notional += f.price * chunk
        pnl = (f.price - avg_entry) * chunk * dir_sign
        realized_pnl += pnl
        save_percent = round(chunk / opened_qty * 100.0, 2)
        # "profit" when the exit is on the favourable side of entry for the direction
        profit = (f.price > avg_entry) if direction == "LONG" else (f.price < avg_entry)
        near_entry = abs(f.price - avg_entry) <= avg_entry * breakeven_tol
        exits.append(
            {"ts": f.ts, "price": f.price, "save_percent": save_percent,
             "profit": profit, "near_entry": near_entry, "pnl": pnl}
        )

    remaining = opened_qty - closed_qty
    is_open = remaining > opened_qty * 1e-9
    status = "OPEN" if is_open else "CLOSED"

    # Take-profits = the profitable partial closes, in the order they happened.
    take_profits: list[dict] = []
    for i, ex in enumerate(e for e in exits if e["profit"]):
        take_profits.append(
            {"order": i + 1, "price": ex["price"], "save_percent": ex["save_percent"]}
        )

    # Honour the user's own TP orders when the exchange exposes them, adding any
    # that weren't already realised as a partial close.
    if planned_targets:
        known = {round(tp["price"], 10) for tp in take_profits}
        for price in planned_targets:
            if price and round(price, 10) not in known:
                take_profits.append(
                    {"order": len(take_profits) + 1, "price": float(price), "save_percent": 0.0}
                )

    # Stop / final exit.
    stop_loss: float | None = planned_stop
    exit_price: float | None = None
    if not is_open and exits:
        final = exits[-1]
        exit_price = final["price"]
        if not final["profit"] and not final["near_entry"]:
            # Whole thing closed out at a loss → that exit is the stop.
            stop_loss = final["price"]

    # Risk-free: took profit on part, then closed the remainder back at entry.
    took_profit = any(e["profit"] for e in exits)
    closed_at_entry = any(e["near_entry"] and not e["profit"] for e in exits)
    is_risk_free = bool(took_profit and closed_at_entry)

    # Quantity-weighted average exit over all closing fills, and the margin the
    # trader committed (opening notional / leverage).
    avg_exit = round(closed_notional / closed_qty, 10) if closed_qty > 0 else None
    margin = round(opened_notional / leverage, 10) if (leverage and leverage > 0) else None

    return {
        "symbol": symbol,
        "direction": direction,
        "leverage": leverage,
        "entry_price": round(avg_entry, 10),
        "status": status,
        "take_profits": take_profits,
        "stop_loss": stop_loss,
        "exit_price": exit_price,
        "avg_exit": avg_exit,
        "margin": margin,
        "is_risk_free_mgmt": is_risk_free,
        "realized_pnl": round(realized_pnl, 10),
        "open_date": fills[0].ts,
        "close_date": exits[-1]["ts"] if (not is_open and exits) else None,
        "closed_fraction": round(min(closed_qty / opened_qty, 1.0) * 100.0, 2),
    }
