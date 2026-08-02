"""«اشتراک‌گذاری معاملات» — تنظیماتِ کارنامهٔ عمومی + خواندنِ عمومیِ آن.

* `/api/share/*`   احراز هویت لازم است (فقط طلایی و الماسی).
* `/api/public/profile/{slug}` بدون احراز هویت — همان چیزی که مهمان می‌بیند.

منطقِ حالت‌ها و اعتبارسنجیِ نشانی در `app/services/share.py` است.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import crud
from app.api.dashboard import DashboardOut, build_user_dashboard
from app.api.serializers import trade_to_out
from app.core.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.base import CamelModel
from app.schemas.trade import TradeOut
from app.services import plans, share as share_svc

router = APIRouter(prefix="/api/share", tags=["share"])
public_router = APIRouter(prefix="/api/public", tags=["share"])


# ── schemas ─────────────────────────────────────────────────────────────
class ShareSettingsOut(CamelModel):
    can_share: bool
    plan: str
    plan_label: str
    enabled: bool
    slug: str | None = None
    suggested: str
    mode: str
    title: str | None = None
    bio: str | None = None
    anonymous: bool = False
    views: int = 0
    created_at: datetime | None = None
    slug_min: int
    slug_max: int
    path: str | None = None
    modes: list[dict] = []


class ShareUpdateIn(CamelModel):
    enabled: bool | None = None
    mode: str | None = None
    slug: str | None = None
    title: str | None = None
    bio: str | None = None
    anonymous: bool | None = None


class SlugCheckOut(CamelModel):
    slug: str
    available: bool
    reason: str


class PublicProfileOut(CamelModel):
    slug: str
    name: str
    username: str | None = None
    title: str | None = None
    bio: str | None = None
    plan: str
    plan_label: str
    mode: str
    mode_label: str
    show_dashboard: bool
    show_journal: bool
    show_details: bool
    joined_at: datetime | None = None
    shared_at: datetime | None = None
    views: int = 0
    trade_count: int = 0
    dashboard: DashboardOut | None = None
    trades: list[TradeOut] | None = None


# ── تنظیمات (کاربرِ واردشده) ────────────────────────────────────────────
@router.get("/me", response_model=ShareSettingsOut)
async def my_share(user: User = Depends(get_current_user)) -> ShareSettingsOut:
    return ShareSettingsOut(**share_svc.settings_payload(user))


@router.get("/slug/check", response_model=SlugCheckOut)
async def check_slug(
    slug: str = Query(""),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SlugCheckOut:
    share_svc.assert_can_share(user)
    return SlugCheckOut(**await share_svc.available(db, user, slug))


@router.put("/me", response_model=ShareSettingsOut)
async def update_share(
    payload: ShareUpdateIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ShareSettingsOut:
    # خاموش کردنِ لینک برای همه آزاد است؛ روشن کردن/تغییر فقط طلایی و الماسی.
    turning_off = payload.enabled is False and all(
        v is None
        for v in (payload.mode, payload.slug, payload.title, payload.bio, payload.anonymous)
    )
    if not turning_off:
        share_svc.assert_can_share(user)
    try:
        user = await share_svc.update_settings(
            db,
            user,
            enabled=payload.enabled,
            mode=payload.mode,
            slug=payload.slug,
            title=payload.title,
            bio=payload.bio,
            anonymous=payload.anonymous,
        )
    except share_svc.ShareError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ShareSettingsOut(**share_svc.settings_payload(user))


# ── خواندنِ عمومی ───────────────────────────────────────────────────────
# فیلدهایی که در حالتِ «بدون جزئیات» خالی می‌شوند (نتیجهٔ معامله می‌ماند،
# ولی تحلیل و یادداشت و تصویرِ شخصی بیرون نمی‌رود).
_HIDDEN = {
    "stop_loss": None,
    "analysis_tf": None,
    "trigger_tf": None,
    "emotions": None,
    "checklist_ticks": None,
    "entry_reasons": None,
    "exit_reasons": None,
    "entry_note": None,
    "exit_note": None,
    "general_note": None,
    "image_before": None,
    "image_after": None,
    "tags": None,
    "take_profits": [],
    "entry_levels": [],
}


def _strip(trade: TradeOut) -> TradeOut:
    return trade.model_copy(update=dict(_HIDDEN))


@public_router.get("/profile/{slug}", response_model=PublicProfileOut)
async def public_profile(
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> PublicProfileOut:
    owner = await share_svc.find_by_slug(db, slug)
    if owner is None:
        raise HTTPException(status_code=404, detail="این کارنامه پیدا نشد یا دیگر عمومی نیست.")

    mode = share_svc.normalize_mode(owner.share_mode)
    show_dashboard = share_svc.shows_dashboard(mode)
    show_journal = share_svc.shows_journal(mode)
    show_details = share_svc.shows_details(mode)

    trades = await crud.load_user_trades(db, owner.id)
    transactions = await crud.load_user_transactions(db, owner.id)

    dashboard = await build_user_dashboard(db, owner) if show_dashboard else None

    rows: list[TradeOut] | None = None
    if show_journal:
        ordered = sorted(trades, key=lambda t: t.number or 0, reverse=True)
        rows = [trade_to_out(owner, trades, t, transactions) for t in ordered]
        if not show_details:
            rows = [_strip(r) for r in rows]

    # شمارندهٔ بازدید (بهترین تلاش — هرگز نباید پاسخ را خراب کند).
    try:
        owner.share_views = int(getattr(owner, "share_views", 0) or 0) + 1
        await db.commit()
    except Exception:  # noqa: BLE001
        await db.rollback()

    plan = plans.effective_plan(owner)
    return PublicProfileOut(
        slug=owner.share_slug or share_svc.sanitize(slug),
        name=share_svc.display_name(owner),
        username=owner.username,
        title=owner.share_title,
        bio=owner.share_bio,
        plan=plan,
        plan_label=plans.PLAN_LABELS.get(plan, plan),
        mode=mode,
        mode_label=share_svc.mode_label(mode),
        show_dashboard=show_dashboard,
        show_journal=show_journal,
        show_details=show_details,
        joined_at=owner.created_at,
        shared_at=owner.share_created_at,
        views=int(getattr(owner, "share_views", 0) or 0),
        trade_count=len(trades),
        dashboard=dashboard,
        trades=rows,
    )
