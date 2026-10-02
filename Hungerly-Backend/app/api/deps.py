"""Authentication and authorization dependencies.

Every router declares its policy through one of these dependencies. Access is denied by default:
a route without a principal dependency must be explicitly marked public (see tests/test_policies.py).
"""

from __future__ import annotations

import ipaddress
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Request
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import ratelimit
from app.core.config import get_settings
from app.core.errors import ProblemError
from app.core.redis import get_redis
from app.core.tokens import InvalidToken, decode_access_token
from app.db.session import get_db
from app.models import AuditLog, AuthSession, DeliveryPartner

DB = Annotated[AsyncSession, Depends(get_db)]

PUBLIC = "public"  # marker attribute for routes intentionally without authentication


def revoked_sid_key(sid: uuid.UUID | str) -> str:
    return f"revoked_sid:{sid}"


@dataclass(frozen=True, slots=True)
class Principal:
    user_id: uuid.UUID
    session_id: uuid.UUID
    client_app: str
    roles: tuple[str, ...]
    admin_role: str | None
    ip: str
    user_agent: str | None
    request_id: str | None

    def has_role(self, role: str) -> bool:
        return role in self.roles


async def _session_revoked(db: AsyncSession, sid: uuid.UUID) -> bool:
    try:
        if await get_redis().exists(revoked_sid_key(sid)):
            return True
    except RedisError:
        pass
    # The database is authoritative; Redis only short-circuits recent revocations.
    row = (await db.execute(select(AuthSession.revoked_at).where(AuthSession.id == sid))).first()
    return row is None or row[0] is not None


def _principal_dependency(audiences: tuple[str, ...]) -> Callable[..., Awaitable[Principal]]:
    async def dependency(request: Request, db: DB) -> Principal:
        header = request.headers.get("authorization", "")
        scheme, _, token = header.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise ProblemError(401, "auth.token_missing", headers={"WWW-Authenticate": "Bearer"})
        try:
            claims = decode_access_token(token, expected_audience=list(audiences))
        except InvalidToken as exc:
            raise ProblemError(401, exc.code, headers={"WWW-Authenticate": "Bearer"}) from None
        if await _session_revoked(db, claims.sid):
            raise ProblemError(401, "auth.session_revoked", headers={"WWW-Authenticate": "Bearer"})
        await ratelimit.enforce(
            f"user:{claims.sub}", limit=get_settings().user_rate_limit_per_minute, window_seconds=60
        )
        principal = Principal(
            user_id=claims.sub,
            session_id=claims.sid,
            client_app=claims.aud,
            roles=claims.roles,
            admin_role=claims.admin_role,
            ip=ratelimit.client_ip(request),
            user_agent=request.headers.get("user-agent"),
            request_id=getattr(request.state, "request_id", None),
        )
        request.state.principal = principal
        return principal

    return dependency


any_user = _principal_dependency(("customer", "delivery", "admin", "restaurant"))
_customer_app = _principal_dependency(("customer",))
_delivery_app = _principal_dependency(("delivery",))
_admin_app = _principal_dependency(("admin",))


async def customer(p: Annotated[Principal, Depends(_customer_app)]) -> Principal:
    if not p.has_role("customer"):
        raise ProblemError(403, "auth.forbidden")
    return p


async def delivery_user(p: Annotated[Principal, Depends(_delivery_app)]) -> Principal:
    if not p.has_role("delivery_partner"):
        raise ProblemError(403, "auth.forbidden")
    return p


@dataclass(frozen=True, slots=True)
class RiderContext:
    principal: Principal
    partner: DeliveryPartner


async def get_partner(db: DB, p: Annotated[Principal, Depends(delivery_user)]) -> RiderContext:
    partner = (
        await db.execute(select(DeliveryPartner).where(DeliveryPartner.user_id == p.user_id))
    ).scalar_one_or_none()
    if partner is None:
        raise ProblemError(403, "delivery.not_registered")
    return RiderContext(p, partner)


async def active_rider(ctx: Annotated[RiderContext, Depends(get_partner)]) -> RiderContext:
    if ctx.partner.status != "active":
        raise ProblemError(403, "delivery.not_active", "Your account is not active yet.")
    return ctx


def admin(*allowed: str) -> Callable[..., Awaitable[Principal]]:
    """Admin with one of the given sub-roles. `super_admin` is always allowed."""
    allowed_set = set(allowed) | {"super_admin"}

    async def dependency(p: Annotated[Principal, Depends(_admin_app)]) -> Principal:
        if not p.has_role("admin") or p.admin_role not in allowed_set:
            raise ProblemError(403, "auth.forbidden")
        return p

    dependency.__name__ = f"admin_{'_'.join(sorted(allowed_set))}"
    return dependency


CustomerP = Annotated[Principal, Depends(customer)]
AnyP = Annotated[Principal, Depends(any_user)]
Rider = Annotated[RiderContext, Depends(active_rider)]
RiderAnyStatus = Annotated[RiderContext, Depends(get_partner)]


def audit(
    db: AsyncSession,
    actor: Principal | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None,
    changes: dict[str, Any] | None = None,
    *,
    ip: str | None = None,
    user_agent: str | None = None,
    request_id: str | None = None,
) -> None:
    """Add an audit entry to the current transaction (committed atomically with the action)."""
    if actor is not None:
        ip, user_agent, request_id = actor.ip, actor.user_agent, actor.request_id
    db.add(
        AuditLog(
            actor_user_id=actor.user_id if actor else None,
            actor_role=(actor.admin_role or (actor.roles[0] if actor.roles else None)) if actor else None,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            changes=changes,
            ip_address=_valid_ip(ip),
            user_agent=(user_agent or "")[:512] or None,
            request_id=request_id,
        )
    )


def _valid_ip(ip: str | None) -> str | None:
    try:
        return str(ipaddress.ip_address(ip)) if ip else None
    except ValueError:
        return None
