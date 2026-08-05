"""AI trading-coach routes.

Generation runs as a detached background job so the HTTP request returns
immediately (the model can take longer than a proxy/Cloudflare timeout). The
client polls ``GET`` until ``status`` becomes ``DONE`` or ``ERROR``. Results are
cached on the row (``trades.ai_analysis`` / ``users.ai_overall``) so the panel
re-opens without spending another API call; ``POST`` regenerates.

Every user-facing ``POST`` passes through ``app.services.plans`` first, which is
the single source of truth for the subscription quotas (per-trade analysis,
coach cooldown, institutional-report cooldown). The free tier's per-trade quota
is a *lifetime* one — one analysis for the whole account, plus one per five
qualified referrals — so the number of already-analysed trades is counted here
and handed to the gate. Coach runs are metered on ``users.ai_overall_runs``,
incremented when the user starts their own job. The ``/admin/*`` variants
deliberately skip both the checks and the meter — an admin generating a report
for a customer is not spending the customer's quota.

The analyses themselves are built by ``app.services.ai_coach``: it assembles the
dashboard metrics, the user's trading plan, their checklists and the last
10/20/30/50 trades depending on the requested thinking level.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import crud
from app.core.deps import get_current_admin, get_current_user, get_db
from app.db.session import AsyncSessionLocal
from app.models.trade import Trade
from app.models.user import User
from app.schemas.base import CamelModel
from app.services import ai_analysis, ai_coach, ai_prompts, plans

logger = logging.getLogger("app.api.ai")

router = APIRouter(prefix="/api/ai", tags=["ai"])

# Keep strong references to detached tasks so they are not garbage-collected
# mid-flight (asyncio only holds weak references to running tasks).
_BACKGROUND_TASKS: set[asyncio.Task] = set()


class AIAnalysisOut(CamelModel):
    analysis: str | None = None
    generated_at: datetime | None = None
    enabled: bool = True
    # None | "PENDING" | "DONE" | "ERROR"
    status: str | None = None
    error: str | None = None
    # Follow-up chat thread: list of {role, content, at}.
    chat: list[dict] = []


class ChatIn(CamelModel):
    message: str


class GenerateIn(CamelModel):
    """Optional body for the coach: which thinking level to run."""

    level: str | None = None


class LevelOut(CamelModel):
    key: str
    label: str
    trades: int
    images: int
    note: str


class PlanIn(CamelModel):
    topics: list = []


class PlanOut(CamelModel):
    topics: list = []
    updated_at: datetime | None = None


# Keep the stored chat thread bounded.
_MAX_CHAT_MESSAGES = 40


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _load_trade(db: AsyncSession, trade_id: int) -> Trade | None:
    result = await db.execute(
        select(Trade)
        .where(Trade.id == trade_id)
        .options(selectinload(Trade.take_profits))
    )
    return result.scalars().first()


async def _trade_analyses_used(db: AsyncSession, user_id: int) -> int:
    """How many of this user's trades already carry a stored AI analysis.

    This is the meter behind the free tier's «۱ تحلیل تک‌معامله» quota: one
    analysis for the whole account (plus the referral bonus), not one per trade.
    """
    result = await db.execute(
        select(func.count())
        .select_from(Trade)
        .where(
            Trade.user_id == user_id,
            Trade.ai_analysis.is_not(None),
            Trade.ai_analysis != "",
        )
    )
    return int(result.scalar() or 0)


def _spawn(coro) -> None:
    task = asyncio.create_task(coro)
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)


# ---------------------------------------------------------------------------
# Thinking levels + trading plan
# ---------------------------------------------------------------------------
@router.get("/levels", response_model=list[LevelOut])
async def list_levels(_user: User = Depends(get_current_user)) -> list[LevelOut]:
    """The coach depth presets, so the UI never drifts from the backend."""
    out: list[LevelOut] = []
    for key in ai_prompts.LEVEL_ORDER:
        cfg = ai_prompts.LEVELS[key]
        out.append(
            LevelOut(
                key=key,
                label=cfg["label"],
                trades=cfg["trades"],
                images=cfg["images"],
                note=cfg["note"],
            )
        )
    return out


@router.get("/plan", response_model=PlanOut)
async def get_trading_plan(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlanOut:
    return PlanOut(topics=await ai_coach.load_plan(db, user.id))


@router.put("/plan", response_model=PlanOut)
async def put_trading_plan(
    body: PlanIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlanOut:
    """Mirror the plan written on /trading-plan so the coach can read it."""
    topics = await ai_coach.save_plan(db, user.id, body.topics)
    return PlanOut(topics=topics, updated_at=_utcnow())


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
    return _trade_out(trade)


@router.post("/trades/{trade_id}", response_model=AIAnalysisOut)
async def generate_trade_analysis(
    trade_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    trade = await _load_trade(db, trade_id)
    if trade is None or trade.user_id != user.id:
        raise HTTPException(status_code=404, detail="معامله یافت نشد")
    # The trade and the account-wide usage are both passed in: the free tier
    # allows a single analysis ever, the paid tiers allow re-runs.
    used = await _trade_analyses_used(db, user.id)
    plans.assert_can_analyze_trade(user, trade, used_count=used)
    return await _start_trade_job(db, trade)


@router.post("/trades/{trade_id}/chat", response_model=AIAnalysisOut)
async def chat_trade(
    trade_id: int,
    body: ChatIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    trade = await _load_trade(db, trade_id)
    if trade is None or trade.user_id != user.id:
        raise HTTPException(status_code=404, detail="معامله یافت نشد")
    return await _do_trade_chat(db, user, trade, body.message)


# ---------------------------------------------------------------------------
# Overall analysis (current user)
# ---------------------------------------------------------------------------
@router.get("/overall", response_model=AIAnalysisOut)
async def get_overall_analysis(
    user: User = Depends(get_current_user),
) -> AIAnalysisOut:
    return _overall_out(user)


@router.post("/overall", response_model=AIAnalysisOut)
async def generate_overall_analysis(
    body: GenerateIn | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    plans.assert_can_generate_coach(user)
    return await _start_overall_job(
        db, user, count_usage=True, level=(body.level if body else None)
    )


@router.post("/overall/chat", response_model=AIAnalysisOut)
async def chat_overall(
    body: ChatIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    return await _do_overall_chat(db, user, body.message)


# ---------------------------------------------------------------------------
# Institutional due-diligence report (current user)
# ---------------------------------------------------------------------------
@router.get("/report", response_model=AIAnalysisOut)
async def get_report(
    user: User = Depends(get_current_user),
) -> AIAnalysisOut:
    return _report_out(user)


@router.post("/report", response_model=AIAnalysisOut)
async def generate_report(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    plans.assert_can_generate_report(user)
    return await _start_report_job(db, user)


@router.post("/report/chat", response_model=AIAnalysisOut)
async def chat_report(
    body: ChatIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    return await _do_report_chat(db, user, body.message)


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
    return _trade_out(trade)


@router.post("/admin/trades/{trade_id}", response_model=AIAnalysisOut)
async def admin_generate_trade_analysis(
    trade_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    trade = await _load_trade(db, trade_id)
    if trade is None:
        raise HTTPException(status_code=404, detail="معامله یافت نشد")
    return await _start_trade_job(db, trade)


@router.post("/admin/trades/{trade_id}/chat", response_model=AIAnalysisOut)
async def admin_chat_trade(
    trade_id: int,
    body: ChatIn,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    trade = await _load_trade(db, trade_id)
    if trade is None:
        raise HTTPException(status_code=404, detail="معامله یافت نشد")
    owner = await db.get(User, trade.user_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    return await _do_trade_chat(db, owner, trade, body.message)


@router.get("/admin/users/{user_id}/overall", response_model=AIAnalysisOut)
async def admin_get_overall_analysis(
    user_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    return _overall_out(target)


@router.post("/admin/users/{user_id}/overall", response_model=AIAnalysisOut)
async def admin_generate_overall_analysis(
    user_id: int,
    body: GenerateIn | None = None,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    # Admin runs are on the house: they must not spend the customer's quota.
    return await _start_overall_job(
        db, target, count_usage=False, level=(body.level if body else None)
    )


@router.post("/admin/users/{user_id}/overall/chat", response_model=AIAnalysisOut)
async def admin_chat_overall(
    user_id: int,
    body: ChatIn,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    return await _do_overall_chat(db, target, body.message)


@router.get("/admin/users/{user_id}/report", response_model=AIAnalysisOut)
async def admin_get_report(
    user_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    return _report_out(target)


@router.post("/admin/users/{user_id}/report", response_model=AIAnalysisOut)
async def admin_generate_report(
    user_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    return await _start_report_job(db, target)


@router.post("/admin/users/{user_id}/report/chat", response_model=AIAnalysisOut)
async def admin_chat_report(
    user_id: int,
    body: ChatIn,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AIAnalysisOut:
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    return await _do_report_chat(db, target, body.message)


# ---------------------------------------------------------------------------
# Response builders
# ---------------------------------------------------------------------------
def _trade_out(trade: Trade) -> AIAnalysisOut:
    return AIAnalysisOut(
        analysis=trade.ai_analysis,
        generated_at=trade.ai_analysis_at,
        enabled=ai_analysis.is_enabled(),
        status=trade.ai_analysis_status,
        error=trade.ai_analysis_error,
        chat=list(trade.ai_chat or []),
    )


def _overall_out(user: User) -> AIAnalysisOut:
    return AIAnalysisOut(
        analysis=user.ai_overall,
        generated_at=user.ai_overall_at,
        enabled=ai_analysis.is_enabled(),
        status=user.ai_overall_status,
        error=user.ai_overall_error,
        chat=list(user.ai_overall_chat or []),
    )


def _report_out(user: User) -> AIAnalysisOut:
    return AIAnalysisOut(
        analysis=user.ai_report,
        generated_at=user.ai_report_at,
        enabled=ai_analysis.is_enabled(),
        status=user.ai_report_status,
        error=user.ai_report_error,
        chat=list(user.ai_report_chat or []),
    )


# ---------------------------------------------------------------------------
# Chat helpers
# ---------------------------------------------------------------------------
def _chat_append(history: list[dict], user_msg: str, assistant_msg: str) -> list[dict]:
    out = list(history or [])
    out.append({"role": "user", "content": user_msg.strip(), "at": _utcnow().isoformat()})
    out.append({"role": "assistant", "content": assistant_msg, "at": _utcnow().isoformat()})
    return out[-_MAX_CHAT_MESSAGES:]


async def _run_chat(context: str, history: list[dict], message: str, dify_user: str) -> str:
    if not message or not message.strip():
        raise HTTPException(status_code=400, detail="پیام خالی است")
    try:
        return await ai_analysis.chat_reply(context, history, message, dify_user=dify_user)
    except ai_analysis.AINotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ai_analysis.AIRequestError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


async def _do_trade_chat(
    db: AsyncSession, owner: User, trade: Trade, message: str
) -> AIAnalysisOut:
    all_trades = await crud.load_user_trades(db, owner.id)
    transactions = await crud.load_user_transactions(db, owner.id)
    context = await ai_coach.chat_context_trade(
        db, owner, all_trades, trade, transactions, analysis=trade.ai_analysis
    )
    history = list(trade.ai_chat or [])
    reply = await _run_chat(context, history, message, str(owner.id))
    trade.ai_chat = _chat_append(history, message, reply)
    await db.commit()
    return _trade_out(trade)


async def _do_overall_chat(db: AsyncSession, owner: User, message: str) -> AIAnalysisOut:
    all_trades = await crud.load_user_trades(db, owner.id)
    transactions = await crud.load_user_transactions(db, owner.id)
    context = await ai_coach.chat_context_overall(
        db, owner, all_trades, transactions, analysis=owner.ai_overall
    )
    history = list(owner.ai_overall_chat or [])
    reply = await _run_chat(context, history, message, str(owner.id))
    owner.ai_overall_chat = _chat_append(history, message, reply)
    await db.commit()
    return _overall_out(owner)


async def _do_report_chat(db: AsyncSession, owner: User, message: str) -> AIAnalysisOut:
    all_trades = await crud.load_user_trades(db, owner.id)
    transactions = await crud.load_user_transactions(db, owner.id)
    context = await ai_coach.chat_context_report(
        db, owner, all_trades, transactions, analysis=owner.ai_report
    )
    history = list(owner.ai_report_chat or [])
    reply = await _run_chat(context, history, message, str(owner.id))
    owner.ai_report_chat = _chat_append(history, message, reply)
    await db.commit()
    return _report_out(owner)


# ---------------------------------------------------------------------------
# Job starters: flip status to PENDING, return immediately, run in background
# ---------------------------------------------------------------------------
async def _start_trade_job(db: AsyncSession, trade: Trade) -> AIAnalysisOut:
    if not ai_analysis.is_enabled():
        raise HTTPException(
            status_code=503,
            detail="تحلیل هوش مصنوعی فعال نیست. کلید API در سرور تنظیم نشده است.",
        )
    trade.ai_analysis_status = "PENDING"
    trade.ai_analysis_error = None
    await db.commit()
    _spawn(_run_trade_job(trade.id, trade.user_id))
    return _trade_out(trade)


async def _start_overall_job(
    db: AsyncSession,
    owner: User,
    *,
    count_usage: bool = False,
    level: str | None = None,
) -> AIAnalysisOut:
    if not ai_analysis.is_enabled():
        raise HTTPException(
            status_code=503,
            detail="تحلیل هوش مصنوعی فعال نیست. کلید API در سرور تنظیم نشده است.",
        )
    owner.ai_overall_status = "PENDING"
    owner.ai_overall_error = None
    if count_usage:
        # The meter behind the free quota + the «دعوت دوستان» bonus runs.
        owner.ai_overall_runs = int(getattr(owner, "ai_overall_runs", 0) or 0) + 1
    await db.commit()
    _spawn(_run_overall_job(owner.id, ai_prompts.normalize_level(level)))
    return _overall_out(owner)


async def _start_report_job(db: AsyncSession, owner: User) -> AIAnalysisOut:
    if not ai_analysis.is_enabled():
        raise HTTPException(
            status_code=503,
            detail="تحلیل هوش مصنوعی فعال نیست. کلید API در سرور تنظیم نشده است.",
        )
    owner.ai_report_status = "PENDING"
    owner.ai_report_error = None
    await db.commit()
    _spawn(_run_report_job(owner.id))
    return _report_out(owner)


# ---------------------------------------------------------------------------
# Background workers (own DB session, isolated from the request lifecycle)
# ---------------------------------------------------------------------------
async def _run_trade_job(trade_id: int, owner_id: int) -> None:
    async with AsyncSessionLocal() as db:
        try:
            owner = await db.get(User, owner_id)
            trade = await _load_trade(db, trade_id)
            if owner is None or trade is None:
                return
            all_trades = await crud.load_user_trades(db, owner_id)
            transactions = await crud.load_user_transactions(db, owner_id)
            text = await ai_coach.run_trade(db, owner, all_trades, trade, transactions)
            trade.ai_analysis = text
            trade.ai_analysis_at = _utcnow()
            trade.ai_analysis_status = "DONE"
            trade.ai_analysis_error = None
            await db.commit()
        except Exception as exc:  # noqa: BLE001 - record failure for the client
            logger.exception("AI trade analysis failed (trade=%s)", trade_id)
            await _record_trade_error(trade_id, str(exc))


async def _run_overall_job(owner_id: int, level: str | None = None) -> None:
    async with AsyncSessionLocal() as db:
        try:
            owner = await db.get(User, owner_id)
            if owner is None:
                return
            all_trades = await crud.load_user_trades(db, owner_id)
            transactions = await crud.load_user_transactions(db, owner_id)
            text = await ai_coach.run_overall(db, owner, all_trades, transactions, level)
            owner.ai_overall = text
            owner.ai_overall_at = _utcnow()
            owner.ai_overall_status = "DONE"
            owner.ai_overall_error = None
            await db.commit()
        except Exception as exc:  # noqa: BLE001
            logger.exception("AI overall analysis failed (user=%s)", owner_id)
            await _record_overall_error(owner_id, str(exc))


async def _run_report_job(owner_id: int) -> None:
    async with AsyncSessionLocal() as db:
        try:
            owner = await db.get(User, owner_id)
            if owner is None:
                return
            all_trades = await crud.load_user_trades(db, owner_id)
            transactions = await crud.load_user_transactions(db, owner_id)
            text = await ai_coach.run_institutional(db, owner, all_trades, transactions)
            owner.ai_report = text
            owner.ai_report_at = _utcnow()
            owner.ai_report_status = "DONE"
            owner.ai_report_error = None
            await db.commit()
        except Exception as exc:  # noqa: BLE001
            logger.exception("AI institutional report failed (user=%s)", owner_id)
            await _record_report_error(owner_id, str(exc))


async def _record_report_error(owner_id: int, message: str) -> None:
    async with AsyncSessionLocal() as db:
        owner = await db.get(User, owner_id)
        if owner is not None:
            owner.ai_report_status = "ERROR"
            owner.ai_report_error = message[:500]
            await db.commit()


async def _record_trade_error(trade_id: int, message: str) -> None:
    async with AsyncSessionLocal() as db:
        trade = await db.get(Trade, trade_id)
        if trade is not None:
            trade.ai_analysis_status = "ERROR"
            trade.ai_analysis_error = message[:500]
            await db.commit()


async def _record_overall_error(owner_id: int, message: str) -> None:
    async with AsyncSessionLocal() as db:
        owner = await db.get(User, owner_id)
        if owner is not None:
            owner.ai_overall_status = "ERROR"
            owner.ai_overall_error = message[:500]
            await db.commit()
