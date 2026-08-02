"""دعوت دوستان — the invite-a-friend (referral) program.

Rules, exactly as sold on the «دعوت دوستان» page:

* Every user owns a permanent invite code and a link
  ``<site>/register?ref=<code>``. The code is minted lazily the first time the
  page (or the API) is touched, so old accounts get one automatically.
* A friend *counts* as soon as they register with the link, but only becomes
  **qualified** once they have logged :data:`QUALIFY_TRADES` journal entries.
  Only qualified friends pay out.
* Milestones (each granted once, ever):
    - 3 qualified friends  → 14 days of نقره‌ای
    - 10 qualified friends → 14 days of طلایی
    - 50 qualified friends → 14 days of الماسی
* On top of that, **every 5 qualified friends** add one extra AI coach run and
  one extra single-trade analysis to the account's free quota, for ever (5 → 1,
  10 → 2, 15 → 3 …). That bonus is applied inside ``app.services.plans`` via
  :func:`app.services.plans.referral_bonus`, which reads the denormalised
  ``users.referral_qualified`` counter this module maintains.

Granting a reward never *downgrades* anybody: if the user is already on a
higher tier the reward extends what they have (or is skipped when their current
plan has no expiry, i.e. it is unlimited).
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.trade import Trade
from app.models.user import User
from app.services import plans

# How many journal entries an invited friend must record before they count.
QUALIFY_TRADES = 3

# Every N qualified friends → +1 coach run and +1 single-trade analysis.
AI_BONUS_STEP = 5

REWARD_DAYS = 14

MILESTONES: list[dict] = [
    {
        "id": "silver",
        "tier": "silver",
        "need": 3,
        "days": REWARD_DAYS,
        "title": "۳ دوست فعال",
        "reward": "۱۴ روز اشتراک نقره‌ای",
    },
    {
        "id": "gold",
        "tier": "gold",
        "need": 10,
        "days": REWARD_DAYS,
        "title": "۱۰ دوست فعال",
        "reward": "۱۴ روز اشتراک طلایی",
    },
    {
        "id": "diamond",
        "tier": "diamond",
        "need": 50,
        "days": REWARD_DAYS,
        "title": "۵۰ دوست فعال",
        "reward": "۱۴ روز اشتراک الماسی",
    },
]

# Unambiguous alphabet (no O/0, I/1) — the code gets read out loud and retyped.
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_CODE_LEN = 8


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Codes
# ---------------------------------------------------------------------------
async def _code_taken(db: AsyncSession, code: str) -> bool:
    result = await db.execute(select(User.id).where(User.referral_code == code))
    return result.scalars().first() is not None


async def ensure_code(db: AsyncSession, user: User) -> str:
    """Return this user's invite code, minting one on first use."""
    if user.referral_code:
        return user.referral_code
    for _ in range(12):
        code = "".join(secrets.choice(_ALPHABET) for _ in range(_CODE_LEN))
        if not await _code_taken(db, code):
            user.referral_code = code
            await db.commit()
            await db.refresh(user)
            return code
    # Astronomically unlikely; fall back to something guaranteed unique.
    code = f"U{user.id}{secrets.choice(_ALPHABET)}{secrets.choice(_ALPHABET)}"
    user.referral_code = code[:16]
    await db.commit()
    await db.refresh(user)
    return user.referral_code


async def find_by_code(db: AsyncSession, code: str | None) -> User | None:
    code = (code or "").strip().upper()
    if not code:
        return None
    result = await db.execute(select(User).where(User.referral_code == code))
    return result.scalars().first()


async def attach_referrer(db: AsyncSession, new_user: User, code: str | None) -> None:
    """Link a freshly registered user to whoever invited them.

    Silently ignores unknown codes and self-invites — a bad code must never
    break a registration.
    """
    referrer = await find_by_code(db, code)
    if referrer is None or referrer.id == new_user.id:
        return
    new_user.referred_by_id = referrer.id
    await db.commit()
    try:
        await sync(db, referrer)
    except Exception:  # noqa: BLE001 - never fail the registration over this
        pass


# ---------------------------------------------------------------------------
# Counting
# ---------------------------------------------------------------------------
async def load_friends(db: AsyncSession, referrer_id: int) -> list[dict]:
    """Every invited account with its journal-entry count, newest first."""
    result = await db.execute(
        select(
            User.id,
            User.username,
            User.first_name,
            User.last_name,
            User.created_at,
            func.count(Trade.id).label("trades"),
        )
        .outerjoin(Trade, Trade.user_id == User.id)
        .where(User.referred_by_id == referrer_id)
        .group_by(
            User.id, User.username, User.first_name, User.last_name, User.created_at
        )
        .order_by(User.created_at.desc())
    )
    friends: list[dict] = []
    for row in result.all():
        trades = int(row.trades or 0)
        name = f"{row.first_name or ''} {row.last_name or ''}".strip()
        friends.append(
            {
                "id": row.id,
                "username": row.username,
                "name": name or row.username,
                "joinedAt": row.created_at.isoformat() if row.created_at else None,
                "trades": trades,
                "needed": QUALIFY_TRADES,
                "qualified": trades >= QUALIFY_TRADES,
            }
        )
    return friends


# ---------------------------------------------------------------------------
# Rewards
# ---------------------------------------------------------------------------
def _rank(tier: str) -> int:
    try:
        return plans.PLAN_ORDER.index(tier)
    except ValueError:
        return 0


def _apply_reward(user: User, tier: str, days: int) -> bool:
    """Give ``days`` of ``tier``. Returns False when nothing could be applied."""
    now = _utcnow()
    current = plans.effective_plan(user)
    expires = _aware(user.subscription_expires_at)

    if _rank(tier) > _rank(current):
        # A real upgrade: switch tier, 14 days from now.
        user.subscription_tier = tier
        user.subscription_expires_at = now + timedelta(days=days)
        return True

    if _rank(tier) == _rank(current):
        base = expires if (expires and expires > now) else now
        user.subscription_expires_at = base + timedelta(days=days)
        return True

    # Already on a better plan: extend it, unless it is unlimited (no expiry),
    # in which case adding one would actually take something away.
    if expires is None:
        return True
    base = expires if expires > now else now
    user.subscription_expires_at = base + timedelta(days=days)
    return True


async def sync(db: AsyncSession, user: User) -> dict:
    """Recount this user's invites and pay out any newly earned milestone.

    Safe to call as often as we like: milestones are recorded in
    ``users.referral_rewards`` so nothing is ever granted twice.
    """
    friends = await load_friends(db, user.id)
    total = len(friends)
    qualified = sum(1 for f in friends if f["qualified"])

    granted: list[str] = list(user.referral_rewards or [])
    newly: list[dict] = []
    for stone in MILESTONES:
        if stone["id"] in granted:
            continue
        if qualified >= stone["need"]:
            if _apply_reward(user, stone["tier"], stone["days"]):
                granted.append(stone["id"])
                newly.append(stone)

    changed = (
        user.referral_total != total
        or user.referral_qualified != qualified
        or bool(newly)
    )
    if changed:
        user.referral_total = total
        user.referral_qualified = qualified
        # Reassign (not append) so SQLAlchemy notices the JSON column changed.
        user.referral_rewards = list(granted)
        await db.commit()
        await db.refresh(user)

    return {
        "friends": friends,
        "total": total,
        "qualified": qualified,
        "granted": granted,
        "newly": newly,
    }


# ---------------------------------------------------------------------------
# Page payload
# ---------------------------------------------------------------------------
async def _trade_analyses_used(db: AsyncSession, user_id: int) -> int:
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


async def stats(db: AsyncSession, user: User) -> dict:
    """Everything the «دعوت دوستان» page renders, in one payload."""
    code = await ensure_code(db, user)
    state = await sync(db, user)

    qualified = state["qualified"]
    granted = state["granted"]

    milestones = []
    for stone in MILESTONES:
        need = stone["need"]
        milestones.append(
            {
                "id": stone["id"],
                "tier": stone["tier"],
                "need": need,
                "days": stone["days"],
                "title": stone["title"],
                "reward": stone["reward"],
                "label": plans.PLAN_LABELS.get(stone["tier"], stone["tier"]),
                "unlocked": stone["id"] in granted,
                "remaining": max(0, need - qualified),
                "progress": min(1.0, (qualified / need) if need else 0.0),
            }
        )

    bonus = plans.referral_bonus(user)
    bonus_used_coach = int(getattr(user, "ai_overall_runs", 0) or 0)
    bonus_used_trade = await _trade_analyses_used(db, user.id)
    limits = plans.limits_for(user)

    def _left(quota, used):
        if quota is None:
            return None  # unlimited
        return max(0, quota - used)

    next_bonus_in = AI_BONUS_STEP - (qualified % AI_BONUS_STEP) if AI_BONUS_STEP else 0
    if qualified and qualified % AI_BONUS_STEP == 0:
        next_bonus_in = AI_BONUS_STEP

    return {
        "code": code,
        "total": state["total"],
        "qualified": qualified,
        "pending": max(0, state["total"] - qualified),
        "qualifyTrades": QUALIFY_TRADES,
        "friends": state["friends"],
        "milestones": milestones,
        "plan": plans.effective_plan(user),
        "planLabel": plans.PLAN_LABELS.get(plans.effective_plan(user), ""),
        "planExpiresAt": (
            user.subscription_expires_at.isoformat()
            if user.subscription_expires_at
            else None
        ),
        "aiBonus": {
            "step": AI_BONUS_STEP,
            "earned": bonus,
            "nextIn": next_bonus_in,
            "coachQuota": limits.get("coach_quota"),
            "coachUsed": bonus_used_coach,
            "coachLeft": _left(limits.get("coach_quota"), bonus_used_coach),
            "tradeQuota": limits.get("trade_analysis_quota"),
            "tradeUsed": bonus_used_trade,
            "tradeLeft": _left(limits.get("trade_analysis_quota"), bonus_used_trade),
        },
    }
