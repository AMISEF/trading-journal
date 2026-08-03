"""اندازه‌گیری قیف محصول — API پنل مدیریت.

``POST /api/analytics/track``  — ثبت بازدید/رویداد (عمومی، بدون احراز هویت)
``GET  /api/analytics/funnel`` — گزارش کامل قیف (فقط ادمین)

مراحل قیف:
  ۱) بازدید لندینگ → ۲) ثبت‌نام → ۳) اولین معامله → ۴) خرید اشتراک
مرحلهٔ ۳ مهم‌ترین عدد محصول است.

پایگاه‌داده PostgreSQL است؛ بنابراین برای گروه‌بندی زمانی از ``to_char``
و برای شمارش شرطی از ``CASE`` استفاده می‌شود. هر بخش اختیاری در یک
try/except با rollback بسته شده تا یک کوئریِ ناموفق کل گزارش را از کار
نیندازد.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import and_, case, distinct, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_admin, get_db
from app.models.analytics_event import AnalyticsEvent
from app.models.trade import Trade
from app.models.user import User
from app.schemas.base import CamelModel

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

PAID_TIERS = ("silver", "gold", "diamond")
_ALLOWED_KINDS = {"view", "cta_click", "signup_start", "plan_view", "install_prompt"}

_BOT_RE = re.compile(
    r"bot|crawl|spider|slurp|bing|yandex|duckduck|baidu|ahrefs|semrush|"
    r"facebookexternalhit|telegrambot|preview|monitor|uptime|curl|wget|python-requests",
    re.I,
)
_MOBILE_RE = re.compile(r"android|iphone|ipod|mobile|windows phone", re.I)
_TABLET_RE = re.compile(r"ipad|tablet", re.I)

_SOURCE_TABLE = {
    "google": "google", "bing": "bing", "duckduckgo": "duckduckgo",
    "yandex": "yandex", "t.me": "telegram", "telegram": "telegram",
    "instagram": "instagram", "youtube": "youtube", "aparat": "aparat",
    "twitter": "twitter", "x.com": "twitter", "linkedin": "linkedin",
    "whatsapp": "whatsapp", "facebook": "facebook",
}


class TrackIn(CamelModel):
    kind: str = "view"
    vid: str | None = None
    path: str | None = None
    referrer: str | None = None
    source: str | None = None
    campaign: str | None = None


def _device(ua: str) -> str:
    if _BOT_RE.search(ua or ""):
        return "bot"
    if _TABLET_RE.search(ua or ""):
        return "tablet"
    if _MOBILE_RE.search(ua or ""):
        return "mobile"
    return "desktop"


def _classify(referrer: str | None, utm_source: str | None) -> str:
    if utm_source:
        return utm_source.strip().lower()[:40]
    ref = (referrer or "").lower()
    if not ref:
        return "direct"
    for needle, label in _SOURCE_TABLE.items():
        if needle in ref:
            return label
    if "cryptosmart" in ref:
        return "internal"
    return "referral"


def _pct(part: float, whole: float) -> float:
    return round((part / whole) * 100, 1) if whole else 0.0


@router.post("/track")
async def track(
    body: TrackIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """ثبت یک بازدید/رویداد. هرگز خطا برنمی‌گرداند تا تجربهٔ کاربر خراب نشود."""
    try:
        kind = body.kind if body.kind in _ALLOWED_KINDS else "view"
        ua = request.headers.get("user-agent", "")
        device = _device(ua)
        db.add(
            AnalyticsEvent(
                kind=kind,
                vid=(body.vid or "")[:40] or None,
                path=(body.path or "")[:200] or None,
                referrer=(body.referrer or "")[:200] or None,
                source=_classify(body.referrer, body.source),
                campaign=(body.campaign or "")[:60] or None,
                device=device,
                is_bot=device == "bot",
            )
        )
        await db.commit()
    except Exception:  # noqa: BLE001
        await db.rollback()
    return {"ok": True}


async def _scalar(db: AsyncSession, stmt) -> int:
    """شمارشِ امن: اگر جدول هنوز ساخته نشده باشد صفر برمی‌گرداند."""
    try:
        value = await db.scalar(stmt)
        return int(value or 0)
    except Exception:  # noqa: BLE001
        await db.rollback()
        return 0


@router.get("/funnel")
async def funnel(
    days: int = 30,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    days = max(1, min(int(days), 365))
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    prev_since = now - timedelta(days=days * 2)

    human = and_(AnalyticsEvent.kind == "view", AnalyticsEvent.is_bot.is_(False))

    # ── مرحلهٔ ۱: بازدید ──
    visitors = await _scalar(db, select(func.count(distinct(AnalyticsEvent.vid)))
                             .where(human, AnalyticsEvent.ts >= since))
    pageviews = await _scalar(db, select(func.count(AnalyticsEvent.id))
                              .where(human, AnalyticsEvent.ts >= since))
    bot_hits = await _scalar(db, select(func.count(AnalyticsEvent.id))
                             .where(AnalyticsEvent.kind == "view",
                                    AnalyticsEvent.is_bot.is_(True),
                                    AnalyticsEvent.ts >= since))
    prev_visitors = await _scalar(db, select(func.count(distinct(AnalyticsEvent.vid)))
                                  .where(human, AnalyticsEvent.ts >= prev_since,
                                         AnalyticsEvent.ts < since))

    # ── مرحلهٔ ۲: ثبت‌نام ──
    signups = await _scalar(db, select(func.count(User.id))
                            .where(User.created_at >= since))
    prev_signups = await _scalar(db, select(func.count(User.id))
                                 .where(User.created_at >= prev_since,
                                        User.created_at < since))

    has_trade = exists().where(Trade.user_id == User.id)

    # ── مرحلهٔ ۳: اولین معامله (مهم‌ترین عدد) ──
    activated = await _scalar(db, select(func.count(User.id))
                              .where(User.created_at >= since, has_trade))

    # ── مرحلهٔ ۴: خرید ──
    paid = await _scalar(db, select(func.count(User.id))
                         .where(User.created_at >= since,
                                User.subscription_tier.in_(PAID_TIERS)))

    # ── عمق درگیری: کاربران با ۵ معامله یا بیشتر ──
    engaged_sub = (
        select(Trade.user_id)
        .group_by(Trade.user_id)
        .having(func.count(Trade.id) >= 5)
        .subquery()
    )
    engaged = await _scalar(db, select(func.count(User.id))
                            .where(User.created_at >= since,
                                   User.id.in_(select(engaged_sub.c.user_id))))

    # ── اعداد کلی ──
    total_users = await _scalar(db, select(func.count(User.id)))
    total_activated = await _scalar(db, select(func.count(User.id)).where(has_trade))
    total_paid = await _scalar(db, select(func.count(User.id))
                               .where(User.subscription_tier.in_(PAID_TIERS)))
    total_trades = await _scalar(db, select(func.count(Trade.id)))
    new_trades = await _scalar(db, select(func.count(Trade.id))
                               .where(Trade.created_at >= since))

    # ── ریزش ماهانه ──
    active_paid = await _scalar(
        db,
        select(func.count(User.id)).where(
            User.subscription_tier.in_(PAID_TIERS),
            (User.subscription_expires_at.is_(None))
            | (User.subscription_expires_at > now),
        ),
    )
    expired_30d = await _scalar(
        db,
        select(func.count(User.id)).where(
            User.subscription_expires_at.is_not(None),
            User.subscription_expires_at <= now,
            User.subscription_expires_at >= now - timedelta(days=30),
        ),
    )
    expiring_7d = await _scalar(
        db,
        select(func.count(User.id)).where(
            User.subscription_expires_at.is_not(None),
            User.subscription_expires_at > now,
            User.subscription_expires_at <= now + timedelta(days=7),
        ),
    )

    # ── روند روزانه (PostgreSQL: to_char) ──
    day_ev = func.to_char(AnalyticsEvent.ts, "YYYY-MM-DD")
    day_user = func.to_char(User.created_at, "YYYY-MM-DD")
    day_trade = func.to_char(Trade.created_at, "YYYY-MM-DD")
    trend_map: dict[str, dict[str, Any]] = {}

    def _slot(key: str) -> dict[str, Any]:
        return trend_map.setdefault(
            key, {"day": key, "visitors": 0, "views": 0, "signups": 0, "trades": 0}
        )

    try:
        rows = (await db.execute(
            select(day_ev.label("day"),
                   func.count(distinct(AnalyticsEvent.vid)).label("visitors"),
                   func.count(AnalyticsEvent.id).label("views"))
            .where(human, AnalyticsEvent.ts >= since)
            .group_by(day_ev).order_by(day_ev)
        )).all()
        for r in rows:
            item = _slot(r.day)
            item["visitors"] = int(r.visitors or 0)
            item["views"] = int(r.views or 0)
    except Exception:  # noqa: BLE001
        await db.rollback()

    try:
        rows = (await db.execute(
            select(day_user.label("day"), func.count(User.id).label("n"))
            .where(User.created_at >= since).group_by(day_user)
        )).all()
        for r in rows:
            _slot(r.day)["signups"] = int(r.n or 0)
    except Exception:  # noqa: BLE001
        await db.rollback()

    try:
        rows = (await db.execute(
            select(day_trade.label("day"), func.count(Trade.id).label("n"))
            .where(Trade.created_at >= since).group_by(day_trade)
        )).all()
        for r in rows:
            _slot(r.day)["trades"] = int(r.n or 0)
    except Exception:  # noqa: BLE001
        await db.rollback()

    trend = sorted(trend_map.values(), key=lambda x: x["day"])

    # ── منابع / دستگاه / صفحات ──
    async def _group(column, limit: int = 12) -> list[dict[str, Any]]:
        try:
            rows = (await db.execute(
                select(column.label("k"),
                       func.count(distinct(AnalyticsEvent.vid)).label("visitors"),
                       func.count(AnalyticsEvent.id).label("views"))
                .where(human, AnalyticsEvent.ts >= since)
                .group_by(column).order_by(func.count(AnalyticsEvent.id).desc())
                .limit(limit)
            )).all()
            return [{"key": r.k or "direct", "visitors": int(r.visitors or 0),
                     "views": int(r.views or 0)} for r in rows]
        except Exception:  # noqa: BLE001
            await db.rollback()
            return []

    sources = await _group(AnalyticsEvent.source)
    devices = await _group(AnalyticsEvent.device, 6)
    pages = await _group(AnalyticsEvent.path, 10)

    # ── کوهورت ماهانه ──
    cohorts: list[dict[str, Any]] = []
    try:
        base = (
            select(
                func.to_char(User.created_at, "YYYY-MM").label("m"),
                User.id.label("uid"),
                case((has_trade, 1), else_=0).label("act"),
                case((User.subscription_tier.in_(PAID_TIERS), 1), else_=0).label("pd"),
            )
            .where(User.created_at >= now - timedelta(days=190))
            .subquery()
        )
        rows = (await db.execute(
            select(base.c.m,
                   func.count(base.c.uid).label("signups"),
                   func.sum(base.c.act).label("activated"),
                   func.sum(base.c.pd).label("paid"))
            .group_by(base.c.m).order_by(base.c.m.desc()).limit(6)
        )).all()
        for r in rows:
            signups_n = int(r.signups or 0)
            act_n = int(r.activated or 0)
            paid_n = int(r.paid or 0)
            cohorts.append({
                "month": r.m,
                "signups": signups_n,
                "activated": act_n,
                "paid": paid_n,
                "activationRate": _pct(act_n, signups_n),
                "paidRate": _pct(paid_n, signups_n),
            })
        cohorts.reverse()
    except Exception:  # noqa: BLE001
        await db.rollback()
        cohorts = []

    # ── میانهٔ فاصلهٔ ثبت‌نام تا اولین معامله (ساعت) ──
    median_hours: float | None = None
    try:
        rows = (await db.execute(
            select(User.created_at, func.min(Trade.created_at))
            .join(Trade, Trade.user_id == User.id)
            .group_by(User.id, User.created_at)
        )).all()
        gaps = []
        for created, first_trade in rows:
            if not created or not first_trade:
                continue
            a = created if created.tzinfo else created.replace(tzinfo=timezone.utc)
            b = (first_trade if first_trade.tzinfo
                 else first_trade.replace(tzinfo=timezone.utc))
            delta = (b - a).total_seconds() / 3600.0
            if delta >= 0:
                gaps.append(delta)
        if gaps:
            gaps.sort()
            median_hours = round(gaps[len(gaps) // 2], 1)
    except Exception:  # noqa: BLE001
        await db.rollback()
        median_hours = None

    try:
        tracking_since = await db.scalar(
            select(func.min(AnalyticsEvent.ts)).where(AnalyticsEvent.kind == "view")
        )
    except Exception:  # noqa: BLE001
        await db.rollback()
        tracking_since = None

    steps = [
        {"key": "visit", "label": "\u0628\u0627\u0632\u062f\u06cc\u062f \u0644\u0646\u062f\u06cc\u0646\u06af", "value": visitors,
         "rate": 100.0, "of": None,
         "hint": "\u0628\u0627\u0632\u062f\u06cc\u062f\u06a9\u0646\u0646\u062f\u0647\u0654 \u06cc\u06a9\u062a\u0627"},
        {"key": "signup", "label": "\u062b\u0628\u062a\u200c\u0646\u0627\u0645", "value": signups,
         "rate": _pct(signups, visitors), "of": "\u0628\u0627\u0632\u062f\u06cc\u062f",
         "hint": "\u062f\u0631\u0635\u062f \u062a\u0628\u062f\u06cc\u0644 \u0628\u0627\u0632\u062f\u06cc\u062f \u0628\u0647 \u06a9\u0627\u0631\u0628\u0631"},
        {"key": "activation", "label": "\u0627\u0648\u0644\u06cc\u0646 \u0645\u0639\u0627\u0645\u0644\u0647", "value": activated,
         "rate": _pct(activated, signups), "of": "\u062b\u0628\u062a\u200c\u0646\u0627\u0645",
         "hint": "\u0645\u0647\u0645\u200c\u062a\u0631\u06cc\u0646 \u0639\u062f\u062f \u0645\u062d\u0635\u0648\u0644"},
        {"key": "engaged", "label": "\u06f5 \u0645\u0639\u0627\u0645\u0644\u0647 \u06cc\u0627 \u0628\u06cc\u0634\u062a\u0631", "value": engaged,
         "rate": _pct(engaged, activated), "of": "\u0641\u0639\u0627\u0644\u200c\u0634\u062f\u0647",
         "hint": "\u0639\u0627\u062f\u062a\u200c\u0633\u0627\u0632\u06cc \u0648\u0627\u0642\u0639\u06cc"},
        {"key": "purchase", "label": "\u062e\u0631\u06cc\u062f \u0627\u0634\u062a\u0631\u0627\u06a9", "value": paid,
         "rate": _pct(paid, activated), "of": "\u0641\u0639\u0627\u0644\u200c\u0634\u062f\u0647",
         "hint": "\u062f\u0631\u0622\u0645\u062f"},
    ]

    return {
        "days": days,
        "steps": steps,
        "headline": {
            "visitToSignup": _pct(signups, visitors),
            "signupToActivation": _pct(activated, signups),
            "activationToPaid": _pct(paid, activated),
            "visitToPaid": _pct(paid, visitors),
            "monthlyChurn": _pct(expired_30d, active_paid + expired_30d),
        },
        "counts": {
            "visitors": visitors,
            "pageviews": pageviews,
            "botHits": bot_hits,
            "signups": signups,
            "activated": activated,
            "engaged": engaged,
            "paid": paid,
            "newTrades": new_trades,
            "pagesPerVisitor": round(pageviews / visitors, 1) if visitors else 0,
        },
        "lifetime": {
            "users": total_users,
            "activated": total_activated,
            "paid": total_paid,
            "trades": total_trades,
            "activationRate": _pct(total_activated, total_users),
            "paidRate": _pct(total_paid, total_users),
            "tradesPerActive": round(total_trades / total_activated, 1)
            if total_activated else 0,
        },
        "retention": {
            "activePaid": active_paid,
            "expired30d": expired_30d,
            "expiring7d": expiring_7d,
            "monthlyChurn": _pct(expired_30d, active_paid + expired_30d),
        },
        "growth": {
            "visitors": _pct(visitors - prev_visitors, prev_visitors)
            if prev_visitors else None,
            "signups": _pct(signups - prev_signups, prev_signups)
            if prev_signups else None,
        },
        "trend": trend,
        "sources": sources,
        "devices": devices,
        "pages": pages,
        "cohorts": cohorts,
        "medianHoursToActivate": median_hours,
        "trackingSince": tracking_since.isoformat() if tracking_since else None,
    }
