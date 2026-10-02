from __future__ import annotations

import asyncio

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

import app.models  # noqa: F401 - registers all tables on the metadata
from app.core.config import get_settings
from app.db.base import Base, EncryptedJSON, EncryptedString

target_metadata = Base.metadata

def include_object(obj, name, type_, reflected, compare_to):
    # PostGIS (and the image's tiger geocoder) ship their own tables: only manage tables we define.
    if type_ == "table" and reflected and compare_to is None:
        return False
    return True


def render_item(type_, obj, autogen_context):
    # Encrypted columns are plain bytea in the database; encryption happens in the application.
    if type_ == "type" and isinstance(obj, (EncryptedString, EncryptedJSON)):
        return "sa.LargeBinary()"
    return False


def _run(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=include_object,
        render_item=render_item,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async() -> None:
    engine = create_async_engine(get_settings().database_url.get_secret_value())
    async with engine.connect() as conn:
        await conn.run_sync(_run)
    await engine.dispose()


asyncio.run(run_async())
