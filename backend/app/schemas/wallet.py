"""Schemas for wallet transaction management."""

from __future__ import annotations

from datetime import datetime

from app.schemas.base import CamelModel


class WalletTransactionIn(CamelModel):
    amount: float
    note: str | None = None
    transaction_date: datetime | None = None


class WalletTransactionOut(CamelModel):
    id: int
    user_id: int
    amount: float
    note: str | None = None
    transaction_date: datetime
    created_at: datetime
