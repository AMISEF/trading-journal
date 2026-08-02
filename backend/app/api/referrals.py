"""دعوت دوستان (referrals) routes.

``GET /me``           — everything the page renders (code, counters, friends,
                        milestones, AI bonus).
``POST /sync``        — recount + grant any milestone reached meanwhile.
``PUT /code``         — replace the random code with a personal one
                        («لینک اختصاصی», e.g. ``Cryptosmart``).
``GET /code/check``   — live availability check while typing.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.base import CamelModel
from app.services import referrals

router = APIRouter(prefix="/api/referrals", tags=["referrals"])


class CodeIn(CamelModel):
    code: str


@router.get("/me")
async def my_referrals(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await referrals.stats(db, user)


@router.post("/sync")
async def sync_referrals(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await referrals.stats(db, user)


@router.get("/code/check")
async def check_code(
    code: str = Query(default=""),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await referrals.code_available(db, user, code)


@router.put("/code")
async def update_code(
    body: CodeIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        await referrals.set_code(db, user, body.code)
    except referrals.CodeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return await referrals.stats(db, user)
