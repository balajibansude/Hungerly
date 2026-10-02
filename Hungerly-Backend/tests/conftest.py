"""Tests run against real PostgreSQL + Redis (docker compose), using a separate `hungerly_test`
database and Redis DB 15, so they exercise the actual constraints, triggers and Lua scripts."""

from __future__ import annotations

import os
import re
import subprocess
import sys
import uuid
from pathlib import Path

import pytest
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent.parent
_env = dotenv_values(ROOT / ".env")
os.environ.update({k: v for k, v in _env.items() if v is not None})
os.environ["ENV"] = "test"
os.environ["DATABASE_URL"] = re.sub(r"/hungerly$", "/hungerly_test", _env["DATABASE_URL"])
os.environ["REDIS_URL"] = re.sub(r"/0$", "/15", _env["REDIS_URL"])

import httpx  # noqa: E402
import pyotp  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.config import get_settings  # noqa: E402

get_settings.cache_clear()

from app.core.redis import get_redis  # noqa: E402
from app.db.session import sessionmaker  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _migrate_and_seed():
    env = {**os.environ}
    subprocess.run([sys.executable, "-m", "alembic", "downgrade", "base"], cwd=ROOT, env=env, check=True, capture_output=True)
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=ROOT, env=env, check=True, capture_output=True)
    out = subprocess.run(
        [sys.executable, "scripts/seed.py", "--admin-email", "root@example.com"], cwd=ROOT, env=env, check=True,
        capture_output=True, text=True,
    ).stdout
    pw = re.search(r"temporary password: (\S+)", out)
    assert pw, out
    os.environ["TEST_ADMIN_PASSWORD"] = pw.group(1)


@pytest.fixture(autouse=True)
async def _clean_redis():
    await get_redis().flushdb()
    yield


@pytest.fixture(scope="session")
async def client():
    app = create_app(run_background_jobs=False)
    transport = httpx.ASGITransport(app=app, client=("203.0.113.10", 5555))
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c


@pytest.fixture
async def db():
    async with sessionmaker()() as session:
        yield session


API = "/api/v1"


def device() -> str:
    return "test-" + uuid.uuid4().hex[:16]


async def otp_login(client: httpx.AsyncClient, phone: str, app: str = "customer") -> dict:
    dev = device()
    r = await client.post(f"{API}/auth/otp/request", json={"phone_e164": phone, "client_app": app, "device_id": dev})
    assert r.status_code == 202, r.text
    rid = r.json()["otp_request_id"]
    r = await client.post(
        f"{API}/auth/otp/verify",
        json={"otp_request_id": rid, "phone_e164": phone, "otp": "123456", "client_app": app, "device_id": dev},
    )
    assert r.status_code == 200, r.text
    return r.json()


def bearer(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def admin_login(client: httpx.AsyncClient, email: str = "root@example.com", password: str | None = None) -> dict:
    """Signs in an admin, enrolling TOTP on first use. Returns {"access_token", "totp_secret"}."""
    password = password or os.environ["TEST_ADMIN_PASSWORD"]
    r = await client.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    body = r.json()
    secret = os.environ.get(f"TOTP_{email}")
    if body.get("mfa_enrollment_required"):
        secret = body["totp_secret"]
        os.environ[f"TOTP_{email}"] = secret
        r = await client.post(f"{API}/auth/mfa/confirm", json={"mfa_token": body["mfa_token"], "code": pyotp.TOTP(secret).now()})
    else:
        await get_redis().delete(*[k async for k in get_redis().scan_iter("totp:used:*")] or ["_none"])
        r = await client.post(f"{API}/auth/mfa/verify", json={"mfa_token": body["mfa_token"], "code": pyotp.TOTP(secret).now()})
    assert r.status_code == 200, r.text
    return {**r.json(), "totp_secret": secret}


async def exec_sql(db, sql: str, **params):
    return await db.execute(text(sql), params)
