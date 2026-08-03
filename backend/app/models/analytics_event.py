"""رویدادهای تحلیلی برای اندازه‌گیری قیف محصول.

تنها چیزی که اینجا ذخیره می‌شود «بازدید صفحه» است؛ مراحل بعدی قیف
(ثبت‌نام، اولین معامله، خرید) از جدول‌های واقعی users و trades محاسبه
می‌شوند، پس آمار آن مراحل از روز اول کامل است.

هیچ دادهٔ شخصی ذخیره نمی‌شود: vid فقط یک رشتهٔ تصادفی است.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )
    # view | cta_click | signup_start | plan_view | install_prompt
    kind: Mapped[str] = mapped_column(String(30), default="view", index=True)
    # شناسهٔ تصادفیِ بازدیدکننده (برای شمارش کاربرِ یکتا).
    vid: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    path: Mapped[str | None] = mapped_column(String(200), nullable=True)
    referrer: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    campaign: Mapped[str | None] = mapped_column(String(60), nullable=True)
    device: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_bot: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
