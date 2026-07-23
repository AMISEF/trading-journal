"""Wallet transaction CRUD: deposit / withdrawal history per user."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import crud
from app.api.serializers import user_to_out
from app.core.deps import get_current_user, get_db
from app.models.trade import Trade
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction
from app.schemas.base import CamelModel
from app.schemas.user import UserOut
from app.schemas.wallet import WalletTransactionIn, WalletTransactionOut

router = APIRouter(prefix="/api/wallet", tags=["wallet"])


class ResetCapitalIn(CamelModel):
    """Reset the account's capital to a chosen amount (default $1000), like a
    fresh registration: existing trades are locked and wallet history cleared."""
    amount: float = 1000.0


@router.get("/transactions", response_model=list[WalletTransactionOut])
async def list_transactions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[WalletTransaction]:
    result = await db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.user_id == user.id)
        .order_by(WalletTransaction.transaction_date)
    )
    return list(result.scalars().all())


@router.post("/transactions", response_model=WalletTransactionOut, status_code=201)
async def create_transaction(
    body: WalletTransactionIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WalletTransaction:
    tx = WalletTransaction(
        user_id=user.id,
        amount=body.amount,
        note=body.note,
        transaction_date=body.transaction_date or datetime.now(timezone.utc),
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)
    return tx


@router.patch("/transactions/{tx_id}", response_model=WalletTransactionOut)
async def update_transaction(
    tx_id: int,
    body: WalletTransactionIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WalletTransaction:
    result = await db.execute(
        select(WalletTransaction).where(
            WalletTransaction.id == tx_id,
            WalletTransaction.user_id == user.id,
        )
    )
    tx = result.scalars().first()
    if not tx:
        raise HTTPException(404, "Transaction not found")
    tx.amount = body.amount
    tx.note = body.note
    if body.transaction_date:
        tx.transaction_date = body.transaction_date
    await db.commit()
    await db.refresh(tx)
    return tx


@router.delete("/transactions/{tx_id}", status_code=204, response_model=None)
async def delete_transaction(
    tx_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(WalletTransaction).where(
            WalletTransaction.id == tx_id,
            WalletTransaction.user_id == user.id,
        )
    )
    tx = result.scalars().first()
    if not tx:
        raise HTTPException(404, "Transaction not found")
    await db.delete(tx)
    await db.commit()


@router.post("/reset-capital", response_model=UserOut)
async def reset_capital(
    body: ResetCapitalIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """Start a new capital cycle: set capital to a chosen amount (default $1000)
    and stamp the reset date, so previous trades no longer affect the new cycle's
    balance/stats. Trades stay editable (no locking); wallet history is cleared so
    the balance is exactly the chosen amount.
    """
    amount = body.amount if (body.amount and body.amount > 0) else 1000.0

    user.wallet_margin = float(amount)
    user.capital_reset_date = datetime.now(timezone.utc)

    # No locking — clear any leftover locks so all trades stay editable.
    await db.execute(
        update(Trade).where(Trade.user_id == user.id).values(is_locked=False)
    )
    await db.execute(
        delete(WalletTransaction).where(WalletTransaction.user_id == user.id)
    )
    await db.commit()
    await db.refresh(user)

    trades = await crud.load_user_trades(db, user.id)
    transactions = await crud.load_user_transactions(db, user.id)
    return user_to_out(user, trades, transactions)
