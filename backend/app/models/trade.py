"""Database models for trades and their take-profit targets."""

from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Trade(Base):
    __tablename__ = "trades"
    # Each user numbers their own trades 1..n, so the pair must be unique.
    __table_args__ = (UniqueConstraint("user_id", "number", name="uq_user_number"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    number: Mapped[int] = mapped_column(Integer)

    # --- Core trade fields ---
    symbol: Mapped[str | None] = mapped_column(String(50), nullable=True)
    direction: Mapped[str] = mapped_column(String(10), default="LONG")  # LONG | SHORT
    status: Mapped[str] = mapped_column(String(10), default="PLANNED")  # PLANNED|OPEN|CLOSED

    entry_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    leverage: Mapped[float | None] = mapped_column(Float, nullable=True)
    margin_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    stop_loss: Mapped[float | None] = mapped_column(Float, nullable=True)

    analysis_tf: Mapped[str | None] = mapped_column(String(20), nullable=True)
    trigger_tf: Mapped[str | None] = mapped_column(String(20), nullable=True)

    is_risk_free_plan: Mapped[bool] = mapped_column(Boolean, default=False)

    open_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    close_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Exit handling
    exit_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    trail_exit_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    trail_is_percent: Mapped[bool] = mapped_column(Boolean, default=False)
    is_risk_free_mgmt: Mapped[bool] = mapped_column(Boolean, default=False)

    # Computed and persisted results
    realized_pnl: Mapped[float | None] = mapped_column(Float, nullable=True)
    rr_expected: Mapped[float | None] = mapped_column(Float, nullable=True)
    rr_achieved: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Flexible JSON fields
    emotions: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    checklist_ticks: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    entry_reasons: Mapped[list | None] = mapped_column(JSON, nullable=True)
    exit_reasons: Mapped[list | None] = mapped_column(JSON, nullable=True)
    tags: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Notes and images
    entry_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    exit_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    general_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_before: Mapped[str | None] = mapped_column(String(500), nullable=True)
    image_after: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    user: Mapped["User"] = relationship(back_populates="trades")  # noqa: F821
    take_profits: Mapped[list["TakeProfit"]] = relationship(
        back_populates="trade",
        cascade="all, delete-orphan",
        order_by="TakeProfit.order",
    )


class TakeProfit(Base):
    __tablename__ = "take_profits"

    id: Mapped[int] = mapped_column(primary_key=True)
    trade_id: Mapped[int] = mapped_column(ForeignKey("trades.id"), index=True)
    order: Mapped[int] = mapped_column(Integer, default=1)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    save_percent: Mapped[float] = mapped_column(Float, default=0.0)

    trade: Mapped["Trade"] = relationship(back_populates="take_profits")
