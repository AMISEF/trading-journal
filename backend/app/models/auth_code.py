"""One-time email verification codes (password reset / change)."""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AuthCode(Base):
    __tablename__ = "auth_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Lower-cased email the code was sent to.
    email: Mapped[str] = mapped_column(String(255), index=True)
    # SHA-256 of the 6-digit code (never stored in the clear).
    code_hash: Mapped[str] = mapped_column(String(64))
    # What the code is for (e.g. "reset").
    purpose: Mapped[str] = mapped_column(String(20), default="reset")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
