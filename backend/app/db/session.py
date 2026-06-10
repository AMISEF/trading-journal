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
    """Create all tables if they don't exist yet.

    Phase 1 keeps things simple: instead of running Alembic migrations, we just
    create the tables on startup. Importing the models here ensures they are
    registered on Base.metadata before create_all runs.
    """
    # Import models so they register with Base.metadata.
    from app.models import user, trade, template, wallet_transaction  # noqa: F401
    from app.db.base import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
