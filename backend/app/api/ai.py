"""AI trading-coach routes.

Per-trade and whole-journal analysis powered by Claude. Results are cached on
the row (``trades.ai_analysis`` / ``users.ai_overall``) so the panel can be
re-opened without spending another API call; ``POST`` regenerates.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import crud
from app.core.deps import get_current_admin, get_current_user, get_db
from app.models.trade import Trade
from app.models.user import User
from app.schemas.base import CamelModel
from app.services import ai_analysis

router = APIRouter(prefix="/api/ai", tags=["ai"])


class AIAnalysisOut(CamelModel):
    analysis: str | None = None
    generated_at: datetime | None = None
    enabled: bool = True


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _load_trade(db: AsyncSession, trade_id: int) -> Trade | None:
    result = await db.execute(
        select(Trade)
        .where(Trade.id == trade_id)
        .options(selectinload(Trade.take_profits))
    )
    return result.scalars().first()


# ---------------------------------------------------------------------------
# Per-trade analysis (current user)
# ---------------------------------------------------------------------------
@router.get("/trades/{trade_id}", response_model=AIAnalysisOut)
async def get_trade_analysis(
    trade_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    trade = await _load_trade(db, trade_id)
    if trade is None or trade.user_id != user.id:
        raise HTTPException(status_code=404, detail="معامله یافت نشد")
    return AIAnalysisOut(
        analysis=trade.ai_analysis,
        generated_at=trade.ai_analysis_at,
        enabled=ai_analysis.is_enabled(),
    )


@router.post("/trades/{trade_id}", response_model=AIAnalysisOut)
async def generate_trade_analysis(
    trade_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    trade = await _load_trade(db, trade_id)
    if trade is None or trade.user_id != user.id:
        raise HTTPException(status_code=404, detail="معامله یافت نشد")
    return await _run_trade_analysis(db, user, trade)


# ---------------------------------------------------------------------------
# Overall analysis (current user)
# ---------------------------------------------------------------------------
@router.get("/overall", response_model=AIAnalysisOut)
async def get_overall_analysis(
    user: User = Depends(get_current_user),
) -> AIAnalysisOut:
    return AIAnalysisOut(
        analysis=user.ai_overall,
        generated_at=user.ai_overall_at,
        enabled=ai_analysis.is_enabled(),
    )


@router.post("/overall", response_model=AIAnalysisOut)
async def generate_overall_analysis(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    return await _run_overall_analysis(db, user)


# ---------------------------------------------------------------------------
# Admin variants (coach any user / their trades)
# ---------------------------------------------------------------------------
@router.get("/admin/trades/{trade_id}", response_model=AIAnalysisOut)
async def admin_get_trade_analysis(
    trade_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    trade = await _load_trade(db, trade_id)
    if trade is None:
        raise HTTPException(status_code=404, detail="معامله یافت نشد")
    return AIAnalysisOut(
        analysis=trade.ai_analysis,
        generated_at=trade.ai_analysis_at,
        enabled=ai_analysis.is_enabled(),
    )


@router.post("/admin/trades/{trade_id}", response_model=AIAnalysisOut)
async def admin_generate_trade_analysis(
    trade_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    trade = await _load_trade(db, trade_id)
    if trade is None:
        raise HTTPException(status_code=404, detail="معامله یافت نشد")
    owner = await db.get(User, trade.user_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    return await _run_trade_analysis(db, owner, trade)


@router.get("/admin/users/{user_id}/overall", response_model=AIAnalysisOut)
async def admin_get_overall_analysis(
    user_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    return AIAnalysisOut(
        analysis=target.ai_overall,
        generated_at=target.ai_overall_at,
        enabled=ai_analysis.is_enabled(),
    )


@router.post("/admin/users/{user_id}/overall", response_model=AIAnalysisOut)
async def admin_generate_overall_analysis(
    user_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    return await _run_overall_analysis(db, target)


# ---------------------------------------------------------------------------
# Shared workers
# ---------------------------------------------------------------------------
async def _run_trade_analysis(
    db: AsyncSession, owner: User, trade: Trade
) -> AIAnalysisOut:
    all_trades = await crud.load_user_trades(db, owner.id)
    transactions = await crud.load_user_transactions(db, owner.id)
    try:
        text = await ai_analysis.analyze_trade(owner, all_trades, trade, transactions)
    except ai_analysis.AINotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ai_analysis.AIRequestError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    trade.ai_analysis = text
    trade.ai_analysis_at = _utcnow()
    await db.commit()
    return AIAnalysisOut(analysis=text, generated_at=trade.ai_analysis_at, enabled=True)


async def _run_overall_analysis(db: AsyncSession, owner: User) -> AIAnalysisOut:
    all_trades = await crud.load_user_trades(db, owner.id)
    transactions = await crud.load_user_transactions(db, owner.id)
    try:
        text = await ai_analysis.analyze_overall(owner, all_trades, transactions)
    except ai_analysis.AINotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ai_analysis.AIRequestError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    owner.ai_overall = text
    owner.ai_overall_at = _utcnow()
    await db.commit()
    return AIAnalysisOut(analysis=text, generated_at=owner.ai_overall_at, enabled=True)
