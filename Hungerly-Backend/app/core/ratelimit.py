"""Sliding-window rate limiting in Redis.

A Lua script keeps a sorted set of request timestamps per key, so the check-and-increment is
atomic across API instances. Auth routes fail *closed* when Redis is down; others fail open.
"""

from __future__ import annotations

import logging
import math
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from fastapi import Request
from redis.exceptions import RedisError

from app.core.errors import ProblemError
from app.core.redis import get_redis

log = logging.getLogger("hungerly.ratelimit")

_SLIDING_WINDOW = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, count, tonumber(oldest[2])}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, count + 1, 0}
"""


@dataclass(frozen=True, slots=True)
class LimitResult:
    allowed: bool
    limit: int
    remaining: int
    retry_after: int


async def hit(key: str, *, limit: int, window_seconds: int) -> LimitResult:
    redis = get_redis()
    now_ms = int(time.time() * 1000)
    window_ms = window_seconds * 1000
    allowed, count, oldest = await redis.eval(
        _SLIDING_WINDOW, 1, f"rl:{key}", now_ms, window_ms, limit, f"{now_ms}-{uuid.uuid4().hex[:8]}"
    )
    retry_after = 0
    if not allowed:
        retry_after = max(1, math.ceil((int(oldest) + window_ms - now_ms) / 1000))
    return LimitResult(bool(allowed), limit, max(0, limit - int(count)), retry_after)


def _raise_limited(result: LimitResult, code: str) -> None:
    raise ProblemError(
        429,
        code,
        "Too many requests. Please wait and try again.",
        headers={
            "Retry-After": str(result.retry_after),
            "RateLimit-Limit": str(result.limit),
            "RateLimit-Remaining": "0",
            "RateLimit-Reset": str(result.retry_after),
        },
    )


async def enforce(
    key: str, *, limit: int, window_seconds: int, code: str = "rate_limited", fail_closed: bool = False
) -> None:
    try:
        result = await hit(key, limit=limit, window_seconds=window_seconds)
    except RedisError:
        log.error("rate limiter unavailable", extra={"key_scope": key.split(":", 1)[0]})
        if fail_closed:
            raise ProblemError(503, "service.unavailable", headers={"Retry-After": "5"}) from None
        return
    if not result.allowed:
        _raise_limited(result, code)


def client_ip(request: Request) -> str:
    return getattr(request.state, "client_ip", None) or (request.client.host if request.client else "unknown")


def limit_by_ip(
    scope: str, *, limit: int, window_seconds: int, fail_closed: bool = False
) -> Callable[[Request], Awaitable[None]]:
    """FastAPI dependency: limit a route per client IP."""

    async def dependency(request: Request) -> None:
        await enforce(
            f"{scope}:ip:{client_ip(request)}", limit=limit, window_seconds=window_seconds, fail_closed=fail_closed
        )

    return dependency
