from __future__ import annotations

import uuid
from typing import Annotated, Literal

from datetime import datetime
from urllib.parse import urlsplit

from fastapi import APIRouter, Header, Request, Response
from pydantic import EmailStr, Field
from sqlalchemy import select

from app.api.deps import DB, PUBLIC, AnyP, audit
from app.core import crypto, ratelimit
from app.core.config import get_settings
from app.core.errors import ProblemError
from app.models import AuthSession
from app.schemas.common import DeviceId, Out, PhoneE164, Strict
from app.services import auth as svc

router = APIRouter(prefix="/auth", tags=["auth"])


def _meta(request: Request) -> svc.RequestMeta:
    return svc.RequestMeta(
        ip=ratelimit.client_ip(request),
        user_agent=request.headers.get("user-agent"),
        request_id=getattr(request.state, "request_id", None),
    )


# --- Schemas -------------------------------------------------------------------------


class OtpRequestIn(Strict):
    phone_e164: PhoneE164
    client_app: Literal["customer", "delivery"]
    device_id: DeviceId


class OtpRequestOut(Out):
    otp_request_id: str
    expires_in: int
    resend_after: int


class OtpVerifyIn(Strict):
    otp_request_id: uuid.UUID
    phone_e164: PhoneE164
    otp: str = Field(pattern=r"^\d{6}$")
    client_app: Literal["customer", "delivery"]
    device_id: DeviceId
    device_name: str | None = Field(default=None, max_length=128)


class UserOut(Out):
    id: uuid.UUID
    full_name: str | None
    roles: list[str]
    is_new_user: bool = False
    admin_role: str | None = None


class TokenOut(Out):
    access_token: str
    access_token_expires_in: int
    refresh_token: str
    user: UserOut


class AdminTokenOut(Out):
    access_token: str
    access_token_expires_in: int
    user: UserOut


class LoginIn(Strict):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class MfaConfirmIn(Strict):
    mfa_token: str = Field(min_length=20, max_length=128)
    code: str = Field(pattern=r"^\d{6}$")


class MfaVerifyIn(Strict):
    mfa_token: str = Field(min_length=20, max_length=128)
    code: str | None = Field(default=None, pattern=r"^\d{6}$")
    recovery_code: str | None = Field(default=None, min_length=8, max_length=32)


class RefreshIn(Strict):
    refresh_token: str = Field(min_length=20, max_length=128)
    client_app: Literal["customer", "delivery"]


class SessionOut(Out):
    id: uuid.UUID
    client_app: str
    device_name: str | None
    user_agent: str | None
    created_at: datetime
    last_used_at: datetime
    current: bool = False


def _user_out(issued: svc.IssuedSession) -> UserOut:
    admin_role = None
    if issued.session.client_app == "admin" and issued.user.admin_profile:
        admin_role = issued.user.admin_profile.admin_role
    return UserOut(
        id=issued.user.id,
        full_name=issued.user.full_name,
        roles=issued.user.role_names,
        is_new_user=issued.is_new_user,
        admin_role=admin_role,
    )


def _token_out(issued: svc.IssuedSession) -> TokenOut:
    return TokenOut(
        access_token=issued.access_token,
        access_token_expires_in=get_settings().access_token_ttl_seconds,
        refresh_token=issued.refresh_token,
        user=_user_out(issued),
    )


# --- Admin cookie helpers -------------------------------------------------------------


def _set_admin_cookies(response: Response, issued: svc.IssuedSession) -> None:
    s = get_settings()
    _, absolute = svc._lifetimes("admin")
    max_age = int(absolute.total_seconds())
    response.set_cookie(
        s.admin_refresh_cookie, issued.refresh_token, max_age=max_age, path="/",
        secure=s.cookie_secure, httponly=True, samesite="strict",
    )
    # Double-submit CSRF token: readable by the admin page, echoed in the X-CSRF-Token header.
    response.set_cookie(
        s.admin_csrf_cookie, crypto.random_token(24), max_age=max_age, path="/",
        secure=s.cookie_secure, httponly=False, samesite="strict",
    )


def _clear_admin_cookies(response: Response) -> None:
    s = get_settings()
    for name in (s.admin_refresh_cookie, s.admin_csrf_cookie):
        response.delete_cookie(name, path="/", secure=s.cookie_secure, samesite="strict")


def _same_origin(origin: str, request: Request) -> bool:
    """True when the browser's Origin is the host it sent the request to (panel and API served together,
    e.g. behind the Vite proxy or a reverse proxy). Browsers never let a page forge a matching Origin."""
    host = request.headers.get("host")
    return bool(host) and urlsplit(origin).netloc.lower() == host.strip().lower()


def _check_csrf(request: Request, header_token: str | None) -> None:
    s = get_settings()
    origin = request.headers.get("origin")
    if origin is not None and origin not in s.cors_origin_list and not _same_origin(origin, request):
        raise ProblemError(403, "auth.origin_not_allowed")
    cookie_token = request.cookies.get(s.admin_csrf_cookie)
    if not cookie_token or not header_token or not crypto.constant_time_equals(cookie_token, header_token):
        raise ProblemError(403, "auth.csrf_failed")


def _admin_token_out(issued: svc.IssuedSession) -> AdminTokenOut:
    return AdminTokenOut(
        access_token=issued.access_token,
        access_token_expires_in=get_settings().access_token_ttl_seconds,
        user=_user_out(issued),
    )


# --- Routes ------------------------------------------------------------------------------


@router.post("/otp/request", status_code=202, response_model=OtpRequestOut, openapi_extra={PUBLIC: True})
async def otp_request(body: OtpRequestIn, request: Request) -> dict:
    return await svc.request_otp(body.phone_e164, body.client_app, body.device_id, _meta(request))


@router.post("/otp/verify", response_model=TokenOut, openapi_extra={PUBLIC: True})
async def otp_verify(body: OtpVerifyIn, request: Request, db: DB) -> TokenOut:
    issued = await svc.verify_otp(
        db,
        otp_request_id=str(body.otp_request_id),
        phone=body.phone_e164,
        otp=body.otp,
        client_app=body.client_app,
        device_id=body.device_id,
        device_name=body.device_name,
        meta=_meta(request),
    )
    await db.commit()
    return _token_out(issued)


@router.post("/refresh", response_model=TokenOut, openapi_extra={PUBLIC: True})
async def refresh(body: RefreshIn, request: Request, db: DB) -> TokenOut:
    issued = await svc.refresh_session(db, body.refresh_token, body.client_app, _meta(request))
    await db.commit()
    return _token_out(issued)


@router.post("/login", openapi_extra={PUBLIC: True})
async def admin_login(body: LoginIn, request: Request, db: DB) -> dict:
    result = await svc.admin_login(db, str(body.email), body.password, _meta(request))
    await db.commit()
    return result


@router.post("/mfa/confirm", openapi_extra={PUBLIC: True})
async def mfa_confirm(body: MfaConfirmIn, request: Request, response: Response, db: DB) -> dict:
    issued, recovery_codes = await svc.mfa_confirm_enrollment(db, body.mfa_token, body.code, _meta(request))
    await db.commit()
    _set_admin_cookies(response, issued)
    return {**_admin_token_out(issued).model_dump(mode="json"), "recovery_codes": recovery_codes}


@router.post("/mfa/verify", response_model=AdminTokenOut, openapi_extra={PUBLIC: True})
async def mfa_verify(body: MfaVerifyIn, request: Request, response: Response, db: DB) -> AdminTokenOut:
    if bool(body.code) == bool(body.recovery_code):
        raise ProblemError(422, "validation.failed", "Provide either an authenticator code or a recovery code.")
    issued = await svc.mfa_verify(db, body.mfa_token, body.code, body.recovery_code, _meta(request))
    await db.commit()
    _set_admin_cookies(response, issued)
    return _admin_token_out(issued)


@router.post("/admin/refresh", response_model=AdminTokenOut, openapi_extra={PUBLIC: True})
async def admin_refresh(
    request: Request,
    response: Response,
    db: DB,
    x_csrf_token: Annotated[str | None, Header()] = None,
) -> AdminTokenOut:
    _check_csrf(request, x_csrf_token)
    token = request.cookies.get(get_settings().admin_refresh_cookie)
    if not token:
        raise ProblemError(401, "auth.refresh_invalid")
    try:
        issued = await svc.refresh_session(db, token, "admin", _meta(request))
    except ProblemError:
        _clear_admin_cookies(response)
        raise
    await db.commit()
    _set_admin_cookies(response, issued)
    return _admin_token_out(issued)


@router.post("/logout", status_code=204)
async def logout(p: AnyP, db: DB, response: Response) -> Response:
    session = await db.get(AuthSession, p.session_id)
    if session is not None:
        await svc.revoke_session(db, session, "logout")
    audit(db, p, "auth.logout", "auth_session", p.session_id)
    await db.commit()
    response = Response(status_code=204)
    if p.client_app == "admin":
        _clear_admin_cookies(response)
    return response


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(p: AnyP, db: DB) -> list[SessionOut]:
    rows = (
        await db.execute(
            select(AuthSession)
            .where(AuthSession.user_id == p.user_id, AuthSession.revoked_at.is_(None))
            .order_by(AuthSession.last_used_at.desc())
            .limit(50)
        )
    ).scalars()
    return [
        SessionOut(
            id=s.id, client_app=s.client_app, device_name=s.device_name, user_agent=s.user_agent,
            created_at=s.created_at, last_used_at=s.last_used_at, current=s.id == p.session_id,
        )
        for s in rows
    ]


@router.delete("/sessions/{session_id}", status_code=204)
async def revoke_one(session_id: uuid.UUID, p: AnyP, db: DB) -> Response:
    session = (
        await db.execute(select(AuthSession).where(AuthSession.id == session_id, AuthSession.user_id == p.user_id))
    ).scalar_one_or_none()
    if session is None:
        raise ProblemError(404, "session.not_found")
    await svc.revoke_session(db, session, "logout")
    audit(db, p, "auth.session_revoked", "auth_session", session_id)
    await db.commit()
    return Response(status_code=204)
