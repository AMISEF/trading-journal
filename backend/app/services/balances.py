"""Helpers that combine trades + wallet transactions + the calc engine.

Wallet isolation guarantee: deposits/withdrawals added AFTER a trade's open_date
never change that trade's historical PnL. Only transactions dated strictly before
a trade opens contribute to its margin base.
"""

from __future__ import annotations

from app.models.trade import Trade
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction
from app.services import calc as calc_engine
from app.services.sessions import session_for


def _tp_dicts(trade: Trade) -> list[dict]:
    return [
        {"order": tp.order, "price": tp.price, "save_percent": tp.save_percent}
        for tp in trade.take_profits
    ]


def _txn_sum(
    transactions: list[WalletTransaction] | None,
    before_date=None,
) -> float:
    if not transactions:
        return 0.0
    if before_date is None:
        return sum(t.amount for t in transactions)
    return sum(t.amount for t in transactions if t.transaction_date < before_date)


def margin_base_for(trade: Trade, running_balance: float) -> float:
    """The wallet balance a trade's margin is derived from.

    Prefers the fixed ``balance_snapshot`` captured when the trade was recorded
    so margin never changes as the wallet grows/shrinks. Falls back to the
    running balance for legacy rows that have no snapshot yet.
    """
    if trade.balance_snapshot is not None:
        return trade.balance_snapshot
    return running_balance


def realized_pnl_of(trade: Trade, wallet_balance_now: float) -> float:
    result = calc_engine.compute(
        direction=trade.direction,
        entry=trade.entry_price,
        leverage=trade.leverage,
        margin_percent=trade.margin_percent,
        wallet_balance_now=margin_base_for(trade, wallet_balance_now),
        stop_loss=trade.stop_loss,
        take_profits=_tp_dicts(trade),
        exit_type=trade.exit_type,
        trail_value=trade.trail_exit_value,
        trail_is_percent=bool(trade.trail_is_percent),
        exit_price=trade.exit_price,
    )
    return result["realizedPnl"]


def current_balance(
    user: User,
    trades: list[Trade],
    transactions: list[WalletTransaction] | None = None,
) -> float:
    """wallet_margin + ALL transactions + PnL of CLOSED trades in order."""
    balance = (user.wallet_margin or 0.0) + _txn_sum(transactions)
    for t in sorted(trades, key=lambda x: x.number):
        if t.status == "CLOSED":
            balance += realized_pnl_of(t, balance)
    return balance


def balance_before_trade(
    user: User,
    trades: list[Trade],
    trade: Trade,
    transactions: list[WalletTransaction] | None = None,
) -> float:
    """Margin base for a given trade.

    CLOSED trades: only transactions before trade.open_date are included, so
    future deposits never retroactively change historical PnL.
    PLANNED/OPEN trades: use the full current balance.
    """
    if trade.status != "CLOSED":
        return current_balance(user, trades, transactions)

    balance = (user.wallet_margin or 0.0) + _txn_sum(transactions, before_date=trade.open_date)
    for t in sorted(trades, key=lambda x: x.number):
        if t.number >= trade.number:
            break
        if t.status == "CLOSED":
            balance += realized_pnl_of(t, balance)
    return balance


def compute_for_trade(
    user: User,
    trades: list[Trade],
    trade: Trade,
    transactions: list[WalletTransaction] | None = None,
) -> dict:
    # A recorded trade carries a fixed balance snapshot → margin stays constant.
    # Legacy rows without a snapshot fall back to the historical balance chain.
    if trade.balance_snapshot is not None:
        base = trade.balance_snapshot
    else:
        base = balance_before_trade(user, trades, trade, transactions)
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
        exit_price=trade.exit_price,
        session=session_for(trade.open_date),
    )
