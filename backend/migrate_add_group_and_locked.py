"""Migration: add user_group / capital_reset_date to users, is_locked to trades."""

import asyncio
import os

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


async def main() -> None:
    url = os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/trading_journal",
    )
    engine = create_async_engine(url)
    async with engine.begin() as conn:
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS user_group VARCHAR(50)")
        )
        await conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS capital_reset_date"
                " TIMESTAMP WITH TIME ZONE"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE trades ADD COLUMN IF NOT EXISTS is_locked BOOLEAN"
                " NOT NULL DEFAULT FALSE"
            )
        )
    await engine.dispose()
    print("Migration complete.")


if __name__ == "__main__":
    asyncio.run(main())
