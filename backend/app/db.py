from collections.abc import AsyncGenerator

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
engine = create_async_engine(settings.database_url, echo=False)
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
