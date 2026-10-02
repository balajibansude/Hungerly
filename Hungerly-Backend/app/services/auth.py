from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import pyotp
from redis.exceptions import RedisError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, audit, revoked_sid_key
from app.core import crypto, ratelimit
from app.core.config import get_settings
from app.core.errors import ProblemError
from app.core.redis import get_redis
from app.core.tokens import issue_access_token
from app.models import AuthSession, CustomerProfile, DeliveryPartner, User, UserRole
from app.services import sms

PHONE_PURPOSE = "phone"
MOBILE_APPS = ("customer", "delivery")


@dataclass(slots=True)
class IssuedSession:
    access_token: str
    refresh_token: str
    session: AuthSession
    user: User
    is_new_user: bool = False


@dataclass(slots=True)
class RequestMeta:
    ip: str
    user_agent: str | None
    request_id: str | None


def phone_bidx(phone_e164: str) -> bytes:
    return crypto.blind_index(phone_e164, purpose=PHONE_PURPOSE)


def _now() -> datetime:
    return datetime.now(UTC)


async def _redis_or_503():
    redis = get_redis()
    try:
        await redis.ping()
    except RedisError:
        raise ProblemError(503, "service.unavailable", headers={"Retry-After": "5"}) from None
    return redis


# --- OTP (customers and delivery partners) --------------------------------------------


async def request_otp(phone: str, client_app: str, device_id: str, meta: RequestMeta) -> dict:
    settings = get_settings()
    redis = await _redis_or_503()
    bidx = phone_bidx(phone).hex()

    # Auth flows fail closed: if the limiter cannot run, no OTP is sent.
    for key, limit, window in (
        (f"otp:phone10m:{bidx}", 3, 600),
        (f"otp:phone1d:{bidx}", 10, 86400),
        (f"otp:ip:{meta.ip}", 10, 600),
        (f"otp:device:{device_id}", 5, 600),
    ):
        await ratelimit.enforce(key, limit=limit, window_seconds=window, code="auth.otp_rate_limited", fail_closed=True)

    if not await redis.set(f"otp:cooldown:{bidx}", "1", nx=True, ex=settings.otp_resend_cooldown_seconds):
        ttl = max(1, await redis.ttl(f"otp:cooldown:{bidx}"))
        raise ProblemError(429, "auth.otp_rate_limited", headers={"Retry-After": str(ttl)})

    request_id = str(uuid.uuid4())
    code = settings.otp_dev_fixed_code or crypto.random_digits(6)
    await redis.hset(
        f"otp:req:{request_id}",
        mapping={"bidx": bidx, "digest": crypto.otp_digest(request_id, code), "app": client_app, "attempts": 0},
    )
    await redis.expire(f"otp:req:{request_id}", settings.otp_ttl_seconds)
    await sms.send_otp(phone, code)
    # Same response whether or not the number has an account (no enumeration).
    return {
        "otp_request_id": request_id,
        "expires_in": settings.otp_ttl_seconds,
        "resend_after": settings.otp_resend_cooldown_seconds,
    }


async def verify_otp(
    db: AsyncSession,
    *,
    otp_request_id: str,
    phone: str,
    otp: str,
    client_app: str,
    device_id: str,
    device_name: str | None,
    meta: RequestMeta,
) -> IssuedSession:
    settings = get_settings()
    redis = await _redis_or_503()
    await ratelimit.enforce(f"otpv:ip:{meta.ip}", limit=30, window_seconds=600, code="auth.otp_rate_limited", fail_closed=True)

    key = f"otp:req:{otp_request_id}"
    record = await redis.hgetall(key)
    if not record:
        raise ProblemError(410, "auth.otp_expired", "This code has expired. Request a new one.")
    attempts = await redis.hincrby(key, "attempts", 1)
    if attempts > settings.otp_max_attempts:
        await redis.delete(key)
        raise ProblemError(429, "auth.otp_attempts_exceeded", "Too many attempts. Request a new code.")

    bidx = phone_bidx(phone)
    ok = (
        crypto.constant_time_equals(record["bidx"], bidx.hex())
        and record["app"] == client_app
        and crypto.constant_time_equals(record["digest"], crypto.otp_digest(otp_request_id, otp))
    )
    if not ok:
        raise ProblemError(400, "auth.otp_invalid", "The code is incorrect.")
    await redis.delete(key)  # single use

    user = (
        await db.execute(select(User).where(User.phone_bidx == bidx, User.deleted_at.is_(None)).with_for_update())
    ).scalar_one_or_none()
    is_new = False
    if user is None:
        user = User(phone_e164=phone, phone_bidx=bidx, phone_verified_at=_now(), terms_accepted_at=_now(), roles=[])
        db.add(user)
        await db.flush()
        is_new = True
    if user.status != "active":
        raise ProblemError(403, "auth.account_suspended", "This account is suspended. Contact support.")
    if "admin" in user.role_names:
        # Admin accounts must use password + TOTP, never SMS.
        raise ProblemError(400, "auth.otp_invalid", "The code is incorrect.")

    if client_app == "customer" and "customer" not in user.role_names:
        user.roles.append(UserRole(user_id=user.id, role="customer"))
        db.add(CustomerProfile(user_id=user.id))
        is_new = is_new or user.full_name is None
    elif client_app == "delivery" and "delivery_partner" not in user.role_names:
        user.roles.append(UserRole(user_id=user.id, role="delivery_partner"))
        db.add(DeliveryPartner(user_id=user.id, status="onboarding"))
        is_new = True
    if client_app == "customer" and user.full_name is None:
        is_new = True

    user.phone_verified_at = user.phone_verified_at or _now()
    user.last_login_at = _now()
    await db.flush()
    issued = await create_session(db, user, client_app, device_id=device_id, device_name=device_name, meta=meta)
    issued.is_new_user = is_new
    audit(db, None, "auth.login", "user", user.id, {"client_app": client_app, "method": "otp"}, **_meta(meta))
    return issued


def _meta(meta: RequestMeta) -> dict:
    return {"ip": meta.ip, "user_agent": meta.user_agent, "request_id": meta.request_id}


# --- Admin password + TOTP ---------------------------------------------------------------

LOCK_THRESHOLD = 5


async def admin_login(db: AsyncSession, email: str, password: str, meta: RequestMeta) -> dict:
    redis = await _redis_or_503()
    email = email.lower()
    acct = crypto.blind_index(email, purpose="login").hex()
    await ratelimit.enforce(f"login:ip:{meta.ip}", limit=20, window_seconds=600, code="auth.rate_limited", fail_closed=True)

    lock_ttl = await redis.ttl(f"login:lock:{acct}")
    if lock_ttl > 0:
        raise ProblemError(423, "auth.account_locked", "Too many failed attempts. Try again later.",
                           headers={"Retry-After": str(lock_ttl)})

    user = (
        await db.execute(select(User).where(User.email == email, User.deleted_at.is_(None)))
    ).scalar_one_or_none()
    stored = user.password_hash if user and user.admin_profile and user.admin_profile.is_active else None
    ok, new_hash = crypto.verify_password(stored, password)  # constant work even if user is missing

    if not ok or user is None:
        fails = await redis.incr(f"login:fails:{acct}")
        await redis.expire(f"login:fails:{acct}", 3600)
        if fails >= LOCK_THRESHOLD:
            await redis.set(f"login:lock:{acct}", "1", ex=min(3600, 60 * 2 ** (fails - LOCK_THRESHOLD)))
        audit(db, None, "auth.login_failed", "user", user.id if user else None, {"method": "password"}, **_meta(meta))
        await db.commit()
        raise ProblemError(401, "auth.invalid_credentials", "Email or password is incorrect.")

    if user.status != "active":
        raise ProblemError(403, "auth.account_suspended")
    await redis.delete(f"login:fails:{acct}")
    if new_hash:
        user.password_hash = new_hash

    profile = user.admin_profile
    assert profile is not None
    token = crypto.random_token(32)
    purpose = "verify" if profile.totp_enabled_at else "enroll"
    payload: dict = {"user_id": str(user.id), "purpose": purpose}
    if purpose == "enroll":
        payload["pending_secret"] = pyotp.random_base32(32)
    await redis.set(f"mfa:{crypto.refresh_token_digest(token)}", json.dumps(payload), ex=300)
    if purpose == "verify":
        return {"mfa_required": True, "mfa_token": token}
    return {
        "mfa_required": True,
        "mfa_enrollment_required": True,
        "mfa_token": token,
        "totp_uri": pyotp.TOTP(payload["pending_secret"]).provisioning_uri(name=email, issuer_name="Hungerly Admin"),
        "totp_secret": payload["pending_secret"],
    }


async def _consume_mfa_token(token: str, purpose: str) -> dict:
    redis = await _redis_or_503()
    raw = await redis.getdel(f"mfa:{crypto.refresh_token_digest(token)}")
    if raw is None:
        raise ProblemError(401, "auth.mfa_token_invalid", "Your sign-in step expired. Start again.")
    data = json.loads(raw)
    if data["purpose"] != purpose:
        raise ProblemError(401, "auth.mfa_token_invalid")
    return data


async def _check_totp(user_id: uuid.UUID, secret: str, code: str) -> bool:
    totp = pyotp.TOTP(secret)
    now = int(time.time())
    for offset in (0, -30, 30):
        if crypto.constant_time_equals(totp.at(now + offset), code):
            step = (now + offset) // 30
            # Reject replay of a code that was already used in its time step.
            return bool(await get_redis().set(f"totp:used:{user_id}:{step}", "1", nx=True, ex=120))
    return False


async def mfa_confirm_enrollment(db: AsyncSession, token: str, code: str, meta: RequestMeta) -> tuple[IssuedSession, list[str]]:
    await ratelimit.enforce(f"mfa:ip:{meta.ip}", limit=20, window_seconds=600, code="auth.rate_limited", fail_closed=True)
    data = await _consume_mfa_token(token, "enroll")
    user = await db.get(User, uuid.UUID(data["user_id"]))
    if user is None or user.admin_profile is None or not await _check_totp(user.id, data["pending_secret"], code):
        raise ProblemError(400, "auth.mfa_invalid", "The authenticator code is incorrect. Sign in again.")
    recovery = [crypto.random_token(9) for _ in range(10)]
    user.admin_profile.totp_secret = data["pending_secret"]
    user.admin_profile.totp_enabled_at = _now()
    user.admin_profile.recovery_code_hashes = json.dumps([crypto.refresh_token_digest(c) for c in recovery])
    user.last_login_at = _now()
    issued = await create_session(db, user, "admin", device_id=None, device_name=None, meta=meta)
    audit(db, None, "auth.mfa_enrolled", "user", user.id, None, **_meta(meta))
    return issued, recovery


async def mfa_verify(db: AsyncSession, token: str, code: str | None, recovery_code: str | None, meta: RequestMeta) -> IssuedSession:
    await ratelimit.enforce(f"mfa:ip:{meta.ip}", limit=20, window_seconds=600, code="auth.rate_limited", fail_closed=True)
    data = await _consume_mfa_token(token, "verify")
    user = await db.get(User, uuid.UUID(data["user_id"]))
    profile = user.admin_profile if user else None
    if user is None or profile is None or profile.totp_secret is None:
        raise ProblemError(400, "auth.mfa_invalid")
    ok = False
    method = "totp"
    if code:
        ok = await _check_totp(user.id, profile.totp_secret, code)
    elif recovery_code:
        method = "recovery_code"
        hashes: list[str] = json.loads(profile.recovery_code_hashes or "[]")
        digest = crypto.refresh_token_digest(recovery_code)
        if digest in hashes:
            hashes.remove(digest)
            profile.recovery_code_hashes = json.dumps(hashes)
            ok = True
    if not ok:
        audit(db, None, "auth.mfa_failed", "user", user.id, {"method": method}, **_meta(meta))
        await db.commit()
        raise ProblemError(400, "auth.mfa_invalid", "The code is incorrect. Sign in again.")
    user.last_login_at = _now()
    issued = await create_session(db, user, "admin", device_id=None, device_name=None, meta=meta)
    audit(db, None, "auth.login", "user", user.id, {"client_app": "admin", "method": method}, **_meta(meta))
    return issued


# --- Sessions ------------------------------------------------------------------------------


def _lifetimes(client_app: str) -> tuple[timedelta, timedelta]:
    s = get_settings()
    if client_app == "admin":
        return timedelta(hours=s.admin_session_sliding_hours), timedelta(days=s.admin_session_absolute_days)
    return timedelta(days=s.mobile_session_sliding_days), timedelta(days=s.mobile_session_absolute_days)


def _access_for(user: User, session: AuthSession) -> str:
    admin_role = None
    if session.client_app == "admin" and user.admin_profile and user.admin_profile.is_active:
        admin_role = user.admin_profile.admin_role
    return issue_access_token(
        user_id=user.id, session_id=session.id, client_app=session.client_app, roles=user.role_names, admin_role=admin_role
    )


async def create_session(
    db: AsyncSession, user: User, client_app: str, *, device_id: str | None, device_name: str | None, meta: RequestMeta
) -> IssuedSession:
    sliding, absolute = _lifetimes(client_app)
    refresh = crypto.random_token(32)
    now = _now()
    session = AuthSession(
        user_id=user.id,
        client_app=client_app,
        refresh_token_hash=crypto.refresh_token_digest(refresh),
        device_id=device_id,
        device_name=device_name,
        user_agent=(meta.user_agent or "")[:512] or None,
        ip_address=_ip_or_none(meta.ip),
        last_used_at=now,
        idle_expires_at=now + sliding,
        expires_at=now + absolute,
    )
    db.add(session)
    await db.flush()
    return IssuedSession(_access_for(user, session), refresh, session, user)


def _ip_or_none(ip: str) -> str | None:
    import ipaddress

    try:
        return str(ipaddress.ip_address(ip))
    except ValueError:
        return None


async def refresh_session(db: AsyncSession, token: str, client_app: str, meta: RequestMeta) -> IssuedSession:
    await ratelimit.enforce(f"refresh:ip:{meta.ip}", limit=60, window_seconds=600, code="auth.rate_limited", fail_closed=True)
    digest = crypto.refresh_token_digest(token)
    session = (
        await db.execute(select(AuthSession).where(AuthSession.refresh_token_hash == digest).with_for_update())
    ).scalar_one_or_none()

    if session is None:
        reused = (
            await db.execute(select(AuthSession).where(AuthSession.previous_token_hash == digest).with_for_update())
        ).scalar_one_or_none()
        if reused is not None and reused.revoked_at is None:
            # A rotated-out token came back: assume theft and kill the whole session.
            await revoke_session(db, reused, "reuse_detected")
            audit(db, None, "auth.refresh_reuse_detected", "auth_session", reused.id, None, **_meta(meta))
            await db.commit()
            raise ProblemError(401, "auth.session_revoked")
        raise ProblemError(401, "auth.refresh_invalid")

    now = _now()
    if session.client_app != client_app or session.revoked_at is not None:
        raise ProblemError(401, "auth.session_revoked")
    if now >= session.expires_at or now >= session.idle_expires_at:
        await revoke_session(db, session, "expired")
        await db.commit()
        raise ProblemError(401, "auth.session_expired")

    user = await db.get(User, session.user_id)
    if user is None or user.status != "active":
        await revoke_session(db, session, "account_inactive")
        await db.commit()
        raise ProblemError(401, "auth.session_revoked")

    sliding, _ = _lifetimes(client_app)
    new_refresh = crypto.random_token(32)
    session.previous_token_hash = session.refresh_token_hash
    session.refresh_token_hash = crypto.refresh_token_digest(new_refresh)
    session.last_used_at = now
    session.idle_expires_at = min(now + sliding, session.expires_at)
    session.ip_address = _ip_or_none(meta.ip)
    return IssuedSession(_access_for(user, session), new_refresh, session, user)


async def revoke_session(db: AsyncSession, session: AuthSession, reason: str) -> None:
    if session.revoked_at is None:
        session.revoked_at = _now()
        session.revoke_reason = reason
    await _deny_sid(session.id)


async def revoke_all_sessions(db: AsyncSession, user_id: uuid.UUID, reason: str) -> int:
    rows = (
        await db.execute(
            update(AuthSession)
            .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=_now(), revoke_reason=reason)
            .returning(AuthSession.id)
        )
    ).scalars().all()
    for sid in rows:
        await _deny_sid(sid)
    return len(rows)


async def _deny_sid(sid: uuid.UUID) -> None:
    try:
        await get_redis().set(revoked_sid_key(sid), "1", ex=get_settings().access_token_ttl_seconds + 60)
    except RedisError:
        pass  # the database row is authoritative; Redis is only a fast path


def principal_meta(p: Principal) -> RequestMeta:
    return RequestMeta(ip=p.ip, user_agent=p.user_agent, request_id=p.request_id)
