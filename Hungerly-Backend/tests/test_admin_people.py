"""Customer/rider detail panels, audited PII reveal, global search and rider freshness."""

from __future__ import annotations

import os

from app.core.redis import get_redis
from tests.conftest import API, admin_login, bearer, otp_login


async def _support_admin(client, root_headers) -> dict:
    email = "support-agent@example.com"
    if not os.environ.get("SUPPORT_PW"):
        os.environ["SUPPORT_PW"] = "support-temp-password-123"
        r = await client.post(f"{API}/admin/admins", headers=root_headers, json={
            "email": email, "full_name": "Support Agent", "admin_role": "support", "temporary_password": os.environ["SUPPORT_PW"]})
        assert r.status_code == 201, r.text
    await get_redis().delete(*[k async for k in get_redis().scan_iter("totp:used:*")] or ["_"])
    return await admin_login(client, email=email, password=os.environ["SUPPORT_PW"])


async def test_contact_details_masked_until_revealed_and_audited(client):
    tokens = await otp_login(client, "+919866600001")
    me = (await client.patch(f"{API}/me", headers=bearer(tokens), json={"full_name": "Meera Shah", "email": "meera.shah@example.com"})).json()
    root = bearer(await admin_login(client))

    rows = (await client.get(f"{API}/admin/users", headers=root, params={"q": "Meera"})).json()["items"]
    row = next(r for r in rows if r["id"] == me["id"])
    assert row["masked_phone"].endswith("0001") and "98666" not in row["masked_phone"]
    assert row["masked_email"].startswith("m") and "eera.shah" not in row["masked_email"]
    assert "email" not in row and "phone_e164" not in row

    detail = (await client.get(f"{API}/admin/users/{me['id']}", headers=root)).json()
    assert detail["masked_phone"] == row["masked_phone"] and detail["stats"]["orders"] == 0

    r = await client.post(f"{API}/admin/users/{me['id']}/reveal", headers=root)
    assert r.status_code == 200
    assert r.json()["phone_e164"] == "+919866600001" and r.json()["email"] == "meera.shah@example.com"
    logs = (await client.get(f"{API}/admin/audit-logs", headers=root, params={"entity_id": me["id"], "action": "pii.reveal"})).json()
    assert logs["items"] and logs["items"][0]["actor"] == "Super Admin"


async def test_reveal_permissions_and_rate_limit(client):
    rider = await otp_login(client, "+919800000002", app="delivery")
    rider_me = (await client.get(f"{API}/delivery/me", headers=bearer(rider))).json()
    root = bearer(await admin_login(client))
    support = bearer(await _support_admin(client, root))

    # Support may see a rider's phone (to call them) but never full identity-document numbers.
    r = (await client.post(f"{API}/admin/delivery-partners/{rider_me['id']}/reveal", headers=support)).json()
    assert r["phone_e164"] == "+919800000002" and r["driving_license_number"] is None and not r["documents_visible"]
    r = (await client.post(f"{API}/admin/delivery-partners/{rider_me['id']}/reveal", headers=root)).json()
    assert r["documents_visible"] and r["driving_license_number"]

    # Support cannot unmask another admin.
    admins = (await client.get(f"{API}/admin/admins", headers=root)).json()
    root_id = next(a["id"] for a in admins if a["email"] == "root@example.com")
    assert (await client.post(f"{API}/admin/users/{root_id}/reveal", headers=support)).status_code == 403

    # The eye icon cannot be used to scrape everyone: per-admin reveal budget.
    codes = [(await client.post(f"{API}/admin/delivery-partners/{rider_me['id']}/reveal", headers=support)).status_code for _ in range(45)]
    assert 429 in codes


async def test_global_search_and_restaurant_detail(client):
    root = bearer(await admin_login(client))
    res = (await client.get(f"{API}/admin/search", headers=root, params={"q": "dosa"})).json()
    assert any(r["name"] == "The Dosa Republic" for r in res["restaurants"])
    rid = next(r["id"] for r in res["restaurants"] if r["name"] == "The Dosa Republic")
    detail = (await client.get(f"{API}/admin/restaurants/{rid}", headers=root)).json()
    assert detail["menu"] and any(i["name"] == "Mysore Masala Dosa" for c in detail["menu"] for i in c["items"])
    people = (await client.get(f"{API}/admin/search", headers=root, params={"q": "9800000001"})).json()["people"]
    assert people and people[0]["delivery_partner_id"]


async def test_silent_rider_not_counted_online(client):
    rider = await otp_login(client, "+919800000001", app="delivery")
    rh = bearer(rider)
    await client.put(f"{API}/delivery/availability", headers=rh, json={"is_online": True, "location": {"lat": 18.539, "lng": 73.895}})
    root = bearer(await admin_login(client))
    online_before = (await client.get(f"{API}/admin/dashboard/live", headers=root)).json()["riders"]["online"]
    me = (await client.get(f"{API}/delivery/me", headers=rh)).json()
    await get_redis().delete(f"rider:fresh:{me['id']}")  # the app stopped sending GPS
    dash = (await client.get(f"{API}/admin/dashboard/live", headers=root)).json()["riders"]
    assert dash["online"] == online_before - 1 and dash["stale"] >= 1
    await client.put(f"{API}/delivery/availability", headers=rh, json={"is_online": False})
