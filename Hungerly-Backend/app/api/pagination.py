from __future__ import annotations

import json
import uuid
from datetime import datetime

from app.core import crypto
from app.core.errors import ProblemError


def encode_cursor(created_at: datetime, row_id: uuid.UUID) -> str:
    return crypto.sign_cursor(json.dumps([created_at.isoformat(), str(row_id)]).encode())


def decode_cursor(cursor: str | None) -> tuple[datetime, uuid.UUID] | None:
    """Cursors are HMAC-signed so clients cannot forge arbitrary positions."""
    if cursor is None:
        return None
    payload = crypto.verify_cursor(cursor)
    if payload is None:
        raise ProblemError(400, "pagination.cursor_invalid")
    try:
        ts, rid = json.loads(payload)
        return datetime.fromisoformat(ts), uuid.UUID(rid)
    except (ValueError, TypeError):
        raise ProblemError(400, "pagination.cursor_invalid") from None
