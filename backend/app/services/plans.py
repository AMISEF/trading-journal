"""Subscription plans: what each tier unlocks, and helpers to enforce it.

Tiers (persisted on ``User.subscription_tier``, lowercase): bronze | silver |
gold | diamond.

``User.subscription_expires_at`` is optional; when set and in the past, the
user is treated as bronze regardless of the stored tier (their paid period
ended and nobody demoted them yet). Only admins change these fields — via
``POST /api/admin/users/{id}/set-plan`` or the Telegram admin bot — there is no
self-service upgrade endpoint (payment is handled manually / off-platform).
The one exception is the referral program (``app.services.referrals``), which
grants 14-day tiers automatically when an invite milestone is reached.

The four tiers, as sold on the pricing page:

===========  ==========  ==================  ==================  ==================  ======
Tier         Trades      Per-trade AI        Coach (journal)     Institutional       Toobit
===========  ==========  ==================  ==================  ==================  ======
bronze       20          1 in total          1 in total          —                   —
silver       100         unlimited           1 / week            —                   —
gold         unlimited   unlimited           1 / day             1 / week            —
diamond      unlimited   unlimited           unlimited           unlimited           yes
===========  ==========  ==================  ==================  ==================  ======

The free tier is a *taste*, not a trial with a clock: 20 journal entries, one
single-trade analysis and one coach run — ever. The second attempt is refused
with an upgrade message, and the interface turns that into a «خرید اشتراک»
button pointing at the subscription page.

On top of the table, the referral program tops up the *countable* quotas: every
:data:`app.services.referrals.AI_BONUS_STEP` qualified invites add one coach run
and one single-trade analysis (see :func:`referral_bonus`). Bonuses only touch
quotas that are actually numbers — an unlimited tier stays unlimited.

Semantics of the limit keys:

``max_trades``            ``None`` = unlimited.
``trade_analysis``        may the user run the per-trade analysis at all.
``trade_analysis_once``   the analysis may be produced only once per trade —
                          re-generating an already analysed trade is refused.
``trade_analysis_quota``  lifetime cap on per-trade analyses across the whole
                          account; ``None`` = uncapped.
``coach_quota``           lifetime cap on coach runs; ``None`` = uncapped.
``report_quota``          lifetime cap on institutional reports; ``None`` = uncapped.
``*_enabled``             feature switch for the journal-wide analyses.
``*_period_days``         cooldown between two runs; ``None`` = no cooldown.
``toobit``                may connect / sync the Toobit exchange account.

Every refusal raised here carries :data:`UPGRADE_MARKER` at the end of the
message. It is a machine-readable flag for the frontend (which strips it before
displaying the text) so it knows to render the purchase call-to-action instead
of a plain red error box. Never translate or reformat that marker.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.models.user import User

PLAN_ORDER = ["bronze", "silver", "gold", "diamond"]
TRADING_PLAN_TIERS = {"silver", "gold", "diamond"}

PLAN_LABELS = {
    "bronze": "برنزی (رایگان)",
    "silver": "نقره‌ای",
    "gold": "طلایی",
    "diamond": "الماسی",
}

# Appended to every plan-gate error so the client can show a buy button.
UPGRADE_MARKER = "[UPGRADE]"

FREE_TRADES = 20
FREE_TRADE_ANALYSES = 1
FREE_COACH_RUNS = 1

# Every N qualified referrals grant +1 coach run and +1 single-trade analysis.
# Kept here (not imported from referrals) to avoid a circular import; the
# referral module re-exports the same number as AI_BONUS_STEP.
REFERRAL_AI_BONUS_STEP = 5

PLAN_LIMITS: dict[str, dict] = {
    # رایگان: ثبت ۲۰ معامله، فقط ۱ تحلیل تک‌معامله و ۱ بار مربی هوش مصنوعی.
    "bronze": {
        "max_trades": FREE_TRADES,
        "trade_analysis": True,
        "trade_analysis_once": True,
        "trade_analysis_quota": FREE_TRADE_ANALYSES,
        "coach_enabled": True,
        "coach_period_days": None,
        "coach_quota": FREE_COACH_RUNS,
        "report_enabled": False,
        "report_period_days": None,
        "report_quota": 0,
        "toobit": False,
    },
    # ثبت ۱۰۰ معامله، تحلیل نامحدود هر معامله، مربی هوش مصنوعی ۱ بار در هفته.
    "silver": {
        "max_trades": 100,
        "trade_analysis": True,
        "trade_analysis_once": False,
        "trade_analysis_quota": None,
        "coach_enabled": True,
        "coach_period_days": 7,
        "coach_quota": None,
        "report_enabled": False,
        "report_period_days": None,
        "report_quota": 0,
        "toobit": False,
    },
    # ثبت نامحدود، مربی هوش مصنوعی ۱ بار در روز، گزارش نهادی ۱ بار در هفته.
    "gold": {
        "max_trades": None,
        "trade_analysis": True,
        "trade_analysis_once": False,
        "trade_analysis_quota": None,
        "coach_enabled": True,
        "coach_period_days": 1,
        "coach_quota": None,
        "report_enabled": True,
        "report_period_days": 7,
        "report_quota": None,
        "toobit": False,
    },
    # همه‌چیز نامحدود + اتصال به صرافی توبیت.
    "diamond": {
        "max_trades": None,
        "trade_analysis": True,
        "trade_analysis_once": False,
        "trade_analysis_quota": None,
        "coach_enabled": True,
        "coach_period_days": None,  # None = بدون فاصلهٔ زمانی (نامحدود)
        "coach_quota": None,
        "report_enabled": True,
        "report_period_days": None,
        "report_quota": None,
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


def referral_bonus(user: User) -> int:
    """Extra AI runs earned by inviting friends: one per 5 qualified invites.

    A friend is *qualified* once they have recorded three journal entries; the
    counter is maintained by ``app.services.referrals``.
    """
    qualified = int(getattr(user, "referral_qualified", 0) or 0)
    if qualified <= 0:
        return 0
    return qualified // REFERRAL_AI_BONUS_STEP


# Quotas that the referral bonus tops up (only when they are real numbers —
# an unlimited quota stays unlimited).
_BONUS_KEYS = ("trade_analysis_quota", "coach_quota")


def limits_for(user: User) -> dict:
    """The active tier's limits, with the referral bonus already applied."""
    limits = dict(PLAN_LIMITS[effective_plan(user)])
    bonus = referral_bonus(user)
    if bonus:
        for key in _BONUS_KEYS:
            value = limits.get(key)
            if value is not None:
                limits[key] = value + bonus
    return limits


def is_free(user: User) -> bool:
    return effective_plan(user) == "bronze"


def plan_duration(months: float) -> timedelta:
    """Approximate a calendar-month duration (30.44 days/month, good enough for subscriptions)."""
    return timedelta(days=round(months * 30.44))


def _upgrade_error(message: str) -> HTTPException:
    """403 with the upgrade marker appended (see the module docstring)."""
    return HTTPException(status_code=403, detail=f"{message} {UPGRADE_MARKER}")


def assert_can_use_trading_plan(user: User) -> None:
    """Trading Plan is available only while a paid tier is active."""
    if effective_plan(user) not in TRADING_PLAN_TIERS:
        raise _upgrade_error(
            "تریدینگ پلن فقط برای کاربران نقره‌ای، طلایی و الماسی فعال است. "
            "برای دسترسی، اشتراک تهیه کن."
        )


def _invite_hint(user: User) -> str:
    """Nudge towards the free way out: invite friends instead of paying."""
    if not is_free(user):
        return ""
    return (
        " یا از بخش «دعوت دوستان» دوستانت رو دعوت کن تا رایگان اعتبار بگیری."
    )


def assert_can_create_trade(user: User, current_trade_count: int) -> None:
    max_trades = limits_for(user)["max_trades"]
    if max_trades is not None and current_trade_count >= max_trades:
        if is_free(user):
            raise _upgrade_error(
                f"سقف ثبت ژورنال در پلن رایگان ({max_trades} معامله) پر شده است. "
                "برای ثبت معاملات بیشتر لازم است اشتراک تهیه کنی."
            )
        raise _upgrade_error(
            f"سقف ثبت معامله برای پلن {PLAN_LABELS[effective_plan(user)]} "
            f"({max_trades} معامله) پر شده است. برای ادامه، اشتراکت رو ارتقا بده."
        )


def assert_can_analyze_trade(user: User, trade=None, used_count: int = 0) -> None:
    """Gate the per-trade AI analysis.

    ``used_count`` is how many trades of this user already carry a stored
    analysis — that is what enforces the free tier's *lifetime* quota of one
    single-trade analysis for the whole account (plus any referral bonus). On
    the free tier re-running an already analysed trade also counts as a second
    use and is refused.
    """
    lim = limits_for(user)
    if not lim["trade_analysis"]:
        raise _upgrade_error(
            f"تحلیل معامله در پلن {PLAN_LABELS[effective_plan(user)]} فعال نیست. "
            "برای دسترسی، اشتراکت رو ارتقا بده."
        )

    quota = lim.get("trade_analysis_quota")
    if quota is not None and used_count >= quota:
        raise _upgrade_error(
            f"سهمیهٔ تحلیل تک‌معامله ({quota} تحلیل) تمام شده است. "
            "برای استفادهٔ بیشتر اشتراک تهیه کن" + _invite_hint(user)
        )

    if lim.get("trade_analysis_once") and trade is not None and getattr(trade, "ai_analysis", None):
        raise _upgrade_error(
            f"در پلن {PLAN_LABELS[effective_plan(user)]} هر معامله فقط یک‌بار تحلیل می‌شود و "
            "تحلیل این معامله قبلاً انجام شده. برای تحلیل مجدد و نامحدود، اشتراک تهیه کن."
        )


def _assert_cooldown(
    user: User,
    *,
    enabled: bool,
    period_days: int | None,
    last_at: datetime | None,
    feature_label: str,
    quota: int | None = None,
    used_count: int = 0,
) -> None:
    if not enabled or quota == 0:
        raise _upgrade_error(
            f"{feature_label} در پلن {PLAN_LABELS[effective_plan(user)]} فعال نیست. "
            "برای دسترسی، اشتراک تهیه کن."
        )

    # Lifetime quota (free tier + referral bonus): a fixed number of runs, ever.
    if quota is not None and used_count >= quota:
        raise _upgrade_error(
            f"سهمیهٔ {feature_label} ({quota} بار) تمام شده است. "
            "برای استفادهٔ بیشتر اشتراک تهیه کن" + _invite_hint(user)
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
        raise _upgrade_error(
            f"در پلن {PLAN_LABELS[effective_plan(user)]}، {feature_label} هر {period_days} روز یک‌بار در دسترسه. "
            f"حدود {hours} ساعت دیگه دوباره امکان‌پذیره. برای دسترسی نامحدود، اشتراکت رو ارتقا بده."
        )


def coach_used_count(user: User) -> int:
    """How many times the journal-wide coach produced a result for this user.

    ``users.ai_overall_runs`` is the real meter (it keeps counting past the
    first run, which the referral bonus needs). Accounts that ran the coach
    before that column existed still have a stored result, so fall back to it.
    """
    runs = int(getattr(user, "ai_overall_runs", 0) or 0)
    if runs:
        return runs
    return 1 if (user.ai_overall_at or user.ai_overall) else 0


def report_used_count(user: User) -> int:
    return 1 if (user.ai_report_at or user.ai_report) else 0


def assert_can_generate_coach(user: User) -> None:
    lim = limits_for(user)
    _assert_cooldown(
        user,
        enabled=lim["coach_enabled"],
        period_days=lim["coach_period_days"],
        last_at=user.ai_overall_at,
        feature_label="مربی هوش مصنوعی",
        quota=lim.get("coach_quota"),
        used_count=coach_used_count(user),
    )


def can_use_toobit(user: User) -> bool:
    """Toobit exchange connection is a diamond-only feature."""
    return bool(limits_for(user).get("toobit"))


def assert_can_use_toobit(user: User) -> None:
    if not can_use_toobit(user):
        raise _upgrade_error(
            "اتصال پنل به صرافی توبیت فقط برای پلن الماسی فعال است. "
            "برای استفاده، اشتراکت رو به الماسی ارتقا بده."
        )


def assert_can_generate_report(user: User) -> None:
    lim = limits_for(user)
    _assert_cooldown(
        user,
        enabled=lim["report_enabled"],
        period_days=lim["report_period_days"],
        last_at=user.ai_report_at,
        feature_label="گزارش و تحلیل نهادی",
        quota=lim.get("report_quota"),
        used_count=report_used_count(user),
    )
