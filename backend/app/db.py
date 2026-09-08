from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()

_is_sqlite = settings.database_url.startswith("sqlite")
_is_memory = ":memory:" in settings.database_url

engine = create_async_engine(
    settings.database_url,
    echo=False,
    # Pipeline workers write step progress while requests are served. SQLite
    # permits a single writer, so give contenders time to acquire the lock
    # instead of failing immediately with "database is locked".
    connect_args={"timeout": 30} if _is_sqlite else {},
)

if _is_sqlite and not _is_memory:

    @event.listens_for(engine.sync_engine, "connect")
    def _apply_sqlite_pragmas(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        # WAL lets readers proceed during a write, which is what makes
        # concurrent run polling viable on SQLite.
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    """Create tables for local development and tests.

    Production schema is owned by Alembic (``alembic upgrade head``); creating
    tables from metadata there would silently diverge from the migration history.
    """
    # Import models so metadata is registered.
    from app import models  # noqa: F401

    if settings.is_production:
        return

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
