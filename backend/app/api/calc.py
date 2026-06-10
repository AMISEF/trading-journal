"""Live calculator preview route."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import crud
from app.core.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.trade import CalcOut, CalcPreviewIn
from app.services import balances
from app.services import calc as calc_engine

router = APIRouter(prefix="/api/calc", tags=["calc"])


@router.post("/preview", response_model=CalcOut)
async def preview(
    body: CalcPreviewIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CalcOut:
    # Use the provided wallet balance, or fall back to the user's current balance.
    if body.wallet_balance is not None:
        wallet = body.wallet_balance
    else:
        trades = await crud.load_user_trades(db, user.id)
        wallet = balances.current_balance(user, trades)

    tps = [tp.model_dump() for tp in body.take_profits]
    result = calc_engine.compute(
        direction=body.direction,
        entry=body.entry_price,
        leverage=body.leverage,
        margin_percent=body.margin_percent,
        wallet_balance_now=wallet,
        stop_loss=body.stop_loss,
        take_profits=tps,
        exit_type=body.exit_type,
        trail_value=body.trail_exit_value,
        trail_is_percent=bool(body.trail_is_percent),
    )
    return CalcOut.model_validate(result)
