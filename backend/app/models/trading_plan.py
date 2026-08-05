"""جدول «تریدینگ پلن» کاربر.

The plan used to live only in the browser's localStorage, which meant the AI
coach could never see it. It is now mirrored server-side (one row per user) so
every coach run, single-trade review and institutional report can audit the
plan the trader actually wrote.

Shape of ``topics`` is exactly what the /trading-plan page stores:
``[{"id": "t1", "title": "قوانین ورود", "items": [{"id": "i1", "text": "…"}]}]``

The table is new, so ``Base.metadata.create_all`` creates it on the next boot;
no ALTER migration is needed.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TradingPlan(Base):
    __tablename__ = "trading_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    # لیست موضوعات و زیرموضوعات پلن.
    topics: Mapped[list | None] = mapped_column(JSON, default=list)
    # تعداد دفعات همگام‌سازی (فقط برای اشکال‌زدایی).
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )
