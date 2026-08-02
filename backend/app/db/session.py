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
    from app.models import (  # noqa: F401
        auth_code,
        demo_snapshot,
        exchange_credential,
        team_ai,
        template,
        trade,
        user,
        wallet_transaction,
    )
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
            "ALTER TABLE trades ADD COLUMN IF NOT EXISTS ai_chat JSONB",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_overall_chat JSONB",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_report_chat JSONB",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) NOT NULL DEFAULT 'bronze'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS toobit_api_key_enc TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS toobit_secret_key_enc TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS toobit_key_at TIMESTAMP WITH TIME ZONE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS toobit_synced_at TIMESTAMP WITH TIME ZONE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS toobit_sync_error TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE",
            # دعوت دوستان (referral program). The counters are denormalised so the
            # plan gates can read them without an extra query.
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(16)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_id INTEGER",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_total INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_qualified INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_rewards JSONB",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_overall_runs INTEGER NOT NULL DEFAULT 0",
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_referral_code "
            "ON users (referral_code) WHERE referral_code IS NOT NULL",
            "CREATE INDEX IF NOT EXISTS ix_users_referred_by_id ON users (referred_by_id)",
            # Accounts that ran the coach before ai_overall_runs existed keep
            # their single use (otherwise the free quota would reset for them).
            "UPDATE users SET ai_overall_runs = 1 "
            "WHERE ai_overall_runs = 0 AND (ai_overall IS NOT NULL OR ai_overall_at IS NOT NULL)",
            "ALTER TABLE trades ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual'",
            "ALTER TABLE trades ADD COLUMN IF NOT EXISTS toobit_position_id VARCHAR(80)",
            "ALTER TABLE trades ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE",
            # One journal row per Toobit position (per user); repeated syncs update
            # it instead of inserting duplicates. Partial index so manual trades
            # (NULL position id) are unaffected.
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_user_toobit_position "
            "ON trades (user_id, toobit_position_id) WHERE toobit_position_id IS NOT NULL",
            # Multi-exchange credentials (LBank / XT / Ourbit / WEEX). create_all
            # builds the table; these guards cover installs where an older,
            # narrower version of the table already exists.
            "ALTER TABLE exchange_credentials ADD COLUMN IF NOT EXISTS passphrase_enc TEXT",
            "ALTER TABLE exchange_credentials ADD COLUMN IF NOT EXISTS key_at TIMESTAMP WITH TIME ZONE",
            "ALTER TABLE exchange_credentials ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE",
            "ALTER TABLE exchange_credentials ADD COLUMN IF NOT EXISTS sync_error TEXT",
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_exchange_credential_user_ex "
            "ON exchange_credentials (user_id, exchange)",
            # Dates are stamped automatically now, but rows written before that
            # have an empty open_date, so they show "—" in the list and never
            # reach a calendar cell. Adopt the row's creation time (the moment
            # the user actually recorded the journal entry). The WHERE clause
            # makes this a no-op on every later startup.
            "UPDATE trades SET open_date = created_at WHERE open_date IS NULL",
            "UPDATE trades SET close_date = COALESCE(updated_at, created_at) "
            "WHERE close_date IS NULL AND status = 'CLOSED'",
        ]
        for stmt in migrations:
            await conn.execute(text(stmt))

        # Recover orphaned AI jobs. Analyses run as fire-and-forget in-process
        # background tasks, so any row still marked PENDING at startup belongs to
        # a job that died when the previous process stopped (restart/crash/OOM)
        # and will never finish. Left as-is it sticks the UI on "analysing…"
        # forever. Flip these to ERROR so the user can simply retry.
        _stale = (
            "تحلیل قبلی به‌دلیل راه‌اندازی مجددِ سرور ناتمام ماند. لطفاً دوباره تلاش کنید."
        )
        recovery = [
            ("UPDATE users SET ai_overall_status='ERROR', ai_overall_error=:m "
             "WHERE ai_overall_status='PENDING'"),
            ("UPDATE users SET ai_report_status='ERROR', ai_report_error=:m "
             "WHERE ai_report_status='PENDING'"),
            ("UPDATE trades SET ai_analysis_status='ERROR', ai_analysis_error=:m "
             "WHERE ai_analysis_status='PENDING'"),
            ("UPDATE team_ai SET overall_status='ERROR', overall_error=:m "
             "WHERE overall_status='PENDING'"),
            ("UPDATE team_ai SET report_status='ERROR', report_error=:m "
             "WHERE report_status='PENDING'"),
        ]
        for stmt in recovery:
            await conn.execute(text(stmt), {"m": _stale})
