"""Frozen snapshot of the site demo account.

The «ایجاد دمو» button shows a fixed sample journal + dashboard. It must NOT
track the live account (which changes as the trader trades or gets a monthly
capital reset), so when an admin sets a user as the demo we copy their current
dashboard/trades/checklists into this singleton (id=1) and serve that forever.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DemoSnapshot(Base):
    __tablename__ = "demo_snapshot"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # singleton: always 1
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Pre-serialized (camelCase, JSON-mode) payloads exactly as the API returns them.
    dashboard: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    trades: Mapped[list | None] = mapped_column(JSON, nullable=True)
    checklists: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
