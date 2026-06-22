#!/usr/bin/env python3
"""One-off migration: add the ``trade_number`` column to trades.

This is a nullable INTEGER column that lets traders manually record their own
reference number for a trade (e.g. an exchange position ID or a personal
sequence number that survives deletions/renumbering).

Run on the server with the backend virtualenv:
    cd /var/www/trading-journal/backend
    ./venv/bin/python migrate_add_trade_number.py
"""

from __future__ import annotations

import asyncio

from sqlalchemy import text

from app.db.session import engine


async def main() -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text("ALTER TABLE trades ADD COLUMN IF NOT EXISTS trade_number INTEGER")
        )
    print("✅ trade_number column ensured on trades table.")


if __name__ == "__main__":
    asyncio.run(main())
