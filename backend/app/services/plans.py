"""Subscription plans: what each tier unlocks, and helpers to enforce it.

Tiers (persisted on ``User.subscription_tier``, lowercase): bronze | silver |
gold | diamond.

``User.subscription_expires_at`` is optional; when set and in the past, the
user is treated as bronze regardless of the stored tier (their paid period
ended and nobody demoted them yet). Only admins change these fields — via
``POST /api/admin/users/{id}/set-plan`` or the Telegram admin bot — there is no
self-service upgrade endpoint (payment is handled manually / off-platform).

The four tiers, as sold on the pricing page:

===========  ==========  ==================  ==================  ==================  ======
Tier         Trades      Per-trade AI        Coach (journal)     Institutional       Toobit
===========  ==========  ==================  ==================  ==================  ======
bronze       10          1 per trade         —                   —                   —
silver       100         unlimited           1 / week            —                   —
gold         unlimited   unlimited           1 / day             1 / week            —
diamond      unlimited   unlimited           unlimited           unlimited           yes
===========  ==========  ==================  ==================  ==================  ======

Semantics of the limit keys:

``max_trades``            ``None`` = unlimited.
``trade_analysis``        may the user run the per-trade analysis at all.
``trade_analysis_once``   the analysis may be produced only once per trade —
                          re-generating an already analysed trade is refused.
``*_enabled``             feature switch for the journal-wide analyses.
``*_period_days``         cooldown between two runs; ``None`` = unlimited.
``toobit``                may connect / sync the Toobit exchange account.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.models.user import User

PLAN_ORDER = ["bronze", "silver", "gold", "diamond"]

PLAN_LABELS = {
    "bronze": "برنزی (رایگان)",
    "silver": "نقره‌ای",
    "gold": "طلایی",
    "diamond": "الماسی",
}

PLAN_LIMITS: dict[str, dict] = {
    # ثبت ۱۰ معامله، روی هر معامله فقط ۱ بار تحلیل هوش مصنوعی.
    "bronze": {
        "max_trades": 10,
        "trade_analysis": True,
        "trade_analysis_once": True,
        "coach_enabled": False,
        "coach_period_days": None,
        "report_enabled": False,
        "report_period_days": None,
        "toobit": False,
    },
    # ثبت ۱۰۰ معامله، تحلیل نامحدود هر معامله، مربی هوش مصنوعی ۱ بار در هفته.
    "silver": {
        "max_trades": 100,
        "trade_analysis": True,
        "trade_analysis_once": False,
        "coach_enabled": True,
        "coach_period_days": 7,
        "report_enabled": False,
        "report_period_days": None,
        "toobit": False,
    },
    # ثبت نامحدود، مربی هوش مصنوعی ۱ بار در روز، گزارش نهادی ۱ بار در هفته.
    "gold": {
        "max_trades": None,
        "trade_analysis": True,
        "trade_analysis_once": False,
        "coach_enabled": True,
        "coach_period_days": 1,
        "report_enabled": True,
        "report_period_days": 7,
        "toobit": False,
    },
    # همه‌چیز نامحدود + اتصال به صرافی توبیت.
    "diamond": {
        "max_trades": None,
        "trade_analysis": True,
        "trade_analysis_once": False,
        "coach_enabled": True,
        "coach_period_days": None,  # None = بدون فاصلهٔ زمانی (نامحدود)
        "report_enabled": True,
        "report_period_days": None,
        "toobit": True,
    },
}


def effective_plan(user: User) -> str:
    """The tier actually in effect right now (falls back to bronze if expired)."""
    tier = (user.subscription_tier or "bronze").lower()
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


def assert_can_analyze_trade(user: User, trade=None) -> None:
    """Gate the per-trade AI analysis.

    On bronze the analysis is a one-shot per trade: once a trade has a stored
    analysis, re-running it is refused (that is what "۱ بار تحلیل روی هر
    ژورنال" means). Passing ``trade`` is what enables that check — without it
    only the on/off switch is evaluated.
    """
    lim = limits_for(user)
    if not lim["trade_analysis"]:
        raise HTTPException(
            status_code=403,
            detail=f"تحلیل معامله در پلن {PLAN_LABELS[effective_plan(user)]} فعال نیست. برای دسترسی، اشتراکت رو ارتقا بده.",
        )
    if lim.get("trade_analysis_once") and trade is not None and getattr(trade, "ai_analysis", None):
        raise HTTPException(
            status_code=403,
            detail=(
                f"در پلن {PLAN_LABELS[effective_plan(user)]} هر معامله فقط یک‌بار تحلیل می‌شود و "
                "تحلیل این معامله قبلاً انجام شده. برای تحلیل مجدد و نامحدود، اشتراکت رو ارتقا بده."
            ),
        )


def _assert_cooldown(user: User, *, enabled: bool, period_days: int | None, last_at: datetime | None, feature_label: str) -> None:
    if not enabled:
        raise HTTPException(
            status_code=403,
            detail=f"{feature_label} در پلن {PLAN_LABELS[effective_plan(user)]} فعال نیست. برای دسترسی، اشتراکت رو ارتقا بده.",
        )
    # period_days is None on the unlimited tiers — no cooldown at all.
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


def can_use_toobit(user: User) -> bool:
    """Toobit exchange connection is a diamond-only feature."""
    return bool(limits_for(user).get("toobit"))


def assert_can_use_toobit(user: User) -> None:
    if not can_use_toobit(user):
        raise HTTPException(
            status_code=403,
            detail="اتصال پنل به صرافی توبیت فقط برای پلن الماسی فعال است. برای استفاده، اشتراکت رو به الماسی ارتقا بده.",
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
