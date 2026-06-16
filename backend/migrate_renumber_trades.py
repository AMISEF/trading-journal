#!/usr/bin/env python3
"""One-off migration: close gaps in per-user trade numbering.

If a trade was deleted before the renumbering-on-delete logic was in
place, the remaining trades will have a gap (e.g. 1,2,3,5,6 — no 4).
This script reassigns numbers 1..N consecutively in order of the current
number so the sequence is gapless.

Safe to run multiple times (idempotent).

Run on the server:
    cd /var/www/trading-journal/backend
    ./venv/bin/python migrate_renumber_trades.py
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select, text

from app.db.session import engine, AsyncSessionLocal
from app.models.trade import Trade
from app.models.user import User


async def main() -> None:
    async with AsyncSessionLocal() as session:
        users = (await session.execute(select(User))).scalars().all()
        total_renumbered = 0

        for user in users:
            trades = (
                await session.execute(
                    select(Trade)
                    .where(Trade.user_id == user.id)
                    .order_by(Trade.number)
                )
            ).scalars().all()

            # Find all gaps (expected sequence is 1..len(trades)).
            expected = list(range(1, len(trades) + 1))
            actual   = [t.number for t in trades]

            if actual == expected:
                continue  # already gapless

            # To avoid hitting the unique constraint mid-update, first shift all
            # numbers to a safe temporary range (offset by a large number), then
            # assign the final 1..N values.
            offset = 1_000_000
            for trade in trades:
                trade.number = trade.number + offset
            await session.flush()

            for i, trade in enumerate(trades, start=1):
                trade.number = i
                total_renumbered += 1
            await session.flush()

        await session.commit()
        print(f"✅ Renumbered {total_renumbered} trade(s) to close gaps.")


if __name__ == "__main__":
    asyncio.run(main())
