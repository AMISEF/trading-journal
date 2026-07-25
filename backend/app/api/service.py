"""Machine-to-machine API for the Algo Hub Telegram admin bot.

The bot runs in the portfolio app, so it cannot use an admin JWT. These
endpoints are authenticated with a shared service token instead
(``X-Service-Token``, from ``SERVICE_TOKEN``), and are limited to exactly what
the admin panel in the bot needs:

  • find a user by email / username / id,
  • assign a subscription plan for a fixed duration,
  • read usage statistics for a day / week / month.

The token is required: when ``SERVICE_TOKEN`` is unset every call is refused,
so an unconfigured deployment cannot be driven by anyone.
"""

from __future__ import annotations

import hmac
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_db
from app.models.trade import Trade
from app.models.user import User
from app.schemas.base import CamelModel
from app.services import plans

router = APIRouter(prefix="/api/service", tags=["service"])

# The tiers an admin may assign, ordered cheapest first.
ASSIGNABLE_TIERS = ["bronze", "silver", "gold"]
# Durations offered in the bot (months).
DURATIONS = [1, 3, 6, 12]


async def require_service_token(
    x_service_token: str | None = Header(default=None),
) -> None:
    expected = (settings.SERVICE_TOKEN or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Service API is not configured")
    if not (x_service_token and hmac.compare_digest(x_service_token, expected)):
        raise HTTPException(status_code=403, detail="Invalid service token")


# ── schemas ──────────────────────────────────────────────────────────────────
class ServiceUser(CamelModel):
    id: int
    email: str
    username: str | None = None
    full_name: str | None = None
    tier: str
    expires_at: datetime | None = None


class SetPlanIn(CamelModel):
    plan: str
    duration_months: int | None = None


# ── user lookup + plan assignment ────────────────────────────────────────────
def _to_service_user(u: User) -> ServiceUser:
    name = " ".join(x for x in [getattr(u, "first_name", None),
                                getattr(u, "last_name", None)] if x) or None
    return ServiceUser(
        id=u.id,
        email=u.email,
        username=getattr(u, "username", None),
        full_name=name,
        tier=plans.effective_plan(u),
        expires_at=u.subscription_expires_at,
    )


@router.get("/users/lookup", response_model=list[ServiceUser],
            dependencies=[Depends(require_service_token)])
async def lookup_users(q: str, db: AsyncSession = Depends(get_db)) -> list[ServiceUser]:
    """Find users by email, username or numeric id. Case-insensitive, partial."""
    term = (q or "").strip()
    if not term:
        return []
    like = f"%{term.lower()}%"
    stmt = select(User).where(
        func.lower(User.email).like(like) | func.lower(User.username).like(like)
    )
    if term.isdigit():
        stmt = select(User).where(
            (User.id == int(term))
            | func.lower(User.email).like(like)
            | func.lower(User.username).like(like)
        )
    rows = (await db.execute(stmt.order_by(User.id).limit(10))).scalars().all()
    return [_to_service_user(u) for u in rows]


@router.post("/users/{user_id}/set-plan", response_model=ServiceUser,
             dependencies=[Depends(require_service_token)])
async def set_plan(user_id: int, body: SetPlanIn,
                   db: AsyncSession = Depends(get_db)) -> ServiceUser:
    """Assign a plan for a fixed number of months (mirrors the admin endpoint)."""
    tier = (body.plan or "").lower()
    if tier not in plans.PLAN_LIMITS:
        raise HTTPException(status_code=400, detail="پلن نامعتبر است")
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")

    target.subscription_tier = tier
    if tier == "bronze" or not body.duration_months:
        target.subscription_expires_at = None
    else:
        target.subscription_expires_at = (
            datetime.now(timezone.utc) + plans.plan_duration(body.duration_months)
        )
    await db.commit()
    await db.refresh(target)
    return _to_service_user(target)


# ── statistics ───────────────────────────────────────────────────────────────
_PERIODS = {"day": 1, "week": 7, "month": 30}


@router.get("/stats", dependencies=[Depends(require_service_token)])
async def stats(period: str = "day", db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Usage snapshot for the admin report.

    Subscriber counts are *current* state (per tier and per remaining
    duration); activity counts are for the requested window.
    """
    days = _PERIODS.get(period, 1)
    since = datetime.now(timezone.utc) - timedelta(days=days)

    total_users = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    new_users = (
        await db.execute(select(func.count()).select_from(User)
                         .where(User.created_at >= since))
    ).scalar() or 0

    # Subscribers per tier — effective (an expired paid plan counts as bronze).
    users = (await db.execute(select(User))).scalars().all()
    by_tier: dict[str, int] = {t: 0 for t in plans.PLAN_LIMITS}
    by_duration: dict[str, int] = {"۱ ماهه": 0, "۳ ماهه": 0, "۶ ماهه": 0,
                                   "سالانه": 0, "نامحدود": 0}
    paid = 0
    now = datetime.now(timezone.utc)
    for u in users:
        tier = plans.effective_plan(u)
        by_tier[tier] = by_tier.get(tier, 0) + 1
        if tier == "bronze":
            continue
        paid += 1
        exp = u.subscription_expires_at
        if exp is None:
            by_duration["نامحدود"] += 1
            continue
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        left = (exp - now).days
        if left <= 31:
            by_duration["۱ ماهه"] += 1
        elif left <= 93:
            by_duration["۳ ماهه"] += 1
        elif left <= 186:
            by_duration["۶ ماهه"] += 1
        else:
            by_duration["سالانه"] += 1

    trades_created = (
        await db.execute(select(func.count()).select_from(Trade)
                         .where(Trade.created_at >= since))
    ).scalar() or 0
    trades_total = (await db.execute(select(func.count()).select_from(Trade))).scalar() or 0

    # AI usage in the window: per-trade analyses + the two per-user analyses.
    ai_trade = (
        await db.execute(select(func.count()).select_from(Trade)
                         .where(Trade.ai_analysis_at >= since))
    ).scalar() or 0
    ai_coach = (
        await db.execute(select(func.count()).select_from(User)
                         .where(User.ai_overall_at >= since))
    ).scalar() or 0
    ai_report = (
        await db.execute(select(func.count()).select_from(User)
                         .where(User.ai_report_at >= since))
    ).scalar() or 0

    return {
        "period": period,
        "days": days,
        "users": {"total": total_users, "new": new_users, "paid": paid},
        "by_tier": by_tier,
        "by_duration": by_duration,
        "trades": {"created": trades_created, "total": trades_total},
        "ai": {"trade": ai_trade, "coach": ai_coach, "report": ai_report,
               "total": ai_trade + ai_coach + ai_report},
    }
