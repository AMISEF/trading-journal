"""دعوت دوستان — referral endpoints.

``GET /api/referrals/me`` is the single call the page needs: it mints the invite
code on first use, recounts the invited friends, pays out any milestone that has
just been earned, and returns the whole dashboard payload (friends list,
milestone progress, AI bonus counters).

Because the recount happens on read, rewards land the moment the user opens the
page — no cron job, no background worker to babysit.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.user import User
from app.services import referrals

router = APIRouter(prefix="/api/referrals", tags=["referrals"])


@router.get("/me")
async def my_referrals(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await referrals.stats(db, user)


@router.post("/sync")
async def resync(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Force a recount (the «بروزرسانی» button on the page)."""
    return await referrals.stats(db, user)
