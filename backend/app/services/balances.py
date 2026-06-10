"""Helpers that combine trades + the calc engine to produce balances.

These functions need a list of the user's trades to figure out the wallet
balance "as of" a given trade (because only earlier closed trades count toward a
trade's margin base). They are kept here (not in calc.py) because calc.py must
stay a pure, DB-free math module.
"""

from __future__ import annotations

from app.models.trade import Trade
from app.models.user import User
from app.services import calc as calc_engine
from app.services.sessions import session_for


def _tp_dicts(trade: Trade) -> list[dict]:
    """Turn a trade's TakeProfit rows into the dicts the calc engine expects."""
    return [
        {"order": tp.order, "price": tp.price, "save_percent": tp.save_percent}
        for tp in trade.take_profits
    ]


def realized_pnl_of(trade: Trade, wallet_balance_now: float) -> float:
    """Recompute the realized PnL of a single (closed) trade."""
    result = calc_engine.compute(
        direction=trade.direction,
        entry=trade.entry_price,
        leverage=trade.leverage,
        margin_percent=trade.margin_percent,
        wallet_balance_now=wallet_balance_now,
        stop_loss=trade.stop_loss,
        take_profits=_tp_dicts(trade),
        exit_type=trade.exit_type,
        trail_value=trade.trail_exit_value,
        trail_is_percent=bool(trade.trail_is_percent),
    )
    return result["realizedPnl"]


def current_balance(user: User, trades: list[Trade]) -> float:
    """Wallet margin + realized PnL of all CLOSED trades, in trade-number order.

    Each closed trade is computed against the balance *before* it (running total),
    so its margin base does not include its own PnL.
    """
    balance = user.wallet_margin or 0.0
    for t in sorted(trades, key=lambda x: x.number):
        if t.status == "CLOSED":
            balance += realized_pnl_of(t, balance)
    return balance


def balance_before_trade(user: User, trades: list[Trade], trade: Trade) -> float:
    """The wallet balance used as the margin base for ``trade``.

    For PLANNED/OPEN trades this is simply the user's current balance (sum of all
    closed trades). For a CLOSED trade it is the running balance of closed trades
    whose number is strictly less than this trade's number.
    """
    if trade.status != "CLOSED":
        return current_balance(user, trades)

    balance = user.wallet_margin or 0.0
    for t in sorted(trades, key=lambda x: x.number):
        if t.number >= trade.number:
            break
        if t.status == "CLOSED":
            balance += realized_pnl_of(t, balance)
    return balance


def compute_for_trade(user: User, trades: list[Trade], trade: Trade) -> dict:
    """Run the calc engine for ``trade`` using the correct wallet base + session."""
    base = balance_before_trade(user, trades, trade)
    return calc_engine.compute(
        direction=trade.direction,
        entry=trade.entry_price,
        leverage=trade.leverage,
        margin_percent=trade.margin_percent,
        wallet_balance_now=base,
        stop_loss=trade.stop_loss,
        take_profits=_tp_dicts(trade),
        exit_type=trade.exit_type,
        trail_value=trade.trail_exit_value,
        trail_is_percent=bool(trade.trail_is_percent),
        session=session_for(trade.open_date),
    )
