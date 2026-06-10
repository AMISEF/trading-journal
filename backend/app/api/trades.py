"""Trade CRUD routes (all scoped to the logged-in user)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import crud
from app.api.serializers import trade_to_out
from app.core.deps import get_current_user, get_db
from app.models.trade import TakeProfit, Trade
from app.models.user import User
from app.schemas.trade import TradeIn, TradeOut
from app.services import balances

router = APIRouter(prefix="/api/trades", tags=["trades"])

# Fields that can be set directly on the Trade model from TradeIn.
_SCALAR_FIELDS = [
    "symbol", "direction", "status", "entry_price", "leverage", "margin_percent",
    "stop_loss", "analysis_tf", "trigger_tf", "is_risk_free_plan", "open_date",
    "close_date", "exit_type", "exit_price", "trail_exit_value", "trail_is_percent",
    "is_risk_free_mgmt", "emotions", "checklist_ticks", "entry_reasons",
    "exit_reasons", "entry_note", "exit_note", "general_note", "image_before",
    "image_after", "tags",
]


def _apply_fields(trade: Trade, data: dict) -> None:
    """Copy any provided scalar fields from a TradeIn dict onto the Trade row."""
    for field in _SCALAR_FIELDS:
        if field in data:
            setattr(trade, field, data[field])


def _apply_take_profits(trade: Trade, tps: list[dict]) -> None:
    """Replace the trade's take-profits with the provided list."""
    trade.take_profits.clear()
    for tp in tps:
        trade.take_profits.append(
            TakeProfit(
                order=tp.get("order", 1),
                price=tp.get("price"),
                save_percent=tp.get("save_percent", 0.0) or 0.0,
            )
        )


async def _persist_computed(
    db: AsyncSession, user: User, trade: Trade
) -> None:
    """Recompute and store realizedPnl / rrExpected / rrAchieved on the trade."""
    all_trades = await crud.load_user_trades(db, user.id)
    calc = balances.compute_for_trade(user, all_trades, trade)
    trade.realized_pnl = calc["realizedPnl"]
    trade.rr_expected = calc["rrExpected"]
    trade.rr_achieved = calc["rrAchieved"]


async def _get_owned_trade(db: AsyncSession, user: User, trade_id: int) -> Trade:
    """Load a single trade and verify it belongs to the current user."""
    trade = await db.get(Trade, trade_id)
    if trade is None or trade.user_id != user.id:
        raise HTTPException(status_code=404, detail="Trade not found")
    # Ensure take_profits are loaded for serialization.
    await db.refresh(trade, attribute_names=["take_profits"])
    return trade


@router.get("/", response_model=list[TradeOut])
async def list_trades(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TradeOut]:
    trades = await crud.load_user_trades(db, user.id)
    return [trade_to_out(user, trades, t) for t in trades]


@router.post("/", response_model=TradeOut, status_code=status.HTTP_201_CREATED)
async def create_trade(
    body: TradeIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TradeOut:
    # Next number = max(existing numbers) + 1 for this user.
    max_number = await db.execute(
        select(func.coalesce(func.max(Trade.number), 0)).where(Trade.user_id == user.id)
    )
    next_number = (max_number.scalar() or 0) + 1

    data = body.model_dump(exclude_unset=True)
    take_profits = data.pop("take_profits", None)

    trade = Trade(
        user_id=user.id,
        number=next_number,
        direction=data.get("direction") or "LONG",
        status=data.get("status") or "PLANNED",
    )
    _apply_fields(trade, data)
    if take_profits is not None:
        _apply_take_profits(trade, take_profits)

    db.add(trade)
    await db.flush()  # assign trade.id before computing
    await db.refresh(trade, attribute_names=["take_profits"])
    await _persist_computed(db, user, trade)
    await db.commit()
    await db.refresh(trade, attribute_names=["take_profits"])

    all_trades = await crud.load_user_trades(db, user.id)
    return trade_to_out(user, all_trades, trade)


@router.get("/{trade_id}", response_model=TradeOut)
async def get_trade(
    trade_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TradeOut:
    trade = await _get_owned_trade(db, user, trade_id)
    all_trades = await crud.load_user_trades(db, user.id)
    return trade_to_out(user, all_trades, trade)


@router.patch("/{trade_id}", response_model=TradeOut)
async def update_trade(
    trade_id: int,
    body: TradeIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TradeOut:
    trade = await _get_owned_trade(db, user, trade_id)

    data = body.model_dump(exclude_unset=True)
    take_profits = data.pop("take_profits", None)
    _apply_fields(trade, data)
    if take_profits is not None:
        _apply_take_profits(trade, take_profits)

    await db.flush()
    await db.refresh(trade, attribute_names=["take_profits"])
    # Any field change recomputes the stored results.
    await _persist_computed(db, user, trade)
    await db.commit()
    await db.refresh(trade, attribute_names=["take_profits"])

    all_trades = await crud.load_user_trades(db, user.id)
    return trade_to_out(user, all_trades, trade)


@router.delete("/{trade_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_trade(
    trade_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    trade = await _get_owned_trade(db, user, trade_id)
    await db.delete(trade)
    await db.commit()
