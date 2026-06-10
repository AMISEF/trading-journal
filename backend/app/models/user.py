"""Database model for application users."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, String
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

    # Role is either "TRADER" or "ADMIN". First user ever becomes ADMIN.
    role: Mapped[str] = mapped_column(String(20), default="TRADER")

    # Starting wallet/margin balance the user enters manually.
    wallet_margin: Mapped[float] = mapped_column(Float, default=1000.0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # All trades belonging to this user.
    trades: Mapped[list["Trade"]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan"
    )

    # Deposit / withdrawal history.
    wallet_transactions: Mapped[list["WalletTransaction"]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan",
    )
