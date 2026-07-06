"""Migration: add phone (contact number) to users."""

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
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)")
        )
    await engine.dispose()
    print("Migration complete.")


if __name__ == "__main__":
    asyncio.run(main())
