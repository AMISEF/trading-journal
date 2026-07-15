"""Singleton row caching the *combined* Cryptosmart Team AI analyses.

There is only ever one row (id = 1). It holds the team-wide overall coach
analysis and the institutional report, generated on demand by an admin from the
public landing showcase and then shown read-only to visitors.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TeamAI(Base):
    __tablename__ = "team_ai"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # always 1

    # Combined "overall" coach analysis + its background-job state.
    overall: Mapped[str | None] = mapped_column(Text, nullable=True)
    overall_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    overall_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    overall_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Combined institutional report + its background-job state.
    report: Mapped[str | None] = mapped_column(Text, nullable=True)
    report_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    report_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    report_error: Mapped[str | None] = mapped_column(Text, nullable=True)
