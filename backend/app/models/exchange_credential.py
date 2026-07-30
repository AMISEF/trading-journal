"""Per-user API credentials for the multi-exchange sync.

Toobit keeps living on the legacy ``users.toobit_*`` columns; every other
exchange (LBank / XT / Ourbit / WEEX) stores one row per (user, exchange)
here.  Secrets are Fernet-encrypted via ``app.core.crypto``.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ExchangeCredential(Base):
    __tablename__ = "exchange_credentials"
    __table_args__ = (
        UniqueConstraint("user_id", "exchange", name="uq_exchange_credential_user_ex"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    #: registry slug: lbank | xt | ourbit | weex
    exchange: Mapped[str] = mapped_column(String(20), index=True, nullable=False)

    api_key_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    secret_key_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    passphrase_enc: Mapped[str | None] = mapped_column(Text, nullable=True)

    key_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<ExchangeCredential user={self.user_id} exchange={self.exchange}>"
