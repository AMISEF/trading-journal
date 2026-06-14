#!/usr/bin/env python3
"""One-off migration: add + backfill the ``balance_snapshot`` column on trades.

Margin is now derived from a fixed balance snapshot captured when a trade is
recorded, so it never changes as the wallet balance grows/shrinks. This script:

  1. Adds the ``balance_snapshot`` column if missing.
  2. Backfills it for every existing trade using the historical balance the
     trade's margin was based on (``balance_before_trade``), so old trades keep
     showing exactly the same margin/PnL they did before.

Run on the server with the backend virtualenv:
    cd /var/www/trading-journal/backend
    ./venv/bin/python migrate_add_balance_snapshot.py
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import engine, AsyncSessionLocal
from app.models.user import User
from app.api import crud
from app.services import balances


async def main() -> None:
    # 1. Ensure the column exists.
    async with engine.begin() as conn:
        await conn.execute(
            text("ALTER TABLE trades ADD COLUMN IF NOT EXISTS balance_snapshot DOUBLE PRECISION")
        )
    print("✅ balance_snapshot column ensured on trades table.")

    # 2. Backfill any rows that don't have a snapshot yet.
    session: AsyncSession
    async with AsyncSessionLocal() as session:
        users = (await session.execute(select(User))).scalars().all()
        backfilled = 0
        for user in users:
            trades = await crud.load_user_trades(session, user.id)
            transactions = await crud.load_user_transactions(session, user.id)
            for trade in trades:
                if trade.balance_snapshot is None:
                    trade.balance_snapshot = balances.balance_before_trade(
                        user, trades, trade, transactions
                    )
                    backfilled += 1
        await session.commit()
        print(f"✅ Backfilled balance_snapshot on {backfilled} trade(s).")


if __name__ == "__main__":
    asyncio.run(main())
