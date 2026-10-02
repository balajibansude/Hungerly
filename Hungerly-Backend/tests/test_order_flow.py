"""End-to-end: customer orders → admin accepts → rider gets the offer → pickup → delivery with OTP."""

from __future__ import annotations

import uuid

from tests.conftest import API, admin_login, bearer, otp_login

HOME = {"lat": 18.5362, "lng": 73.8939}


async def _customer_with_cart(client, phone: str) -> tuple[dict, dict]:
    tokens = await otp_login(client, phone)
    h = bearer(tokens)
    assert (await client.patch(f"{API}/me", headers=h, json={"full_name": "Asha Rao"})).status_code == 200
    addr = await client.post(f"{API}/customer/addresses", headers=h, json={
        "label": "home", "line1": "Flat 402, Amar Residency", "line2": "Lane 6", "landmark": "Near Osho Garden",
        "locality": "Koregaon Park", "city": "Pune", "state": "Maharashtra", "postal_code": "411001", "location": HOME,
    })
    assert addr.status_code == 201 and addr.json()["serviceable"] is True, addr.text
    restaurants = (await client.get(f"{API}/catalog/restaurants", params=HOME)).json()["items"]
    dosa = next(r for r in restaurants if r["slug"] == "the-dosa-republic")
    menu = (await client.get(f"{API}/catalog/restaurants/{dosa['id']}/menu")).json()
    foods = [f for c in menu["categories"] for f in c["foods"]]
    masala = next(f for f in foods if f["name"] == "Mysore Masala Dosa")
    cheese = next(o for g in masala["option_groups"] for o in g["options"] if o["name"] == "Cheese")
    r = await client.post(f"{API}/customer/cart/items", headers=h, json={
        "menu_item_id": masala["id"], "quantity": 2, "option_ids": [cheese["id"]]})
    assert r.status_code == 200, r.text
    r = await client.put(f"{API}/customer/cart/address", headers=h, json={"address_id": addr.json()["id"]})
    cart = r.json()
    assert cart["can_checkout"], cart["blocking_reasons"]
    # Server-side price: (149 + 35) * 2 = 368.00
    assert cart["bill"]["subtotal_minor"] == 36800
    return tokens, cart


async def test_full_delivery_flow(client):
    tokens, cart = await _customer_with_cart(client, "+919833333331")
    h = bearer(tokens)
    key = str(uuid.uuid4())
    body = {"payment_method": "cod", "expected_total_minor": cart["bill"]["total_minor"]}

    r = await client.post(f"{API}/customer/orders", headers={**h, "Idempotency-Key": key}, json=body)
    assert r.status_code == 201, r.text
    order = r.json()["order"]
    # Retrying with the same key returns the same order instead of charging twice.
    r = await client.post(f"{API}/customer/orders", headers={**h, "Idempotency-Key": key}, json=body)
    assert r.json()["order"]["id"] == order["id"] and r.json()["replayed"]

    # Another customer cannot see it (IDOR → 404, indistinguishable from missing).
    other = await otp_login(client, "+919833333332")
    assert (await client.get(f"{API}/customer/orders/{order['id']}", headers=bearer(other))).status_code == 404

    # A rider goes online next to the restaurant.
    rider = await otp_login(client, "+919800000001", app="delivery")
    rh = bearer(rider)
    me = (await client.get(f"{API}/delivery/me", headers=rh)).json()
    assert me["status"] == "active"
    r = await client.put(f"{API}/delivery/availability", headers=rh, json={"is_online": True, "location": {"lat": 18.5460, "lng": 73.9000}})
    assert r.status_code == 200, r.text

    # Admin accepts on behalf of the restaurant → dispatch offers it to the nearest rider.
    adm = await admin_login(client)
    ah = bearer(adm)
    dash = (await client.get(f"{API}/admin/dashboard/live", headers=ah)).json()
    assert dash["live_orders"]["placed"] >= 1
    r = await client.post(f"{API}/admin/orders/{order['id']}/accept", headers=ah, json={"prep_minutes": 15})
    assert r.status_code == 200, r.text

    offers = (await client.get(f"{API}/delivery/offers", headers=rh)).json()
    assert len(offers) == 1
    offer = offers[0]
    assert offer["drop"]["location"] is None  # exact address hidden until accepted
    r = await client.post(f"{API}/delivery/offers/{offer['id']}/accept", headers=rh)
    assert r.status_code == 200, r.text
    assert r.json()["drop"]["line1"] == "Flat 402, Amar Residency"

    loc = {"location": {"lat": 18.5466, "lng": 73.9006}}
    aid = offer["id"]
    assert (await client.post(f"{API}/delivery/assignments/{aid}/arrived-restaurant", headers=rh, json=loc)).status_code == 200
    assert (await client.post(f"{API}/delivery/assignments/{aid}/picked-up", headers=rh, json=loc)).status_code == 200

    detail = (await client.get(f"{API}/customer/orders/{order['id']}", headers=h)).json()
    assert detail["status"] == "picked_up"
    assert detail["delivery"]["partner"]["first_name"] == "Arjun"
    otp = detail["delivery_otp"]
    assert otp and len(otp) == 4

    drop = {"location": HOME}
    r = await client.post(f"{API}/delivery/assignments/{aid}/delivered", headers=rh,
                          json={**drop, "delivery_otp": "0000" if otp != "0000" else "1111", "cod_collected_minor": order["total"]["amount_minor"]})
    assert r.status_code == 400
    r = await client.post(f"{API}/delivery/assignments/{aid}/delivered", headers=rh,
                          json={**drop, "delivery_otp": otp, "cod_collected_minor": order["total"]["amount_minor"] - 100})
    assert r.status_code == 422
    r = await client.post(f"{API}/delivery/assignments/{aid}/delivered", headers=rh,
                          json={**drop, "delivery_otp": otp, "cod_collected_minor": order["total"]["amount_minor"]})
    assert r.status_code == 200, r.text

    final = (await client.get(f"{API}/customer/orders/{order['id']}", headers=h)).json()
    assert final["status"] == "delivered" and final["payment_status"] == "paid"
    assert [t["status"] for t in final["timeline"]] == ["placed", "preparing", "picked_up", "delivered"]
    earnings = (await client.get(f"{API}/delivery/earnings", headers=rh)).json()
    assert earnings["total_deliveries"] >= 1
    logs = (await client.get(f"{API}/admin/audit-logs", headers=ah, params={"entity_id": order["id"]})).json()
    assert any(entry["action"] == "order.accept" for entry in logs["items"])


async def test_price_change_and_cancel(client):
    tokens, cart = await _customer_with_cart(client, "+919833333333")
    h = bearer(tokens)
    r = await client.post(f"{API}/customer/orders", headers={**h, "Idempotency-Key": str(uuid.uuid4())},
                          json={"payment_method": "cod", "expected_total_minor": cart["bill"]["total_minor"] - 1})
    assert r.status_code == 409 and r.json()["code"] == "order.price_changed"
    r = await client.post(f"{API}/customer/orders", headers={**h, "Idempotency-Key": str(uuid.uuid4())},
                          json={"payment_method": "cod", "expected_total_minor": cart["bill"]["total_minor"]})
    oid = r.json()["order"]["id"]
    r = await client.post(f"{API}/customer/orders/{oid}/cancel", headers=h, json={"reason_code": "changed_mind"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    r = await client.post(f"{API}/customer/orders/{oid}/cancel", headers=h, json={"reason_code": "changed_mind"})
    assert r.status_code == 409


async def test_admin_manual_assignment(client):
    tokens, cart = await _customer_with_cart(client, "+919833333334")
    h = bearer(tokens)
    r = await client.post(f"{API}/customer/orders", headers={**h, "Idempotency-Key": str(uuid.uuid4())},
                          json={"payment_method": "cod", "expected_total_minor": cart["bill"]["total_minor"]})
    oid = r.json()["order"]["id"]

    rider = await otp_login(client, "+919800000002", app="delivery")
    rh = bearer(rider)
    await client.put(f"{API}/delivery/availability", headers=rh, json={"is_online": True, "location": {"lat": 18.5450, "lng": 73.9000}})

    adm = await admin_login(client)
    ah = bearer(adm)
    riders = (await client.get(f"{API}/admin/orders/{oid}/available-riders", headers=ah)).json()
    target = next(r for r in riders if r["name"] == "Sneha Kulkarni")
    r = await client.post(f"{API}/admin/orders/{oid}/assign", headers=ah, json={"delivery_partner_id": target["id"]})
    assert r.status_code == 200, r.text
    assert r.json()["assignments"][-1]["manual"] is True
    current = (await client.get(f"{API}/delivery/assignments/current", headers=rh)).json()
    assert current["order"]["id"] == oid
    # The rider cannot go offline mid-delivery.
    assert (await client.put(f"{API}/delivery/availability", headers=rh, json={"is_online": False})).status_code == 409


async def test_rider_onboarding_and_approval(client):
    rider = await otp_login(client, "+919844444441", app="delivery")
    rh = bearer(rider)
    me = (await client.get(f"{API}/delivery/me", headers=rh)).json()
    assert me["status"] == "onboarding"
    assert (await client.get(f"{API}/delivery/offers", headers=rh)).status_code == 403  # not active yet
    zone = (await client.get(f"{API}/delivery/zones", headers=rh)).json()[0]
    r = await client.post(f"{API}/delivery/onboarding", headers=rh, json={
        "full_name": "Vikram Joshi", "vehicle_type": "motorcycle", "vehicle_registration": "MH12XY4321",
        "driving_license_number": "MH12 20200012345", "zone_id": zone["id"]})
    assert r.status_code == 200, r.text

    adm = await admin_login(client)
    ah = bearer(adm)
    pending = (await client.get(f"{API}/admin/delivery-partners", headers=ah, params={"status": "pending_review"})).json()["items"]
    pid = next(p["id"] for p in pending if p["name"] == "Vikram Joshi")
    detail = (await client.get(f"{API}/admin/delivery-partners/{pid}", headers=ah)).json()
    assert detail["vehicle_registration"] == "••••4321"
    r = await client.post(f"{API}/admin/delivery-partners/{pid}/decision", headers=ah, json={"action": "approve"})
    assert r.status_code == 200 and r.json()["status"] == "active"
    assert (await client.get(f"{API}/delivery/offers", headers=rh)).status_code == 200


async def test_suspending_user_revokes_sessions(client):
    tokens = await otp_login(client, "+919855555551")
    h = bearer(tokens)
    me = (await client.get(f"{API}/me", headers=h)).json()
    adm = await admin_login(client)
    r = await client.post(f"{API}/admin/users/{me['id']}/status", headers=bearer(adm),
                          json={"status": "suspended", "reason": "fraud investigation"})
    assert r.status_code == 200 and r.json()["sessions_revoked"] >= 1
    assert (await client.get(f"{API}/me", headers=h)).status_code == 401
    r = await client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"], "client_app": "customer"})
    assert r.status_code == 401


async def test_rider_issue_report_reaches_admin(client):
    tokens, cart = await _customer_with_cart(client, "+919833333335")
    h = bearer(tokens)
    r = await client.post(f"{API}/customer/orders", headers={**h, "Idempotency-Key": str(uuid.uuid4())},
                          json={"payment_method": "cod", "expected_total_minor": cart["bill"]["total_minor"]})
    oid = r.json()["order"]["id"]
    rider = await otp_login(client, "+919800000003", app="delivery")
    rh = bearer(rider)
    await client.put(f"{API}/delivery/availability", headers=rh, json={"is_online": True, "location": {"lat": 18.5300, "lng": 73.8850}})
    adm = await admin_login(client)
    ah = bearer(adm)
    riders = (await client.get(f"{API}/admin/orders/{oid}/available-riders", headers=ah)).json()
    target = next(x for x in riders if x["name"] == "Rahul Deshmukh")
    await client.post(f"{API}/admin/orders/{oid}/assign", headers=ah, json={"delivery_partner_id": target["id"]})
    current = (await client.get(f"{API}/delivery/assignments/current", headers=rh)).json()

    # Another rider cannot report on (or even see) this assignment.
    other = await otp_login(client, "+919800000002", app="delivery")
    r = await client.post(f"{API}/delivery/assignments/{current['id']}/issue", headers=bearer(other), json={"kind": "accident"})
    assert r.status_code == 404

    r = await client.post(f"{API}/delivery/assignments/{current['id']}/issue", headers=rh,
                          json={"kind": "restaurant_delay", "note": "Kitchen says 15 more minutes"})
    assert r.status_code == 202
    detail = (await client.get(f"{API}/admin/orders/{oid}", headers=ah)).json()
    assert detail["issues"][0]["kind"] == "restaurant_delay"
    assert detail["issues"][0]["reported_by"] == "Rahul Deshmukh"
    # Free-text is validated: unknown kinds are rejected.
    r = await client.post(f"{API}/delivery/assignments/{current['id']}/issue", headers=rh, json={"kind": "drop_table"})
    assert r.status_code == 422
    # Clean up so the rider is free for later tests.
    await client.post(f"{API}/admin/orders/{oid}/cancel", headers=ah, json={"reason": "test cleanup"})
