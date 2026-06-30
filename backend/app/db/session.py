"""Database engine and session setup (async SQLAlchemy)."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

# The engine manages the actual connection pool to PostgreSQL.
engine = create_async_engine(settings.DATABASE_URL, echo=False, future=True)

# A factory that hands out new database sessions (one per request).
AsyncSessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that provides a database session per request and
    always closes it afterwards."""
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    """Create all tables and apply incremental column migrations on startup.

    Uses create_all for new tables, then ALTER TABLE … ADD COLUMN IF NOT EXISTS
    for columns added after the initial schema was deployed.
    """
    from sqlalchemy import text

    # Import models so they register with Base.metadata.
    from app.models import user, trade, template, wallet_transaction  # noqa: F401
    from app.db.base import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Incremental column migrations (safe to re-run — IF NOT EXISTS guard).
        migrations = [
            "ALTER TABLE trades ADD COLUMN IF NOT EXISTS trade_number INTEGER",
            "ALTER TABLE trades ADD COLUMN IF NOT EXISTS entry_levels JSONB",
            "ALTER TABLE trades ADD COLUMN IF NOT EXISTS balance_snapshot FLOAT",
            "ALTER TABLE trades ADD COLUMN IF NOT EXISTS exit_price FLOAT",
            "ALTER TABLE trades ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS user_group VARCHAR(50)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS capital_reset_date TIMESTAMP WITH TIME ZONE",
            "ALTER TABLE trades ADD COLUMN IF NOT EXISTS ai_analysis TEXT",
            "ALTER TABLE trades ADD COLUMN IF NOT EXISTS ai_analysis_at TIMESTAMP WITH TIME ZONE",
            "ALTER TABLE trades ADD COLUMN IF NOT EXISTS ai_analysis_status VARCHAR(20)",
            "ALTER TABLE trades ADD COLUMN IF NOT EXISTS ai_analysis_error TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_overall TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_overall_at TIMESTAMP WITH TIME ZONE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_overall_status VARCHAR(20)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_overall_error TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_report TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_report_at TIMESTAMP WITH TIME ZONE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_report_status VARCHAR(20)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_report_error TEXT",
        ]
        for stmt in migrations:
            await conn.execute(text(stmt))
