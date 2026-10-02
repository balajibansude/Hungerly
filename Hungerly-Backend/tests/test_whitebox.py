"""White-box tests aimed at branches the main suites don't reach: pagination cursors, cart/address
editing, dispatch sweeper (offer expiry, re-dispatch, auto-offline), rider decline/history/earnings,
admin restaurant/team management, recovery codes and session management."""

from __future__ import annotations

import asyncio
import os
import uuid
from datetime import timedelta

import pyotp
from sqlalchemy import select, update

from app.core.redis import get_redis
from app.models import DeliveryAssignment, DeliveryPartner, Order
from app.services import dispatch
from app.services.orders import now
from tests.conftest import API, admin_login, bearer, otp_login
from tests.test_order_flow import HOME, _customer_with_cart


async def _all_riders_offline(db) -> None:
    """Clean dispatch state: no rider online and none still carrying a delivery from an earlier test."""
    await db.execute(update(DeliveryPartner).values(is_online=False))
    await db.execute(
        update(DeliveryAssignment)
        .where(DeliveryAssignment.status.in_(("offered", "accepted", "arrived_at_restaurant", "picked_up", "arrived_at_customer")))
        .values(status="cancelled", cancelled_at=now(), cancel_reason="test reset")
    )
    await db.commit()


async def _place(client, phone: str) -> tuple[dict, str]:
    tokens, cart = await _customer_with_cart(client, phone)
    r = await client.post(f"{API}/customer/orders", headers={**bearer(tokens), "Idempotency-Key": str(uuid.uuid4())},
                          json={"payment_method": "cod", "expected_total_minor": cart["bill"]["total_minor"]})
    assert r.status_code == 201, r.text
    return tokens, r.json()["order"]["id"]


async def _rider_online(client, phone: str, lat: float, lng: float) -> dict:
    t = await otp_login(client, phone, app="delivery")
    r = await client.put(f"{API}/delivery/availability", headers=bearer(t), json={"is_online": True, "location": {"lat": lat, "lng": lng}})
    assert r.status_code == 200, r.text
    return t


# --- Customer: pagination, cart, addresses ------------------------------------------------------


async def test_order_history_pagination_and_cursor_tamper(client):
    tokens, oid = await _place(client, "+919870000001")
    h = bearer(tokens)
    item_id = (await client.get(f"{API}/customer/orders/{oid}", headers=h)).json()["items"][0]["name"]
    for _ in range(2):  # same customer, two more orders (no re-login: OTP has a resend cooldown)
        rests = (await client.get(f"{API}/catalog/restaurants", params=HOME)).json()["items"]
        rest = next(x for x in rests if x["slug"] == "the-dosa-republic")
        food = next(f for c in (await client.get(f"{API}/catalog/restaurants/{rest['id']}/menu")).json()["categories"] for f in c["foods"] if not f["option_groups"])
        await client.post(f"{API}/customer/cart/items", headers=h, json={"menu_item_id": food["id"], "quantity": 3, "replace_cart": True})
        addr = (await client.get(f"{API}/customer/addresses", headers=h)).json()[0]["id"]
        cart = (await client.put(f"{API}/customer/cart/address", headers=h, json={"address_id": addr})).json()
        r = await client.post(f"{API}/customer/orders", headers={**h, "Idempotency-Key": str(uuid.uuid4())},
                              json={"payment_method": "cod", "expected_total_minor": cart["bill"]["total_minor"]})
        assert r.status_code == 201, r.text
    assert item_id
    p1 = (await client.get(f"{API}/customer/orders", headers=h, params={"limit": 2})).json()
    assert len(p1["items"]) == 2 and p1["next_cursor"]
    p2 = (await client.get(f"{API}/customer/orders", headers=h, params={"limit": 2, "cursor": p1["next_cursor"]})).json()
    ids1 = {o["id"] for o in p1["items"]}
    assert p2["items"] and not ids1 & {o["id"] for o in p2["items"]}
    bad = p1["next_cursor"][:-3] + ("AAA" if not p1["next_cursor"].endswith("AAA") else "BBB")
    assert (await client.get(f"{API}/customer/orders", headers=h, params={"cursor": bad})).status_code == 400
    assert (await client.get(f"{API}/customer/orders", headers=h, params={"cursor": "not-base64!!"})).status_code == 400


async def test_cart_editing_conflicts_and_validation(client):
    tokens, cart = await _customer_with_cart(client, "+919870000002")
    h = bearer(tokens)
    line = cart["items"][0]
    # quantity change, then 0 removes the line and empties the cart
    r = await client.patch(f"{API}/customer/cart/items/{line['id']}", headers=h, json={"quantity": 3})
    assert r.status_code == 200 and r.json()["items"][0]["quantity"] == 3
    r = await client.patch(f"{API}/customer/cart/items/{line['id']}", headers=h, json={"quantity": 0})
    assert r.json()["items"] == [] and r.json()["blocking_reasons"] == ["cart.empty"]
    # unknown line → 404; out-of-range quantity → 422
    assert (await client.patch(f"{API}/customer/cart/items/{uuid.uuid4()}", headers=h, json={"quantity": 1})).status_code == 404
    assert (await client.patch(f"{API}/customer/cart/items/{line['id']}", headers=h, json={"quantity": 99})).status_code == 422

    rests = (await client.get(f"{API}/catalog/restaurants", params=HOME)).json()["items"]
    a = next(x for x in rests if x["slug"] == "the-dosa-republic")
    b = next(x for x in rests if x["slug"] == "chai-and-chaat-corner")
    food_a = (await client.get(f"{API}/catalog/restaurants/{a['id']}/menu")).json()["categories"][0]["foods"][1]
    food_b = (await client.get(f"{API}/catalog/restaurants/{b['id']}/menu")).json()["categories"][0]["foods"][1]
    assert (await client.post(f"{API}/customer/cart/items", headers=h, json={"menu_item_id": food_a["id"], "quantity": 1})).status_code == 200
    r = await client.post(f"{API}/customer/cart/items", headers=h, json={"menu_item_id": food_b["id"], "quantity": 1})
    assert r.status_code == 409 and r.json()["code"] == "cart.restaurant_conflict"
    r = await client.post(f"{API}/customer/cart/items", headers=h, json={"menu_item_id": food_b["id"], "quantity": 1, "replace_cart": True})
    assert r.status_code == 200 and r.json()["restaurant"]["id"] == b["id"]
    # option that belongs to another item → 422; same item added twice merges lines
    masala = (await client.get(f"{API}/catalog/restaurants/{a['id']}/menu")).json()["categories"][0]["foods"][0]
    r = await client.post(f"{API}/customer/cart/items", headers=h, json={"menu_item_id": food_b["id"], "quantity": 1, "option_ids": [masala["option_groups"][0]["options"][0]["id"]]})
    assert r.status_code == 422
    r = await client.post(f"{API}/customer/cart/items", headers=h, json={"menu_item_id": food_b["id"], "quantity": 2})
    assert len(r.json()["items"]) == 1 and r.json()["items"][0]["quantity"] == 3
    assert (await client.delete(f"{API}/customer/cart", headers=h)).status_code == 204
    assert (await client.get(f"{API}/customer/cart", headers=h)).json()["items"] == []


async def test_address_update_delete_and_ownership(client):
    tokens, _ = await _customer_with_cart(client, "+919870000003")
    h = bearer(tokens)
    addrs = (await client.get(f"{API}/customer/addresses", headers=h)).json()
    aid = addrs[0]["id"]
    body = {"label": "work", "line1": "Office 5", "locality": "Viman Nagar", "city": "Pune", "state": "Maharashtra",
            "postal_code": "411014", "location": {"lat": 18.5590, "lng": 73.9105}}
    r = await client.patch(f"{API}/customer/addresses/{aid}", headers=h, json=body)
    assert r.status_code == 200 and r.json()["label"] == "work" and r.json()["serviceable"] is True
    # outside India's bounding box → 422; out-of-zone (Mumbai) is saveable but unserviceable
    assert (await client.patch(f"{API}/customer/addresses/{aid}", headers=h, json={**body, "location": {"lat": 51.5, "lng": -0.12}})).status_code == 422
    r = await client.post(f"{API}/customer/addresses", headers=h, json={**body, "location": {"lat": 19.07, "lng": 72.88}})
    assert r.status_code == 201 and r.json()["serviceable"] is False
    other = await otp_login(client, "+919870000004")
    assert (await client.patch(f"{API}/customer/addresses/{aid}", headers=bearer(other), json=body)).status_code == 404
    assert (await client.delete(f"{API}/customer/addresses/{aid}", headers=bearer(other))).status_code == 404
    assert (await client.delete(f"{API}/customer/addresses/{aid}", headers=h)).status_code == 204
    assert aid not in {a["id"] for a in (await client.get(f"{API}/customer/addresses", headers=h)).json()}


# --- Dispatch: decline, expiry sweeper, auto-offline ----------------------------------------------


async def test_decline_redispatches_and_expired_offers_move_on(client, db):
    await _all_riders_offline(db)
    _, oid = await _place(client, "+919870000005")
    near = await _rider_online(client, "+919800000001", 18.5465, 73.9005)  # next to The Dosa Republic
    far = await _rider_online(client, "+919800000002", 18.5300, 73.8850)
    root = bearer(await admin_login(client))
    assert (await client.post(f"{API}/admin/orders/{oid}/accept", headers=root, json={"prep_minutes": 10})).status_code == 200

    offers = (await client.get(f"{API}/delivery/offers", headers=bearer(near))).json()
    assert len(offers) == 1, "nearest rider gets the first offer"
    r = await client.post(f"{API}/delivery/offers/{offers[0]['id']}/reject", headers=bearer(near), json={"reason": "busy"})
    assert r.status_code == 200
    far_offers = (await client.get(f"{API}/delivery/offers", headers=bearer(far))).json()
    assert len(far_offers) == 1 and far_offers[0]["order"]["id"] == oid, "declined order moves to the next rider"
    # accepting an already-declined offer is refused
    assert (await client.post(f"{API}/delivery/offers/{offers[0]['id']}/accept", headers=bearer(near))).status_code == 409

    # Let the second offer expire: the sweeper marks it expired; nobody else is free, so no new offer.
    await db.execute(update(DeliveryAssignment).where(DeliveryAssignment.id == uuid.UUID(far_offers[0]["id"])).values(offer_expires_at=now() - timedelta(seconds=1)))
    await db.commit()
    assert await dispatch.expire_offers_once() >= 1
    status = (await db.execute(select(DeliveryAssignment.status).where(DeliveryAssignment.id == uuid.UUID(far_offers[0]["id"])))).scalar_one()
    assert status == "expired"
    assert (await client.post(f"{API}/delivery/offers/{far_offers[0]['id']}/accept", headers=bearer(far))).status_code in (409, 410)
    for t in (near, far):
        await client.put(f"{API}/delivery/availability", headers=bearer(t), json={"is_online": False})


async def test_silent_riders_are_switched_offline(client, db):
    await _all_riders_offline(db)
    t = await _rider_online(client, "+919800000003", 18.53, 73.885)
    me = (await client.get(f"{API}/delivery/me", headers=bearer(t))).json()
    assert me["is_online"]
    await get_redis().delete(f"rider:seen:{me['id']}", f"rider:fresh:{me['id']}")  # app went silent
    assert await dispatch.offline_stale_riders() >= 1
    assert (await client.get(f"{API}/delivery/me", headers=bearer(t))).json()["is_online"] is False


async def test_rider_history_and_earnings_validation(client):
    t = await otp_login(client, "+919800000001", app="delivery")
    h = bearer(t)
    hist = (await client.get(f"{API}/delivery/history", headers=h, params={"limit": 1})).json()
    if hist["next_cursor"]:
        page2 = (await client.get(f"{API}/delivery/history", headers=h, params={"limit": 1, "cursor": hist["next_cursor"]})).json()
        assert page2["items"][0]["id"] != hist["items"][0]["id"]
    assert (await client.get(f"{API}/delivery/earnings", headers=h, params={"from": "2026-10-05", "to": "2026-10-01"})).status_code == 422
    assert (await client.get(f"{API}/delivery/earnings", headers=h, params={"from": "2026-01-01", "to": "2026-10-01"})).status_code == 422
    assert (await client.get(f"{API}/delivery/earnings", headers=h, params={"from": "2026-09-01", "to": "2026-09-30"})).status_code == 200
    # going offline without being online is harmless; location while offline is refused
    await client.put(f"{API}/delivery/availability", headers=h, json={"is_online": False})
    r = await client.post(f"{API}/delivery/location", headers=h, json={"points": [{"lat": 18.53, "lng": 73.88, "recorded_at": now().isoformat()}]})
    assert r.status_code == 403
    # going online requires a location
    assert (await client.put(f"{API}/delivery/availability", headers=h, json={"is_online": True})).status_code == 422


# --- Admin management ----------------------------------------------------------------------------


async def test_admin_order_controls_and_conflicts(client, db):
    await _all_riders_offline(db)
    _, oid = await _place(client, "+919870000006")
    root = bearer(await admin_login(client))
    o = (await client.get(f"{API}/admin/orders/{oid}", headers=root)).json()
    # stale If-Match → 409; ready before accept → invalid transition
    r = await client.post(f"{API}/admin/orders/{oid}/accept", headers={**root, "If-Match": str(o["version"] + 5)}, json={"prep_minutes": 10})
    assert r.status_code == 409 and r.json()["code"] == "order.version_conflict"
    assert (await client.post(f"{API}/admin/orders/{oid}/ready", headers=root)).status_code == 409
    assert (await client.post(f"{API}/admin/orders/{oid}/accept", headers={**root, "If-Match": str(o["version"])}, json={"prep_minutes": 10})).status_code == 200
    assert (await client.post(f"{API}/admin/orders/{oid}/ready", headers=root)).status_code == 200
    # prep time bounds and reason length are validated
    assert (await client.post(f"{API}/admin/orders/{oid}/cancel", headers=root, json={"reason": "x"})).status_code == 422
    r = await client.post(f"{API}/admin/orders/{oid}/cancel", headers=root, json={"reason": "Restaurant closed early"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert (await client.post(f"{API}/admin/orders/{oid}/cancel", headers=root, json={"reason": "again please"})).status_code == 409
    # list filters
    listed = (await client.get(f"{API}/admin/orders", headers=root, params={"status": "cancelled", "limit": 100})).json()["items"]
    assert any(i["id"] == oid for i in listed)
    num = o["order_number"]
    assert (await client.get(f"{API}/admin/orders", headers=root, params={"q": num})).json()["items"][0]["id"] == oid
    assert (await client.get(f"{API}/admin/orders", headers=root, params={"q": "'; DROP TABLE orders;--"})).status_code == 422


async def test_admin_restaurant_controls(client):
    root = bearer(await admin_login(client))
    rest = next(r for r in (await client.get(f"{API}/admin/restaurants", headers=root)).json() if r["name"] == "Wok This Way")
    rid = rest["id"]
    assert (await client.patch(f"{API}/admin/restaurants/{rid}", headers=root, json={"status": "suspended"})).status_code == 422
    r = await client.patch(f"{API}/admin/restaurants/{rid}", headers=root, json={"status": "suspended", "reason": "hygiene audit"})
    assert r.json() == {"id": rid, "status": "suspended", "is_accepting_orders": False}
    assert (await client.patch(f"{API}/admin/restaurants/{rid}", headers=root, json={"is_accepting_orders": True})).status_code == 409
    assert (await client.get(f"{API}/catalog/restaurants/{rid}")).status_code == 404, "suspended restaurants disappear from the catalog"
    assert (await client.patch(f"{API}/admin/restaurants/{rid}", headers=root, json={"status": "active", "is_accepting_orders": True})).status_code == 200
    assert (await client.get(f"{API}/catalog/restaurants/{rid}")).status_code == 200
    assert (await client.patch(f"{API}/admin/restaurants/{uuid.uuid4()}", headers=root, json={"is_accepting_orders": False})).status_code == 404


async def test_admin_team_guards(client):
    root_tokens = await admin_login(client)
    root = bearer(root_tokens)
    admins = (await client.get(f"{API}/admin/admins", headers=root)).json()
    me = next(a for a in admins if a["email"] == "root@example.com")
    assert (await client.patch(f"{API}/admin/admins/{me['id']}", headers=root, json={"admin_role": "support"})).status_code == 409
    email = f"ops-{uuid.uuid4().hex[:6]}@example.com"
    r = await client.post(f"{API}/admin/admins", headers=root, json={"email": email, "full_name": "Ops Person", "admin_role": "operations", "temporary_password": "operations-pass-123"})
    assert r.status_code == 201
    assert (await client.post(f"{API}/admin/admins", headers=root, json={"email": email, "full_name": "Dup", "admin_role": "support", "temporary_password": "operations-pass-123"})).status_code == 409
    assert (await client.post(f"{API}/admin/admins", headers=root, json={"email": "weak@example.com", "full_name": "Weak", "admin_role": "support", "temporary_password": "short"})).status_code == 422
    ops = bearer(await admin_login(client, email=email, password="operations-pass-123"))
    # operations can work orders but cannot manage the team or read the audit log
    assert (await client.get(f"{API}/admin/admins", headers=ops)).status_code == 403
    assert (await client.get(f"{API}/admin/audit-logs", headers=ops)).status_code == 403
    assert (await client.get(f"{API}/admin/orders", headers=ops)).status_code == 200
    # deactivating revokes their sessions immediately
    new_id = r.json()["id"]
    assert (await client.patch(f"{API}/admin/admins/{new_id}", headers=root, json={"is_active": False})).status_code == 200
    assert (await client.get(f"{API}/admin/orders", headers=ops)).status_code == 401
    r = await client.post(f"{API}/auth/login", json={"email": email, "password": "operations-pass-123"})
    assert r.status_code == 401, "inactive admins cannot sign in"
    logs = (await client.get(f"{API}/admin/audit-logs", headers=root, params={"action": "admin.", "limit": 5})).json()
    assert any(l["action"] == "admin.update" for l in logs["items"])


# --- Auth: recovery codes and sessions -----------------------------------------------------------


async def test_recovery_code_single_use_and_session_management(client):
    email, pw = f"rc-{uuid.uuid4().hex[:6]}@example.com", "recovery-pass-12345"
    root = bearer(await admin_login(client))
    await client.post(f"{API}/admin/admins", headers=root, json={"email": email, "full_name": "Recovery Test", "admin_role": "support", "temporary_password": pw})
    body = (await client.post(f"{API}/auth/login", json={"email": email, "password": pw})).json()
    confirm = (await client.post(f"{API}/auth/mfa/confirm", json={"mfa_token": body["mfa_token"], "code": pyotp.TOTP(body["totp_secret"]).now()})).json()
    codes = confirm["recovery_codes"]
    assert len(codes) == 10 and len(set(codes)) == 10

    t = (await client.post(f"{API}/auth/login", json={"email": email, "password": pw})).json()["mfa_token"]
    assert (await client.post(f"{API}/auth/mfa/verify", json={"mfa_token": t, "code": "123456", "recovery_code": codes[0]})).status_code == 422
    t = (await client.post(f"{API}/auth/login", json={"email": email, "password": pw})).json()["mfa_token"]
    r = await client.post(f"{API}/auth/mfa/verify", json={"mfa_token": t, "recovery_code": codes[0]})
    assert r.status_code == 200
    session = r.json()
    t = (await client.post(f"{API}/auth/login", json={"email": email, "password": pw})).json()["mfa_token"]
    assert (await client.post(f"{API}/auth/mfa/verify", json={"mfa_token": t, "recovery_code": codes[0]})).status_code == 400, "recovery codes are single-use"
    # an MFA token cannot be replayed
    assert (await client.post(f"{API}/auth/mfa/verify", json={"mfa_token": t, "recovery_code": codes[1]})).status_code == 401

    h = bearer(session)
    sessions = (await client.get(f"{API}/auth/sessions", headers=h)).json()
    current = next(s for s in sessions if s["current"])
    assert (await client.delete(f"{API}/auth/sessions/{uuid.uuid4()}", headers=h)).status_code == 404
    assert (await client.delete(f"{API}/auth/sessions/{current['id']}", headers=h)).status_code == 204
    assert (await client.get(f"{API}/auth/sessions", headers=h)).status_code == 401


async def test_refresh_edge_cases(client):
    tokens = await otp_login(client, "+919870000007")
    r = await client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"], "client_app": "delivery"})
    assert r.status_code == 401, "a customer refresh token cannot mint delivery-app tokens"
    assert (await client.post(f"{API}/auth/refresh", json={"refresh_token": "x" * 43, "client_app": "customer"})).status_code == 401
    assert (await client.post(f"{API}/auth/admin/refresh")).status_code == 403
    os.environ.setdefault("_unused", "1")


# --- Concurrency (regressions found by tests/stress/stress.py) ---------------------------------


async def test_first_cart_adds_in_parallel_do_not_500(client):
    """A new customer's first taps race to create the cart: one creator wins, nothing 500s, no add is lost."""
    tokens = await otp_login(client, "+919870000031")
    h = bearer(tokens)
    rests = (await client.get(f"{API}/catalog/restaurants", params=HOME)).json()["items"]
    rest = next(x for x in rests if x["slug"] == "the-dosa-republic")
    food = next(f for c in (await client.get(f"{API}/catalog/restaurants/{rest['id']}/menu")).json()["categories"] for f in c["foods"] if not f["option_groups"])
    res = await asyncio.gather(*(client.post(f"{API}/customer/cart/items", headers=h, json={"menu_item_id": food["id"], "quantity": 1}) for _ in range(8)))
    assert all(r.status_code == 200 for r in res), [r.status_code for r in res]
    cart = (await client.get(f"{API}/customer/cart", headers=h)).json()
    assert sum(i["quantity"] for i in cart["items"]) == 8


async def test_parallel_retries_with_one_idempotency_key_return_the_same_order(client, db):
    tokens, cart = await _customer_with_cart(client, "+919870000032")
    key = str(uuid.uuid4())
    body = {"payment_method": "cod", "expected_total_minor": cart["bill"]["total_minor"]}
    res = await asyncio.gather(*(client.post(f"{API}/customer/orders", headers={**bearer(tokens), "Idempotency-Key": key}, json=body) for _ in range(6)))
    assert all(r.status_code == 201 for r in res), [(r.status_code, r.json().get("code")) for r in res]
    assert len({r.json()["order"]["id"] for r in res}) == 1
    assert sum(1 for r in res if r.json().get("replayed")) == 5
    assert len((await db.execute(select(Order.id).where(Order.idempotency_key == key))).all()) == 1
