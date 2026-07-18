"""Subscription plans: what each tier unlocks, and helpers to enforce it.

Tiers (persisted on ``User.subscription_tier``, lowercase): bronze | silver |
gold | diamond.

``User.subscription_expires_at`` is optional; when set and in the past, the
user is treated as bronze regardless of the stored tier (their paid period
ended and nobody demoted them yet). Only admins change these fields — via
``POST /api/admin/users/{id}/set-plan`` — there is no self-service upgrade
endpoint (payment is handled manually / off-platform for now).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.models.user import User

PLAN_ORDER = ["bronze", "silver", "gold"]

PLAN_LABELS = {"bronze": "برنزی (رایگان)", "silver": "نقره‌ای", "gold": "طلایی"}

PLAN_LIMITS: dict[str, dict] = {
    # ثبت ۵۰ معامله با تمام جزئیات. بدون تحلیل هوش مصنوعی.
    "bronze": {
        "max_trades": 50,
        "trade_analysis": False,
        "coach_enabled": False,
        "coach_period_days": None,
        "report_enabled": False,
        "report_period_days": None,
    },
    # ثبت ۱۰۰ معامله، تحلیل هر معامله، مربی هوش مصنوعی ۱ بار در هفته.
    "silver": {
        "max_trades": 100,
        "trade_analysis": True,
        "coach_enabled": True,
        "coach_period_days": 7,
        "report_enabled": False,
        "report_period_days": None,
    },
    # ثبت نامحدود، مربی هوش مصنوعی ۱ بار در روز، گزارش نهادی ۱ بار در هفته.
    "gold": {
        "max_trades": None,
        "trade_analysis": True,
        "coach_enabled": True,
        "coach_period_days": 1,
        "report_enabled": True,
        "report_period_days": 7,
    },
}


def effective_plan(user: User) -> str:
    """The tier actually in effect right now (falls back to bronze if expired)."""
    tier = (user.subscription_tier or "bronze").lower()
    # The diamond tier was retired; anyone still on it keeps top-tier (gold) access.
    if tier == "diamond":
        tier = "gold"
    if tier not in PLAN_LIMITS:
        tier = "bronze"
    if tier != "bronze" and user.subscription_expires_at is not None:
        expires = user.subscription_expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            return "bronze"
    return tier


def limits_for(user: User) -> dict:
    return PLAN_LIMITS[effective_plan(user)]


def plan_duration(months: float) -> timedelta:
    """Approximate a calendar-month duration (30.44 days/month, good enough for subscriptions)."""
    return timedelta(days=round(months * 30.44))


def assert_can_create_trade(user: User, current_trade_count: int) -> None:
    max_trades = limits_for(user)["max_trades"]
    if max_trades is not None and current_trade_count >= max_trades:
        raise HTTPException(
            status_code=403,
            detail=(
                f"سقف ثبت معامله برای پلن {PLAN_LABELS[effective_plan(user)]} "
                f"({max_trades} معامله) پر شده است. برای ادامه، اشتراکت رو ارتقا بده."
            ),
        )


def assert_can_analyze_trade(user: User) -> None:
    if not limits_for(user)["trade_analysis"]:
        raise HTTPException(
            status_code=403,
            detail=f"تحلیل معامله در پلن {PLAN_LABELS[effective_plan(user)]} فعال نیست. برای دسترسی، اشتراکت رو ارتقا بده.",
        )


def _assert_cooldown(user: User, *, enabled: bool, period_days: int | None, last_at: datetime | None, feature_label: str) -> None:
    if not enabled:
        raise HTTPException(
            status_code=403,
            detail=f"{feature_label} در پلن {PLAN_LABELS[effective_plan(user)]} فعال نیست. برای دسترسی، اشتراکت رو ارتقا بده.",
        )
    if period_days is None or last_at is None:
        return
    last = last_at if last_at.tzinfo else last_at.replace(tzinfo=timezone.utc)
    next_allowed = last + timedelta(days=period_days)
    now = datetime.now(timezone.utc)
    if now < next_allowed:
        remaining = next_allowed - now
        hours = int(remaining.total_seconds() // 3600) + 1
        raise HTTPException(
            status_code=403,
            detail=(
                f"در پلن {PLAN_LABELS[effective_plan(user)]}، {feature_label} هر {period_days} روز یک‌بار در دسترسه. "
                f"حدود {hours} ساعت دیگه دوباره امکان‌پذیره."
            ),
        )


def assert_can_generate_coach(user: User) -> None:
    lim = limits_for(user)
    _assert_cooldown(
        user,
        enabled=lim["coach_enabled"],
        period_days=lim["coach_period_days"],
        last_at=user.ai_overall_at,
        feature_label="مربی هوش مصنوعی",
    )


def assert_can_generate_report(user: User) -> None:
    lim = limits_for(user)
    _assert_cooldown(
        user,
        enabled=lim["report_enabled"],
        period_days=lim["report_period_days"],
        last_at=user.ai_report_at,
        feature_label="گزارش و تحلیل نهادی",
    )
