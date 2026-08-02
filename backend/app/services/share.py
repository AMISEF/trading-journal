"""کارنامهٔ عمومی معامله‌گر — «اشتراک‌گذاری معاملات».

هر کاربرِ طلایی یا الماسی می‌تواند یک لینک عمومی بسازد (`/journal/u/<slug>`) و
کارنامه‌اش را با بقیه به اشتراک بگذارد. چهار حالت اشتراک‌گذاری وجود دارد:

``dashboard``      فقط داشبورد (آمار، منحنی سرمایه، تقویم…)
``journal``        فقط لیست معاملات، بدون جزئیات (نتیجه‌ها بدون یادداشت/تصویر)
``journal_full``   فقط لیست معاملات، با تمام جزئیات
``all``            هر سه با هم (پیش‌فرض)

هیچ داده‌ای بدون فعال بودنِ صریحِ لینک (``share_enabled``) عمومی نمی‌شود، و با
پایان یافتن اشتراکِ کاربر (سقوط به برنزی) صفحه به‌صورت خودکار بسته می‌شود.
"""

from __future__ import annotations

import re
import secrets

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.services import plans

# پلن‌هایی که کارنامهٔ عمومی برایشان باز است.
ALLOWED_PLANS = ("gold", "diamond")

SLUG_MIN = 3
SLUG_MAX = 30
_SLUG_RE = re.compile(r"^[A-Za-z0-9_-]+$")
_RESERVED = {
    "ADMIN", "ADMINISTRATOR", "API", "APP", "DASHBOARD", "JOURNAL", "JOURNALS",
    "LEAGUE", "LOGIN", "LOGOUT", "NEW", "NONE", "NULL", "PROFILE", "PUBLIC",
    "REFERRAL", "REFERRALS", "REGISTER", "ROOT", "SETTINGS", "SHARE", "STATIC",
    "SUPPORT", "SYSTEM", "U", "UNDEFINED", "USER", "USERS",
}

DEFAULT_MODE = "all"
MODE_ORDER = ["dashboard", "journal", "journal_full", "all"]
MODE_INFO: dict[str, dict] = {
    "dashboard": {
        "label": "فقط داشبورد",
        "desc": "آمار کلی، منحنی سرمایه، وین‌ریت و تقویم سود و زیان — بدون لیست معاملات.",
        "icon": "chart",
    },
    "journal": {
        "label": "فقط ژورنال‌ها (بدون جزئیات)",
        "desc": "لیست معاملات و نتیجهٔ هرکدام، بدون یادداشت، تصویر، چک‌لیست و دلایل ورود/خروج.",
        "icon": "list",
    },
    "journal_full": {
        "label": "فقط ژورنال‌ها (با جزئیات)",
        "desc": "لیست معاملات با تمام جزئیات: حد ضرر، تارگت‌ها، دلایل، احساسات، چک‌لیست و تصاویر.",
        "icon": "book",
    },
    "all": {
        "label": "هر سه با هم",
        "desc": "داشبورد کامل + لیست معاملات با تمام جزئیات. کامل‌ترین حالتِ کارنامه.",
        "icon": "sparkles",
    },
}


class ShareError(ValueError):
    """خطای قابل‌نمایش به کاربر هنگام تنظیم لینک عمومی."""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── دسترسی بر اساس پلن ──────────────────────────────────────────────────
def can_share(user: User) -> bool:
    return plans.effective_plan(user) in ALLOWED_PLANS


def assert_can_share(user: User) -> None:
    if not can_share(user):
        raise HTTPException(
            status_code=403,
            detail=(
                "ساخت «کارنامهٔ عمومی» فقط برای پلن طلایی و الماسی فعال است. "
                "برای ساخت لینک اختصاصی و اشتراک‌گذاری معاملاتت، اشتراکت رو ارتقا بده. "
                f"{plans.UPGRADE_MARKER}"
            ),
        )


# ── حالت‌های اشتراک‌گذاری ────────────────────────────────────────────────
def normalize_mode(raw: str | None) -> str:
    mode = (raw or "").strip().lower()
    return mode if mode in MODE_INFO else DEFAULT_MODE


def mode_label(mode: str) -> str:
    return MODE_INFO[normalize_mode(mode)]["label"]


def modes_payload() -> list[dict]:
    return [{"id": m, **MODE_INFO[m]} for m in MODE_ORDER]


def shows_dashboard(mode: str) -> bool:
    return normalize_mode(mode) in ("dashboard", "all")


def shows_journal(mode: str) -> bool:
    return normalize_mode(mode) in ("journal", "journal_full", "all")


def shows_details(mode: str) -> bool:
    return normalize_mode(mode) in ("journal_full", "all")


# ── نشانی (slug) ────────────────────────────────────────────────────────
_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def sanitize(raw: str | None) -> str:
    """پاک‌سازیِ ورودی: ارقام فارسی/عربی به انگلیسی، حذف کاراکترهای غیرمجاز."""
    value = (raw or "").strip().translate(_DIGITS)
    value = value.replace(" ", "-")
    value = re.sub(r"[^A-Za-z0-9_-]", "", value)
    return value[:SLUG_MAX]


def _validate(slug: str) -> str:
    if not slug:
        raise ShareError("نشانی لینک را وارد کنید.")
    if len(slug) < SLUG_MIN or len(slug) > SLUG_MAX:
        raise ShareError(f"نشانی لینک باید بین {SLUG_MIN} تا {SLUG_MAX} کاراکتر باشد.")
    if not _SLUG_RE.match(slug):
        raise ShareError(
            "نشانی لینک فقط می‌تواند شامل حروف انگلیسی، عدد، خط تیره (-) و زیرخط (_) باشد."
        )
    if slug.upper() in _RESERVED:
        raise ShareError("این نشانی رزرو شده است؛ یک نشانی دیگر انتخاب کن.")
    return slug


def suggest(user: User) -> str:
    """پیشنهادِ اولیه بر پایهٔ نام کاربری."""
    base = sanitize(getattr(user, "username", "") or "")
    if len(base) < SLUG_MIN:
        base = f"trader{user.id}"
    return base[:SLUG_MAX]


async def _taken(db: AsyncSession, slug: str, exclude_user_id: int | None = None) -> bool:
    stmt = select(User.id).where(func.upper(User.share_slug) == slug.upper())
    if exclude_user_id is not None:
        stmt = stmt.where(User.id != exclude_user_id)
    return (await db.execute(stmt.limit(1))).first() is not None


async def available(db: AsyncSession, user: User, raw: str | None) -> dict:
    """بررسی زندهٔ آزاد بودنِ یک نشانی (برای فرمِ فرانت‌اند)."""
    slug = sanitize(raw)
    try:
        _validate(slug)
    except ShareError as exc:
        return {"slug": slug, "available": False, "reason": str(exc)}
    if user.share_slug and slug.upper() == user.share_slug.upper():
        return {"slug": slug, "available": True, "reason": "نشانی فعلی خودت است."}
    if await _taken(db, slug, exclude_user_id=user.id):
        return {"slug": slug, "available": False, "reason": "این نشانی قبلاً گرفته شده است."}
    return {"slug": slug, "available": True, "reason": "این نشانی آزاد است ✓"}


async def _pick_free_slug(db: AsyncSession, user: User) -> str:
    """اولین نشانیِ آزاد بر پایهٔ پیشنهاد (در صورت تکراری بودن، عدد اضافه می‌شود)."""
    base = suggest(user)
    try:
        _validate(base)
    except ShareError:
        base = f"trader{user.id}"
    if not await _taken(db, base, exclude_user_id=user.id):
        return base
    for _ in range(20):
        suffix = secrets.token_hex(2)
        candidate = f"{base[: SLUG_MAX - 5]}-{suffix}"
        if not await _taken(db, candidate, exclude_user_id=user.id):
            return candidate
    return f"trader{user.id}-{secrets.token_hex(3)}"


def _clean_text(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).split())
    return text[:limit] or None


async def update_settings(
    db: AsyncSession,
    user: User,
    *,
    enabled: bool | None = None,
    mode: str | None = None,
    slug: str | None = None,
    title: str | None = None,
    bio: str | None = None,
    anonymous: bool | None = None,
) -> User:
    """به‌روزرسانیِ تنظیماتِ کارنامهٔ عمومی (فقط فیلدهای ارسال‌شده)."""
    if slug is not None:
        wanted = _validate(sanitize(slug))
        if await _taken(db, wanted, exclude_user_id=user.id):
            raise ShareError("این نشانی قبلاً گرفته شده است.")
        user.share_slug = wanted
    if mode is not None:
        user.share_mode = normalize_mode(mode)
    if title is not None:
        user.share_title = _clean_text(title, 80)
    if bio is not None:
        user.share_bio = _clean_text(bio, 300)
    if anonymous is not None:
        user.share_anonymous = bool(anonymous)
    if enabled is not None:
        user.share_enabled = bool(enabled)
        if user.share_enabled and not user.share_slug:
            user.share_slug = await _pick_free_slug(db, user)
    if user.share_enabled and not user.share_created_at:
        user.share_created_at = _utcnow()
    if not user.share_mode:
        user.share_mode = DEFAULT_MODE
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ShareError("این نشانی همین الان توسط کاربر دیگری گرفته شد؛ یکی دیگر انتخاب کن.")
    await db.refresh(user)
    return user


# ── نمایش ───────────────────────────────────────────────────────────────
def display_name(user: User) -> str:
    if getattr(user, "share_anonymous", False):
        return user.username or "معامله‌گر"
    full = " ".join(x for x in [user.first_name, user.last_name] if x).strip()
    return full or user.username or "معامله‌گر"


def path_for(user: User) -> str | None:
    return f"/u/{user.share_slug}" if user.share_slug else None


def settings_payload(user: User) -> dict:
    plan = plans.effective_plan(user)
    return {
        "can_share": can_share(user),
        "plan": plan,
        "plan_label": plans.PLAN_LABELS.get(plan, plan),
        "enabled": bool(user.share_enabled),
        "slug": user.share_slug,
        "suggested": suggest(user),
        "mode": normalize_mode(user.share_mode),
        "title": user.share_title,
        "bio": user.share_bio,
        "anonymous": bool(getattr(user, "share_anonymous", False)),
        "views": int(getattr(user, "share_views", 0) or 0),
        "created_at": user.share_created_at,
        "slug_min": SLUG_MIN,
        "slug_max": SLUG_MAX,
        "path": path_for(user),
        "modes": modes_payload(),
    }


async def find_by_slug(db: AsyncSession, slug: str) -> User | None:
    """کاربرِ صاحبِ این نشانی — فقط اگر لینکش فعال و پلنش مجاز باشد."""
    clean = sanitize(slug)
    if not clean:
        return None
    result = await db.execute(
        select(User).where(func.upper(User.share_slug) == clean.upper()).limit(1)
    )
    user = result.scalars().first()
    if user is None or not user.share_enabled or not can_share(user):
        return None
    return user
