from __future__ import annotations

import logging

from app.core.config import get_settings
from app.core.errors import ProblemError

log = logging.getLogger("hungerly.sms")


async def send_otp(phone_e164: str, code: str) -> None:
    settings = get_settings()
    if settings.env in ("development", "test"):
        # Development only: the code is printed locally so the flow can be tested without SMS.
        log.warning("DEV OTP for %s: %s", phone_e164[-4:].rjust(len(phone_e164), "*"), code)
        return
    # Production SMS provider (MSG91, DLT-registered template) is configured in Phase 2.
    raise ProblemError(503, "auth.sms_unavailable", headers={"Retry-After": "30"})
