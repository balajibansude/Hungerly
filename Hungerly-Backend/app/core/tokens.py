"""Access tokens: EdDSA (Ed25519) JWTs with a strict algorithm allow-list."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache

import jwt
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import load_pem_private_key, load_pem_public_key

from app.core.config import get_settings

ALGORITHM = "EdDSA"
LEEWAY_SECONDS = 30


@dataclass(frozen=True, slots=True)
class AccessClaims:
    sub: uuid.UUID
    sid: uuid.UUID
    aud: str
    roles: tuple[str, ...]
    admin_role: str | None
    jti: str


@lru_cache
def _signing_key() -> Ed25519PrivateKey:
    key = load_pem_private_key(get_settings().jwt_private_key.get_secret_value().encode(), password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise RuntimeError("JWT_PRIVATE_KEY must be an Ed25519 key")
    return key


@lru_cache
def _verification_keys() -> dict[str, Ed25519PublicKey]:
    settings = get_settings()
    keys: dict[str, Ed25519PublicKey] = {settings.jwt_key_id: _signing_key().public_key()}
    for kid, pem in json.loads(settings.jwt_previous_public_keys).items():
        pub = load_pem_public_key(pem.encode())
        if not isinstance(pub, Ed25519PublicKey):
            raise RuntimeError(f"previous JWT key {kid} is not Ed25519")
        keys[kid] = pub
    return keys


def issue_access_token(
    *, user_id: uuid.UUID, session_id: uuid.UUID, client_app: str, roles: list[str], admin_role: str | None
) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "iss": settings.jwt_issuer,
        "aud": client_app,
        "sub": str(user_id),
        "sid": str(session_id),
        "roles": sorted(roles),
        "iat": now,
        "nbf": now,
        "exp": now + timedelta(seconds=settings.access_token_ttl_seconds),
        "jti": uuid.uuid4().hex,
    }
    if admin_role:
        payload["adm"] = admin_role
    return jwt.encode(payload, _signing_key(), algorithm=ALGORITHM, headers={"kid": settings.jwt_key_id})


class InvalidToken(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def decode_access_token(token: str, *, expected_audience: str | list[str]) -> AccessClaims:
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise InvalidToken("auth.token_invalid") from exc
    if header.get("alg") != ALGORITHM:
        raise InvalidToken("auth.token_invalid")
    key = _verification_keys().get(str(header.get("kid")))
    if key is None:
        raise InvalidToken("auth.token_invalid")
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=[ALGORITHM],
            audience=expected_audience,
            issuer=get_settings().jwt_issuer,
            leeway=LEEWAY_SECONDS,
            options={"require": ["exp", "iat", "nbf", "iss", "aud", "sub", "sid", "jti"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise InvalidToken("auth.token_expired") from exc
    except jwt.PyJWTError as exc:
        raise InvalidToken("auth.token_invalid") from exc
    try:
        return AccessClaims(
            sub=uuid.UUID(payload["sub"]),
            sid=uuid.UUID(payload["sid"]),
            aud=payload["aud"],
            roles=tuple(payload.get("roles", [])),
            admin_role=payload.get("adm"),
            jti=payload["jti"],
        )
    except (ValueError, KeyError) as exc:
        raise InvalidToken("auth.token_invalid") from exc
