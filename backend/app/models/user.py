"""Database model for application users."""

from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))

    # Contact phone — Iranian mobile in the form 09xxxxxxxxx. Required at
    # registration; nullable so pre-existing rows remain valid.
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Role is either "TRADER" or "ADMIN". First user ever becomes ADMIN.
    role: Mapped[str] = mapped_column(String(20), default="TRADER")

    # Starting wallet/margin balance the user enters manually.
    wallet_margin: Mapped[float] = mapped_column(Float, default=1000.0)

    # Optional group membership (e.g. "CRYPTOSMART_TEAM").
    user_group: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Date when capital was last reset (for group members). Trades before this
    # date are locked and don't affect the running balance.
    capital_reset_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Cached AI coach "overall" report (Markdown) across the whole journal.
    ai_overall: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_overall_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Background-job state: None | "PENDING" | "DONE" | "ERROR".
    ai_overall_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ai_overall_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Cached institutional due-diligence report (Markdown) + its job state.
    ai_report: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_report_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ai_report_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ai_report_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Follow-up chat threads: list of {role, content, at}.
    ai_overall_chat: Mapped[list | None] = mapped_column(JSON, nullable=True)
    ai_report_chat: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Toobit exchange API key, encrypted at rest (see app.core.crypto). The
    # plaintext never leaves the server; the API only exposes whether a key is
    # set and a masked preview. Used later to talk to Toobit on the user's behalf.
    toobit_api_key_enc: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Subscription
    subscription_tier: Mapped[str] = mapped_column(String(20), default="bronze")
    subscription_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # All trades belonging to this user.
    trades: Mapped[list["Trade"]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan"
    )

    # Deposit / withdrawal history.
    wallet_transactions: Mapped[list["WalletTransaction"]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan",
    )
