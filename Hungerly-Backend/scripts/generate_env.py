"""Create a development `.env` with freshly generated keys.

Usage:  python scripts/generate_env.py            (refuses to overwrite an existing .env)
        python scripts/generate_env.py --force

Every key is random and unique to this machine. Never commit .env; never reuse these keys in production
(production secrets live in the hosting platform's secret manager).
"""

from __future__ import annotations

import base64
import json
import secrets
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

ROOT = Path(__file__).resolve().parent.parent


def key() -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")


def main() -> None:
    target = ROOT / ".env"
    if target.exists() and "--force" not in sys.argv:
        sys.exit(".env already exists (use --force to overwrite)")
    pem = Ed25519PrivateKey.generate().private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    pg = secrets.token_urlsafe(24)
    rd = secrets.token_urlsafe(24)
    lines = {
        "ENV": "development",
        "POSTGRES_PASSWORD": pg,
        "REDIS_PASSWORD": rd,
        "DATABASE_URL": f"postgresql+asyncpg://hungerly:{pg}@127.0.0.1:5432/hungerly",
        "REDIS_URL": f"redis://:{rd}@127.0.0.1:6379/0",
        "CORS_ORIGINS": "http://localhost:5173",
        "JWT_PRIVATE_KEY": json.dumps(pem),
        "JWT_KEY_ID": "dev-" + secrets.token_hex(4),
        "FIELD_ENCRYPTION_KEYS": json.dumps(json.dumps({"v1": key()})),
        "FIELD_ENCRYPTION_ACTIVE_KID": "v1",
        "BLIND_INDEX_KEY": key(),
        "OTP_HMAC_KEY": key(),
        "REFRESH_TOKEN_PEPPER": key(),
        "CURSOR_SIGNING_KEY": key(),
        # Plain-HTTP localhost cannot use __Host- cookies in every browser; production keeps the prefix.
        "ADMIN_REFRESH_COOKIE": "hg_rt",
        "ADMIN_CSRF_COOKIE": "hg_csrf",
        "COOKIE_SECURE": "false",
        # Matches the customer app prototype. Rejected at startup outside development.
        "OTP_DEV_FIXED_CODE": "123456",
    }
    target.write_text("".join(f"{k}={v}\n" for k, v in lines.items()), encoding="utf-8")
    print(f"wrote {target}")


if __name__ == "__main__":
    main()
