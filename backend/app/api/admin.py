"""Admin-only routes (require role ADMIN)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import crud
from app.api.serializers import trade_to_out, user_to_out
from app.core.deps import get_current_admin, get_db
from app.models.trade import Trade
from app.models.user import User
from app.schemas.trade import TradeOut
from app.schemas.user import UserOut

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=list[UserOut])
async def list_users(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> list[UserOut]:
    result = await db.execute(select(User).order_by(User.id))
    users = list(result.scalars().all())
    out: list[UserOut] = []
    for u in users:
        trades = await crud.load_user_trades(db, u.id)
        out.append(user_to_out(u, trades))
    return out


@router.get("/users/{user_id}/trades", response_model=list[TradeOut])
async def user_trades(
    user_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> list[TradeOut]:
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    trades = await crud.load_user_trades(db, target.id)
    return [trade_to_out(target, trades, t) for t in trades]


@router.get("/trades/{trade_id}", response_model=TradeOut)
async def admin_get_trade(
    trade_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> TradeOut:
    trade = await db.get(Trade, trade_id)
    if trade is None:
        raise HTTPException(status_code=404, detail="Trade not found")
    owner = await db.get(User, trade.user_id)
    trades = await crud.load_user_trades(db, owner.id)
    # Find the freshly loaded version (with take_profits) to serialize.
    loaded = next((t for t in trades if t.id == trade.id), trade)
    return trade_to_out(owner, trades, loaded)
