"""Application settings, loaded from environment variables (and `.env` in development).

Every secret is required and validated at startup: the app refuses to boot with a
missing, short or placeholder secret rather than silently running insecurely.
"""

from __future__ import annotations

import base64
import json
from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["development", "test", "staging", "production"]


def _decode_key(value: str, *, name: str, length: int = 32) -> bytes:
    try:
        raw = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"{name} must be url-safe base64") from exc
    if len(raw) != length:
        raise ValueError(f"{name} must decode to exactly {length} bytes")
    return raw


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: Environment = "development"
    app_name: str = "Hungerly API"
    api_prefix: str = "/api/v1"

    database_url: SecretStr
    redis_url: SecretStr

    # Comma-separated origins allowed to call the API from a browser (the admin panel).
    cors_origins: str = "http://localhost:5173"
    # Proxies whose X-Forwarded-For header is trusted for the client IP. Empty = trust none.
    trusted_proxies: str = ""

    # --- Keys -------------------------------------------------------------------------
    # Ed25519 private key (PEM) used to sign access tokens. `kid` identifies it in JWT headers.
    jwt_private_key: SecretStr
    jwt_key_id: str = "k1"
    # Previous public keys still accepted during rotation: JSON {"kid": "<PEM>"}.
    jwt_previous_public_keys: str = "{}"
    jwt_issuer: str = "https://api.hungerly.app"

    # AES-256-GCM keys for field-level encryption: JSON {"kid": "<base64 32 bytes>"}.
    field_encryption_keys: SecretStr
    field_encryption_active_kid: str = "v1"
    # HMAC keys (base64, 32 bytes) — each has a single purpose so one leak cannot be reused elsewhere.
    blind_index_key: SecretStr
    otp_hmac_key: SecretStr
    refresh_token_pepper: SecretStr
    cursor_signing_key: SecretStr

    # --- Auth tunables ---------------------------------------------------------------
    access_token_ttl_seconds: int = 900
    mobile_session_sliding_days: int = 30
    mobile_session_absolute_days: int = 90
    admin_session_sliding_hours: int = 12
    admin_session_absolute_days: int = 7
    otp_ttl_seconds: int = 300
    otp_max_attempts: int = 5
    otp_resend_cooldown_seconds: int = 30
    # Development only: accept this fixed OTP and print codes to the console instead of SMS.
    otp_dev_fixed_code: str | None = None
    admin_refresh_cookie: str = "__Host-hg_rt"
    admin_csrf_cookie: str = "__Host-hg_csrf"
    cookie_secure: bool = True

    max_body_bytes: int = 1_048_576
    global_rate_limit_per_minute: int = 300
    user_rate_limit_per_minute: int = 120

    # --- Business tunables -----------------------------------------------------------
    delivery_offer_ttl_seconds: int = 45
    rider_location_ttl_seconds: int = 120
    dispatch_radius_m: int = 5000
    rider_base_payout_minor: int = 2500
    rider_per_km_payout_minor: int = 800
    tax_rate_bps: int = 500
    platform_fee_minor: int = 500

    seed_admin_email: str | None = None

    @field_validator("cors_origins")
    @classmethod
    def _no_wildcard(cls, v: str) -> str:
        if "*" in v:
            raise ValueError("CORS wildcard is not allowed (credentials are used)")
        return v

    @model_validator(mode="after")
    def _validate_secrets(self) -> "Settings":
        for name in ("blind_index_key", "otp_hmac_key", "refresh_token_pepper", "cursor_signing_key"):
            _decode_key(getattr(self, name).get_secret_value(), name=name)
        keys = self.encryption_keys
        if self.field_encryption_active_kid not in keys:
            raise ValueError("field_encryption_active_kid is not present in field_encryption_keys")
        if self.env in ("staging", "production"):
            if self.otp_dev_fixed_code:
                raise ValueError("OTP_DEV_FIXED_CODE must not be set outside development/test")
            if not self.cookie_secure:
                raise ValueError("COOKIE_SECURE must be true outside development/test")
            if "localhost" in self.cors_origins:
                raise ValueError("localhost CORS origins are not allowed outside development/test")
        return self

    @property
    def encryption_keys(self) -> dict[str, bytes]:
        data = json.loads(self.field_encryption_keys.get_secret_value())
        return {kid: _decode_key(v, name=f"field_encryption_keys[{kid}]") for kid, v in data.items()}

    def key_bytes(self, name: str) -> bytes:
        return _decode_key(getattr(self, name).get_secret_value(), name=name)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def trusted_proxy_list(self) -> set[str]:
        return {p.strip() for p in self.trusted_proxies.split(",") if p.strip()}

    @property
    def is_production_like(self) -> bool:
        return self.env in ("staging", "production")


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
