#!/usr/bin/env python3
"""One-off migration: add the ``exit_price`` column to the trades table.

The app creates tables with ``create_all`` on startup, which never ALTERs an
existing table. This script adds the new ``exit_price`` column if it's missing.

Run on the server with the backend virtualenv:
    cd /var/www/trading-journal/backend
    ./venv/bin/python migrate_add_exit_price.py
"""

from __future__ import annotations

import asyncio

from sqlalchemy import text

from app.db.session import engine


async def main() -> None:
    async with engine.begin() as conn:
        # Postgres supports IF NOT EXISTS, so this is safe to run repeatedly.
        await conn.execute(
            text("ALTER TABLE trades ADD COLUMN IF NOT EXISTS exit_price DOUBLE PRECISION")
        )
    print("✅ exit_price column ensured on trades table.")


if __name__ == "__main__":
    asyncio.run(main())
