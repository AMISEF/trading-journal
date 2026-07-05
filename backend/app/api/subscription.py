"""Subscription upgrading routes."""

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import crud
from app.api.serializers import user_to_out
from app.core.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.user import UserOut
from app.schemas.base import CamelModel

router = APIRouter(prefix="/api/subscription", tags=["subscription"])

class SubscriptionUpgradeIn(CamelModel):
    tier: str
    yearly: bool

@router.post("/upgrade", response_model=UserOut)
async def upgrade_subscription(
    body: SubscriptionUpgradeIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    valid_tiers = ["bronze", "silver", "gold", "diamond"]
    if body.tier not in valid_tiers:
        raise HTTPException(status_code=400, detail="Invalid subscription tier")

    # In a real app, this would verify payment with a gateway like Zarinpal
    
    duration_days = 365 if body.yearly else 30
    user.subscription_tier = body.tier
    user.subscription_expires_at = datetime.now(timezone.utc) + timedelta(days=duration_days)

    await db.commit()
    await db.refresh(user)
    
    trades = await crud.load_user_trades(db, user.id)
    transactions = await crud.load_user_transactions(db, user.id)
    return user_to_out(user, trades, transactions)
