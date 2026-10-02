from __future__ import annotations

import pytest
from fastapi.routing import APIRoute
from sqlalchemy.exc import DBAPIError

from app.api.deps import PUBLIC
from app.core.redis import get_redis
from app.main import create_app
from tests.conftest import API, admin_login, bearer, device, exec_sql, otp_login


async def test_security_headers_and_request_id(client):
    r = await client.get("/health/live")
    assert r.status_code == 200
    for header in ("x-content-type-options", "referrer-policy", "x-frame-options", "content-security-policy", "x-request-id"):
        assert header in r.headers
    assert "server" not in r.headers


def test_every_route_declares_a_policy():
    """Deny by default: each route either depends on an auth policy or is explicitly marked public."""
    app = create_app(run_background_jobs=False)
    policy_names = {"customer", "delivery_user", "get_partner", "active_rider", "dependency"}
    missing = []
    for route in app.routes:
        if not isinstance(route, APIRoute) or (route.openapi_extra or {}).get(PUBLIC):
            continue
        deps = {d.call.__name__ for d in route.dependant.dependencies if d.call}
        flat = set(deps)
        for d in route.dependant.dependencies:
            flat |= {s.call.__name__ for s in d.dependencies if s.call}
        if not (flat & policy_names or any(n.startswith("admin_") for n in flat)):
            missing.append(route.path)
    assert not missing, f"routes without an auth policy: {missing}"


async def test_protected_routes_require_token(client):
    for path in ("/me", "/customer/cart", "/delivery/me", "/admin/dashboard/live"):
        r = await client.get(f"{API}{path}")
        assert r.status_code == 401, path
        assert r.headers["content-type"].startswith("application/problem+json")


async def test_forged_and_tampered_tokens_rejected(client):
    tokens = await otp_login(client, "+919811111111")
    header, payload, sig = tokens["access_token"].split(".")
    tampered = f"{header}.{payload}.{sig[:-2]}AA"
    r = await client.get(f"{API}/me", headers={"Authorization": f"Bearer {tampered}"})
    assert r.status_code == 401
    # alg=none attack
    none_token = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0." + payload + "."
    r = await client.get(f"{API}/me", headers={"Authorization": f"Bearer {none_token}"})
    assert r.status_code == 401


async def test_customer_token_cannot_reach_admin_or_delivery(client):
    tokens = await otp_login(client, "+919811111112")
    assert (await client.get(f"{API}/admin/dashboard/live", headers=bearer(tokens))).status_code == 401
    assert (await client.get(f"{API}/delivery/me", headers=bearer(tokens))).status_code == 401


async def test_otp_wrong_code_and_attempt_limit(client):
    phone, dev = "+919811111113", device()
    rid = (await client.post(f"{API}/auth/otp/request", json={"phone_e164": phone, "client_app": "customer", "device_id": dev})).json()["otp_request_id"]
    body = {"otp_request_id": rid, "phone_e164": phone, "otp": "000000", "client_app": "customer", "device_id": dev}
    for _ in range(5):
        assert (await client.post(f"{API}/auth/otp/verify", json=body)).status_code == 400
    r = await client.post(f"{API}/auth/otp/verify", json={**body, "otp": "123456"})
    assert r.status_code == 429  # locked out even with the right code


async def test_otp_bound_to_phone(client):
    dev = device()
    rid = (await client.post(f"{API}/auth/otp/request", json={"phone_e164": "+919811111114", "client_app": "customer", "device_id": dev})).json()["otp_request_id"]
    r = await client.post(f"{API}/auth/otp/verify", json={
        "otp_request_id": rid, "phone_e164": "+919811111115", "otp": "123456", "client_app": "customer", "device_id": dev})
    assert r.status_code == 400


async def test_otp_request_rate_limited(client):
    phone = "+919811111116"
    codes = []
    for _ in range(2):
        r = await client.post(f"{API}/auth/otp/request", json={"phone_e164": phone, "client_app": "customer", "device_id": device()})
        codes.append(r.status_code)
    assert codes == [202, 429]  # resend cooldown
    assert "retry-after" in r.headers


async def test_refresh_rotation_and_reuse_detection(client):
    tokens = await otp_login(client, "+919811111117")
    r = await client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"], "client_app": "customer"})
    assert r.status_code == 200
    rotated = r.json()
    assert rotated["refresh_token"] != tokens["refresh_token"]
    # Replaying the old token = theft signal: the whole session dies, including the new tokens.
    r = await client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"], "client_app": "customer"})
    assert r.status_code == 401
    assert (await client.get(f"{API}/me", headers=bearer(rotated))).status_code == 401
    r = await client.post(f"{API}/auth/refresh", json={"refresh_token": rotated["refresh_token"], "client_app": "customer"})
    assert r.status_code == 401


async def test_logout_revokes_access_token_immediately(client):
    tokens = await otp_login(client, "+919811111118")
    assert (await client.post(f"{API}/auth/logout", headers=bearer(tokens))).status_code == 204
    assert (await client.get(f"{API}/me", headers=bearer(tokens))).status_code == 401


async def test_unknown_fields_rejected(client):
    tokens = await otp_login(client, "+919811111119")
    r = await client.patch(f"{API}/me", headers=bearer(tokens), json={"full_name": "Asha", "roles": ["admin"]})
    assert r.status_code == 422


async def test_sql_injection_payloads_are_inert(client):
    for q in ("' OR 1=1 --", "%' UNION SELECT password_hash FROM users --", "a%_%"):
        r = await client.get(f"{API}/catalog/restaurants", params={"lat": 18.5362, "lng": 73.8939, "q": q})
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            assert r.json()["items"] == []


async def test_admin_password_lockout(client):
    for _ in range(5):
        r = await client.post(f"{API}/auth/login", json={"email": "root@example.com", "password": "wrong-password-123"})
        assert r.status_code == 401
    r = await client.post(f"{API}/auth/login", json={"email": "root@example.com", "password": "wrong-password-123"})
    assert r.status_code == 423


async def test_unknown_admin_gets_same_error(client):
    r = await client.post(f"{API}/auth/login", json={"email": "nobody@example.com", "password": "whatever-123456"})
    assert r.status_code == 401
    assert r.json()["code"] == "auth.invalid_credentials"


async def test_admin_totp_replay_rejected(client):
    first = await admin_login(client)
    assert first["access_token"]
    import os

    import pyotp

    await get_redis().flushdb()  # forget codes used by the helper above
    r = await client.post(f"{API}/auth/login", json={"email": "root@example.com", "password": os.environ["TEST_ADMIN_PASSWORD"]})
    code = pyotp.TOTP(first["totp_secret"]).now()
    r1 = await client.post(f"{API}/auth/mfa/verify", json={"mfa_token": r.json()["mfa_token"], "code": code})
    r = await client.post(f"{API}/auth/login", json={"email": "root@example.com", "password": os.environ["TEST_ADMIN_PASSWORD"]})
    r2 = await client.post(f"{API}/auth/mfa/verify", json={"mfa_token": r.json()["mfa_token"], "code": code})
    assert r1.status_code == 200 and r2.status_code == 400


async def test_admin_cookie_refresh_requires_csrf(client):
    await admin_login(client)
    r = await client.post(f"{API}/auth/admin/refresh")
    assert r.status_code == 403
    csrf = client.cookies.get("hg_csrf")
    r = await client.post(f"{API}/auth/admin/refresh", headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    r = await client.post(f"{API}/auth/admin/refresh", headers={"X-CSRF-Token": csrf, "Origin": "https://evil.example"})
    assert r.status_code == 403


async def test_encrypted_columns_hold_no_plaintext(client, db):
    await otp_login(client, "+919822222222")
    row = (await exec_sql(db, "SELECT phone_e164 FROM users WHERE phone_e164 IS NOT NULL LIMIT 1")).first()
    assert b"9822222222" not in bytes(row[0]) and b"+91" not in bytes(row[0])


async def test_audit_log_is_append_only(client, db):
    await admin_login(client)
    with pytest.raises(DBAPIError):
        await exec_sql(db, "UPDATE audit_logs SET action = 'tampered'")
    await db.rollback()
    with pytest.raises(DBAPIError):
        await exec_sql(db, "DELETE FROM audit_logs")
    await db.rollback()


async def test_forwarded_for_is_ignored_unless_proxy_trusted(client):
    """Callers must not be able to pick their own IP (and so dodge per-IP limits) with X-Forwarded-For."""
    codes = []
    for i in range(130):
        r = await client.get(f"{API}/catalog/cuisines", headers={"X-Forwarded-For": f"10.9.{i // 200}.{i % 200}"})
        codes.append(r.status_code)
    assert 429 in codes, "per-IP limit must still apply when X-Forwarded-For is spoofed"


async def test_oversized_body_rejected(client):
    r = await client.post(f"{API}/auth/otp/request", content=b"x" * 1_100_000, headers={"content-type": "application/json"})
    assert r.status_code == 413
