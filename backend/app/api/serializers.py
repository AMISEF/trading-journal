"""Functions that turn ORM objects into the API's Pydantic output schemas."""

from __future__ import annotations

from app.models.trade import Trade
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction
from app.schemas.trade import TradeOut
from app.schemas.user import UserOut
from app.services import balances


def user_to_out(
    user: User,
    trades: list[Trade],
    transactions: list[WalletTransaction] | None = None,
) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        wallet_margin=user.wallet_margin,
        current_balance=balances.current_balance(user, trades, transactions),
        created_at=user.created_at,
    )


def trade_to_out(
    user: User,
    all_trades: list[Trade],
    trade: Trade,
    transactions: list[WalletTransaction] | None = None,
) -> TradeOut:
    calc = balances.compute_for_trade(user, all_trades, trade, transactions)
    return TradeOut(
        id=trade.id,
        user_id=trade.user_id,
        number=trade.number,
        trade_number=trade.trade_number,
        symbol=trade.symbol,
        direction=trade.direction,
        status=trade.status,
        entry_price=trade.entry_price,
        leverage=trade.leverage,
        margin_percent=trade.margin_percent,
        stop_loss=trade.stop_loss,
        analysis_tf=trade.analysis_tf,
        trigger_tf=trade.trigger_tf,
        is_risk_free_plan=trade.is_risk_free_plan,
        balance_snapshot=trade.balance_snapshot,
        open_date=trade.open_date,
        close_date=trade.close_date,
        exit_type=trade.exit_type,
        exit_price=trade.exit_price,
        trail_exit_value=trade.trail_exit_value,
        trail_is_percent=trade.trail_is_percent,
        is_risk_free_mgmt=trade.is_risk_free_mgmt,
        realized_pnl=trade.realized_pnl,
        rr_expected=trade.rr_expected,
        rr_achieved=trade.rr_achieved,
        emotions=trade.emotions,
        checklist_ticks=trade.checklist_ticks,
        entry_reasons=trade.entry_reasons,
        exit_reasons=trade.exit_reasons,
        entry_note=trade.entry_note,
        exit_note=trade.exit_note,
        general_note=trade.general_note,
        image_before=trade.image_before,
        image_after=trade.image_after,
        tags=trade.tags,
        created_at=trade.created_at,
        updated_at=trade.updated_at,
        take_profits=[
            {"order": tp.order, "price": tp.price, "save_percent": tp.save_percent}
            for tp in trade.take_profits
        ],
        entry_levels=[
            {
                "order": lvl.get("order"),
                "price": lvl.get("price"),
                "margin_percent": lvl.get("margin_percent"),
                "is_activated": lvl.get("is_activated"),
            }
            for lvl in (trade.entry_levels or [])
        ],
        calc=calc,
    )
