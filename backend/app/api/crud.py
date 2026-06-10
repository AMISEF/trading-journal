"""Small shared database query helpers used by multiple routers."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.trade import Trade


async def load_user_trades(db: AsyncSession, user_id: int) -> list[Trade]:
    """Load all of a user's trades (with their take-profits) ordered by number."""
    stmt = (
        select(Trade)
        .where(Trade.user_id == user_id)
        .options(selectinload(Trade.take_profits))
        .order_by(Trade.number)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())
