from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, LargeBinary, MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator
from uuid6 import uuid7

from app.core import crypto

NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)


def new_id() -> uuid.UUID:
    return uuid.UUID(bytes=uuid7().bytes)


class UUIDPk:
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=new_id)


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class EncryptedString(TypeDecorator[str]):
    """Text stored as AES-256-GCM ciphertext. `context` (usually `table.column`) is bound as
    associated data, so ciphertext moved to another column will not decrypt."""

    impl = LargeBinary
    cache_ok = True

    def __init__(self, context: str):
        super().__init__()
        self.context = context

    def process_bind_param(self, value: str | None, dialect: Any) -> bytes | None:
        return None if value is None else crypto.encrypt_str(value, context=self.context)

    def process_result_value(self, value: bytes | None, dialect: Any) -> str | None:
        return None if value is None else crypto.decrypt_str(bytes(value), context=self.context)


class EncryptedJSON(TypeDecorator[dict]):
    impl = LargeBinary
    cache_ok = True

    def __init__(self, context: str):
        super().__init__()
        self.context = context

    def process_bind_param(self, value: dict | None, dialect: Any) -> bytes | None:
        if value is None:
            return None
        return crypto.encrypt(json.dumps(value, separators=(",", ":")).encode(), context=self.context)

    def process_result_value(self, value: bytes | None, dialect: Any) -> dict | None:
        return None if value is None else json.loads(crypto.decrypt(bytes(value), context=self.context))
