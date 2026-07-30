from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings


settings = get_settings()
engine = (
    create_async_engine(settings.async_database_url, pool_pre_ping=True)
    if settings.async_database_url
    else None
)
AsyncSessionLocal = (
    async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    if engine is not None
    else None
)


async def get_db_session() -> AsyncIterator[AsyncSession | None]:
    if AsyncSessionLocal is None:
        yield None
        return

    async with AsyncSessionLocal() as session:
        yield session
