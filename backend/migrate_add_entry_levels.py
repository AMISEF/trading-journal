#!/usr/bin/env python3
"""One-off migration: add + backfill the ``entry_levels`` column on trades.

Trades can now be entered in multiple levels (DCA / "پله"). The column stores a
JSON list of ``{"order", "price", "margin_percent"}`` items. ``entry_price`` and
``margin_percent`` continue to hold the derived single entry (quantity-weighted
average) and total margin, so the calc pipeline is unchanged.

This script:
  1. Adds the ``entry_levels`` column if missing.
  2. Backfills every existing trade with a single level mirroring its current
     ``entry_price`` / ``margin_percent`` so old trades render identically.

Run on the server with the backend virtualenv:
    cd /var/www/trading-journal/backend
    ./venv/bin/python migrate_add_entry_levels.py
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import engine, AsyncSessionLocal
from app.models.trade import Trade


async def main() -> None:
    # 1. Ensure the column exists.
    async with engine.begin() as conn:
        await conn.execute(
            text("ALTER TABLE trades ADD COLUMN IF NOT EXISTS entry_levels JSON")
        )
    print("✅ entry_levels column ensured on trades table.")

    # 2. Backfill any rows that don't have entry levels yet.
    session: AsyncSession
    async with AsyncSessionLocal() as session:
        trades = (await session.execute(select(Trade))).scalars().all()
        backfilled = 0
        for trade in trades:
            if not trade.entry_levels and trade.entry_price is not None:
                trade.entry_levels = [
                    {
                        "order": 1,
                        "price": trade.entry_price,
                        "margin_percent": trade.margin_percent,
                    }
                ]
                backfilled += 1
        await session.commit()
        print(f"✅ Backfilled entry_levels on {backfilled} trade(s).")


if __name__ == "__main__":
    asyncio.run(main())
