"""Stress and race test against a running test API (never production).

Phases
  A  read burst          thousands of catalog / menu / search reads at high concurrency
  B  checkout storm      N customers sign in, add an address, fill a cart and place an order, all at once
  C  idempotency race    one customer fires the same Idempotency-Key 10x at once -> exactly one order
  F  cart race           one brand-new customer fires concurrent cart adds -> no 5xx, no lost updates
  D  dispatch races      double accept, rider accept vs admin reassign -> at most one active rider per order
  E  refresh race        the same refresh token used 10x at once -> at most one rotation, session revoked
  G  sustained load      rider pings + order polling + admin dashboard for a fixed duration

Each simulated client gets its own IP via X-Forwarded-For, so start the server with TRUSTED_PROXIES=127.0.0.1
(per-IP limits then apply per simulated client, as they would behind a real load balancer).
Database invariants are checked directly afterwards.

Usage: python tests/stress/stress.py http://127.0.0.1:8001 <qa-admin.json> <postgres-url-of-the-test-db>
"""

from __future__ import annotations

import asyncio
import json
import random
import statistics
import sys
import time
import uuid
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path

import asyncpg
import httpx
import pyotp

BASE = sys.argv[1].rstrip("/")
QA = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
DSN = sys.argv[3].replace("postgresql+asyncpg://", "postgresql://")
if not DSN.rstrip("/").endswith("_test"):
    sys.exit("refusing to run: the database must be a *_test database")
API = BASE + "/api/v1"
HOME = {"lat": 18.5362, "lng": 73.8939}
CUSTOMERS = int(sys.argv[4]) if len(sys.argv) > 4 else 50
SUSTAIN_S = int(sys.argv[5]) if len(sys.argv) > 5 else 45

lat: dict[str, list[float]] = defaultdict(list)
codes: dict[str, Counter] = defaultdict(Counter)
bugs: list[str] = []
notes: list[str] = []
_ip_counter = 0


def new_ip() -> str:
    global _ip_counter
    _ip_counter += 1
    n = _ip_counter
    return f"10.{(n >> 16) & 255}.{(n >> 8) & 255}.{n & 255 or 1}"


def bug(msg: str) -> None:
    bugs.append(msg)
    print("  BUG:", msg)


class Client:
    """One simulated device: its own IP and (optionally) its own bearer token."""

    def __init__(self, http: httpx.AsyncClient, ip: str | None = None):
        self.http, self.ip, self.token = http, ip or new_ip(), None

    async def req(self, label: str, method: str, path: str, *, headers: dict | None = None, **kw) -> httpx.Response:
        h = {"X-Forwarded-For": self.ip, **(headers or {})}
        if self.token:
            h.setdefault("Authorization", f"Bearer {self.token}")
        t0 = time.perf_counter()
        try:
            r = await self.http.request(method, API + path, headers=h, **kw)
        except httpx.HTTPError as e:
            codes[label]["transport:" + type(e).__name__] += 1
            bug(f"{label}: transport error {type(e).__name__}")
            raise
        lat[label].append((time.perf_counter() - t0) * 1000)
        codes[label][r.status_code] += 1
        if r.status_code >= 500:
            bug(f"{label}: {r.status_code} {r.text[:200]}")
        return r

    async def otp_login(self, phone: str, app: str = "customer") -> dict:
        dev = "st-" + uuid.uuid4().hex[:16]
        r = await self.req("auth.otp_request", "POST", "/auth/otp/request", json={"phone_e164": phone, "client_app": app, "device_id": dev})
        assert r.status_code == 202, r.text
        r = await self.req("auth.otp_verify", "POST", "/auth/otp/verify", json={
            "otp_request_id": r.json()["otp_request_id"], "phone_e164": phone, "otp": "123456", "client_app": app, "device_id": dev})
        assert r.status_code == 200, r.text
        self.token = r.json()["access_token"]
        return r.json()


def phone(prefix: str) -> str:
    return f"+91{prefix}{random.randint(10_000_000, 99_999_999)}"


async def admin(http: httpx.AsyncClient) -> Client:
    a = Client(http)
    r = await a.req("auth.login", "POST", "/auth/login", json={"email": QA["email"], "password": QA["password"]})
    assert r.status_code == 200, r.text
    r = await a.req("auth.mfa", "POST", "/auth/mfa/verify", json={"mfa_token": r.json()["mfa_token"], "code": pyotp.TOTP(QA["totp_secret"]).now()})
    assert r.status_code == 200, r.text
    a.token = r.json()["access_token"]
    return a


async def bounded(n: int, coros):
    sem = asyncio.Semaphore(n)

    async def run(c):
        async with sem:
            try:
                return await c
            except Exception as e:  # noqa: BLE001 - a stress run records failures instead of stopping
                return e

    return await asyncio.gather(*(run(c) for c in coros))


# --- A: read burst ------------------------------------------------------------------------------


async def phase_a(http, rest_ids: list[str]) -> None:
    print("\n[A] read burst")
    clients = [Client(http) for _ in range(300)]  # ~7 reads per simulated IP, under the per-IP limit
    jobs = []
    for i in range(2000):
        c = clients[i % len(clients)]
        kind = i % 4
        if kind == 0:
            jobs.append(c.req("catalog.restaurants", "GET", "/catalog/restaurants", params=HOME))
        elif kind == 1:
            jobs.append(c.req("catalog.menu", "GET", f"/catalog/restaurants/{random.choice(rest_ids)}/menu"))
        elif kind == 2:
            jobs.append(c.req("catalog.search", "GET", "/catalog/restaurants", params={**HOME, "q": random.choice(["dosa", "pizza", "biryani", "chai", "zzz"])}))
        else:
            jobs.append(c.req("catalog.cuisines", "GET", "/catalog/cuisines"))
    t0 = time.perf_counter()
    await bounded(150, jobs)
    dt = time.perf_counter() - t0
    print(f"  2000 reads in {dt:.1f}s -> {2000 / dt:.0f} req/s")


# --- B: checkout storm --------------------------------------------------------------------------


async def make_customer(http, food: dict, opts: list[str] | None = None, qty: int = 2) -> tuple[Client, dict]:
    c = Client(http)
    await c.otp_login(phone("95"))
    await c.req("me.patch", "PATCH", "/me", json={"full_name": "Stress Tester"})
    r = await c.req("address.create", "POST", "/customer/addresses", json={
        "label": "home", "line1": "Flat 1, Load Lane", "locality": "Koregaon Park", "city": "Pune", "state": "Maharashtra",
        "postal_code": "411001", "location": HOME})
    assert r.status_code == 201, r.text
    addr = r.json()["id"]
    r = await c.req("cart.add", "POST", "/customer/cart/items", json={"menu_item_id": food["id"], "quantity": qty, "option_ids": opts or [], "replace_cart": True})
    assert r.status_code == 200, r.text
    r = await c.req("cart.address", "PUT", "/customer/cart/address", json={"address_id": addr})
    assert r.status_code == 200 and r.json()["can_checkout"], r.text
    return c, r.json()


async def place(c: Client, cart: dict, key: str | None = None) -> httpx.Response:
    return await c.req("order.place", "POST", "/customer/orders", headers={"Idempotency-Key": key or str(uuid.uuid4())},
                       json={"payment_method": "cod", "expected_total_minor": cart["bill"]["total_minor"]})


async def phase_b(http, food) -> list[tuple[Client, str]]:
    print(f"\n[B] checkout storm: {CUSTOMERS} customers at once")

    async def one():
        c, cart = await make_customer(http, food)
        r = await place(c, cart)
        if r.status_code != 201:
            bug(f"order.place in storm -> {r.status_code} {r.text[:160]}")
            return None
        return c, r.json()["order"]["id"]

    t0 = time.perf_counter()
    res = await bounded(CUSTOMERS, [one() for _ in range(CUSTOMERS)])
    dt = time.perf_counter() - t0
    ok = [x for x in res if isinstance(x, tuple)]
    errs = [x for x in res if isinstance(x, Exception)]
    print(f"  {len(ok)}/{CUSTOMERS} full checkouts in {dt:.1f}s")
    for e in errs[:5]:
        bug(f"checkout flow failed: {type(e).__name__} {str(e)[:160]}")
    return ok


# --- C: idempotency race ------------------------------------------------------------------------


async def phase_c(http, food, db) -> None:
    print("\n[C] idempotency race: same key x10 concurrently")
    for trial in range(3):
        c, cart = await make_customer(http, food)
        key = str(uuid.uuid4())
        res = await asyncio.gather(*(place(c, cart, key) for _ in range(10)))
        statuses = Counter(r.status_code for r in res)
        ids = {r.json()["order"]["id"] for r in res if r.status_code in (200, 201)}
        n = await db.fetchval("SELECT count(*) FROM orders WHERE idempotency_key = $1", key)
        print(f"  trial {trial + 1}: statuses {dict(statuses)}, distinct order ids returned {len(ids)}, orders in DB {n}")
        if n != 1:
            bug(f"idempotency: {n} orders created for one key")
        if len(ids) > 1:
            bug("idempotency: different order ids returned for the same key")
        non_ok = {s: k for s, k in statuses.items() if s not in (200, 201)}
        if non_ok:
            bodies = {r.json().get("code") for r in res if r.status_code not in (200, 201)}
            bug(f"idempotency: retries with the same key got {non_ok} {bodies} instead of the original order")


# --- F: cart race -------------------------------------------------------------------------------


async def phase_f(http, food, db) -> None:
    print("\n[F] cart race: brand-new customer, 10 concurrent adds of 1")
    for trial in range(3):
        c = Client(http)
        await c.otp_login(phone("93"))
        res = await asyncio.gather(*(c.req("cart.add_race", "POST", "/customer/cart/items",
                                           json={"menu_item_id": food["id"], "quantity": 1}) for _ in range(10)))
        statuses = Counter(r.status_code for r in res)
        cart = (await c.req("cart.get", "GET", "/customer/cart")).json()
        qty = sum(i["quantity"] for i in cart["items"])
        oks = statuses.get(200, 0)
        print(f"  trial {trial + 1}: statuses {dict(statuses)}, final quantity {qty} (successful adds {oks})")
        if qty != oks:
            bug(f"cart: lost update — {oks} adds succeeded but quantity is {qty}")


# --- D: dispatch races --------------------------------------------------------------------------


async def make_rider(http, adm: Client, zone_id: str, near: tuple[float, float]) -> tuple[Client, str]:
    r = Client(http)
    await r.otp_login(phone("94"), app="delivery")
    res = await r.req("rider.onboarding", "POST", "/delivery/onboarding", json={"full_name": "Stress Rider", "vehicle_type": "bicycle", "zone_id": zone_id})
    assert res.status_code == 200, res.text
    pid = res.json()["id"]
    res = await adm.req("admin.partner_decision", "POST", f"/admin/delivery-partners/{pid}/decision", json={"action": "approve"})
    assert res.status_code == 200, res.text
    jitter = (near[0] + random.uniform(-0.002, 0.002), near[1] + random.uniform(-0.002, 0.002))
    res = await r.req("rider.availability", "PUT", "/delivery/availability", json={"is_online": True, "location": {"lat": jitter[0], "lng": jitter[1]}})
    assert res.status_code == 200, res.text
    return r, pid


async def offers_for(riders):
    out = []
    for rc, pid in riders:
        for o in (await rc.req("rider.offers", "GET", "/delivery/offers")).json():
            out.append((rc, pid, o))
    return out


async def phase_d(http, adm: Client, orders: list[tuple[Client, str]], zone_id: str, near, db) -> None:
    print("\n[D] dispatch races")
    # Park every rider left from earlier runs so only our fresh riders compete.
    await db.execute("UPDATE delivery_partners SET is_online = false")
    riders = await bounded(12, [make_rider(http, adm, zone_id, near) for _ in range(12)])
    riders = [x for x in riders if isinstance(x, tuple)]
    print(f"  {len(riders)} fresh riders online")
    targets = orders[:8]

    # D1: two admins accept the same order at once -> one 200, one 409, one dispatch
    adm2 = await admin_second(http)
    for _, oid in targets:
        res = await asyncio.gather(
            adm.req("admin.order_accept_race", "POST", f"/admin/orders/{oid}/accept", json={"prep_minutes": 10}),
            adm2.req("admin.order_accept_race", "POST", f"/admin/orders/{oid}/accept", json={"prep_minutes": 12}),
        )
        s = sorted(r.status_code for r in res)
        if s.count(200) != 1:
            bug(f"double accept on {oid[:8]} -> {s}")
    await asyncio.sleep(0.5)

    # D2: the offered rider accepts while two admins reassign to two other riders
    raced = 0
    for _, oid in targets:
        offers = [x for x in await offers_for(riders) if x[2]["order"]["id"] == oid] 
        free = [(rc, pid) for rc, pid in riders if pid not in await busy_partners(db)]
        if not offers or len(free) < 2:
            continue
        rc, pid, offer = offers[0]
        others = [x for x in free if x[1] != pid][:2]
        if len(others) < 2:
            continue
        raced += 1
        res = await asyncio.gather(
            rc.req("rider.offer_accept_race", "POST", f"/delivery/offers/{offer['id']}/accept"),
            adm.req("admin.assign_race", "POST", f"/admin/orders/{oid}/assign", json={"delivery_partner_id": others[0][1]}),
            adm2.req("admin.assign_race", "POST", f"/admin/orders/{oid}/assign", json={"delivery_partner_id": others[1][1]}),
        )
        _ = res
    print(f"  raced {raced} orders (offer accept vs two reassigns)")

    # D3: one rider, two different offers accepted at once is covered by the unique index; check invariants
    rows = await db.fetch("""SELECT order_id, count(*) n FROM delivery_assignments
                             WHERE status IN ('accepted','arrived_at_restaurant','picked_up','arrived_at_customer')
                             GROUP BY order_id HAVING count(*) > 1""")
    if rows:
        bug(f"{len(rows)} orders have more than one active rider")
    rows = await db.fetch("""SELECT delivery_partner_id, count(*) n FROM delivery_assignments
                             WHERE status IN ('accepted','arrived_at_restaurant','picked_up','arrived_at_customer')
                             GROUP BY delivery_partner_id HAVING count(*) > 1""")
    if rows:
        bug(f"{len(rows)} riders hold more than one active delivery")
    offered = await db.fetch("""SELECT order_id FROM delivery_assignments a WHERE status = 'offered' AND EXISTS (
                                SELECT 1 FROM delivery_assignments b WHERE b.order_id = a.order_id
                                AND b.status IN ('accepted','arrived_at_restaurant','picked_up','arrived_at_customer'))""")
    if offered:
        bug(f"{len(offered)} orders still show an open offer although a rider is already assigned")
    # D4: drive every assigned order to delivered with its rider (state machine under concurrency)
    active = await db.fetch("""SELECT a.id, a.delivery_partner_id, o.total_minor, o.id AS oid FROM delivery_assignments a
                               JOIN orders o ON o.id = a.order_id WHERE a.status = 'accepted' AND o.id = ANY($1::uuid[])""",
                            [uuid.UUID(o) for _, o in targets])
    by_pid = {pid: rc for rc, pid in riders}
    by_order = {oid: c for c, oid in targets}

    async def complete(row):
        rc = by_pid.get(str(row["delivery_partner_id"]))
        if rc is None:
            return
        aid = row["id"]
        loc = {"lat": near[0], "lng": near[1]}
        for step, body in (("arrived-restaurant", {"location": loc}), ("picked-up", {"location": loc}),
                           ("arrived-customer", {"location": {"lat": HOME["lat"], "lng": HOME["lng"]}}),
                           ("delivered", {"delivery_otp": None, "cod_collected_minor": row["total_minor"],
                                         "location": {"lat": HOME["lat"], "lng": HOME["lng"]}})):
            if step == "delivered":  # the customer reads the handover code from their app
                cust = by_order[str(row["oid"])]
                body["delivery_otp"] = (await cust.req("order.get", "GET", f"/customer/orders/{row['oid']}")).json()["delivery_otp"]
            if step == "picked-up":
                await adm.req("admin.order_ready", "POST", f"/admin/orders/{row['oid']}/ready")
            r = await rc.req(f"rider.{step}", "POST", f"/delivery/assignments/{aid}/{step}", json=body)
            if r.status_code >= 400:
                notes.append(f"rider {step} -> {r.status_code} {r.json().get('code')}")
                return
        return True

    done = await asyncio.gather(*(complete(r) for r in active), return_exceptions=True)
    print(f"  {sum(1 for d in done if d is True)}/{len(active)} assigned orders delivered end to end concurrently")
    # Leave the riders offline so later runs start clean
    await bounded(12, [rc.req("rider.offline", "PUT", "/delivery/availability", json={"is_online": False}) for rc, _ in riders])


async def busy_partners(db) -> set[str]:
    rows = await db.fetch("SELECT delivery_partner_id FROM delivery_assignments WHERE status IN ('accepted','arrived_at_restaurant','picked_up','arrived_at_customer')")
    return {str(r[0]) for r in rows}


_second_admin: Client | None = None


async def admin_second(http) -> Client:
    """A second signed-in admin session (same QA account, separate token) for two-admin races."""
    global _second_admin
    if _second_admin is None:
        await asyncio.sleep(max(0.0, 30.5 - (time.time() % 30)))  # next TOTP step: a used code can't be replayed
        _second_admin = await admin(http)
    return _second_admin


# --- E: refresh race ----------------------------------------------------------------------------


async def phase_e(http) -> None:
    print("\n[E] refresh race: same refresh token x10 concurrently")
    for trial in range(3):
        c = Client(http)
        t = await c.otp_login(phone("92"))
        res = await asyncio.gather(*(c.req("auth.refresh_race", "POST", "/auth/refresh",
                                           json={"refresh_token": t["refresh_token"], "client_app": "customer"}) for _ in range(10)))
        statuses = Counter(r.status_code for r in res)
        winners = [r.json() for r in res if r.status_code == 200]
        # After a reuse, every token of the session must be dead.
        alive = 0
        for w in winners:
            if (await c.req("me.get", "GET", "/me", headers={"Authorization": f"Bearer {w['access_token']}"})).status_code == 200:
                alive += 1
        print(f"  trial {trial + 1}: statuses {dict(statuses)}, sessions still alive afterwards {alive}")
        if len(winners) > 1:
            bug(f"refresh race: {len(winners)} concurrent rotations of one token succeeded")
        if len(winners) >= 1 and statuses.get(401, 0) and alive:
            bug("refresh race: token reuse detected but the rotated session still works")


# --- G: sustained mixed load --------------------------------------------------------------------


async def phase_g(http, adm: Client, customers: list[tuple[Client, str]], zone_id, near, rest_ids) -> None:
    print(f"\n[G] sustained mixed load for {SUSTAIN_S}s")
    riders = await bounded(10, [make_rider(http, adm, zone_id, near) for _ in range(10)])
    riders = [x for x in riders if isinstance(x, tuple)]
    stop = time.time() + SUSTAIN_S
    count = Counter()

    async def rider_loop(rc):
        while time.time() < stop:
            pts = [{"lat": near[0] + random.uniform(-0.003, 0.003), "lng": near[1] + random.uniform(-0.003, 0.003),
                    "accuracy_m": 8, "recorded_at": datetime.now(UTC).isoformat()}]
            await rc.req("rider.location", "POST", "/delivery/location", json={"points": pts})
            await rc.req("rider.offers_poll", "GET", "/delivery/offers")
            count["rider"] += 2
            await asyncio.sleep(1)

    async def customer_loop(c, oid):
        while time.time() < stop:
            await c.req("order.poll", "GET", f"/customer/orders/{oid}")
            await c.req("orders.list", "GET", "/customer/orders", params={"limit": 10})
            count["customer"] += 2
            await asyncio.sleep(1.5)

    async def browse_loop():
        while time.time() < stop:
            b = Client(http)
            await b.req("catalog.restaurants", "GET", "/catalog/restaurants", params=HOME)
            await b.req("catalog.menu", "GET", f"/catalog/restaurants/{random.choice(rest_ids)}/menu")
            count["browse"] += 2

    async def admin_loop():
        while time.time() < stop:
            await adm.req("admin.dashboard", "GET", "/admin/dashboard/live")
            await adm.req("admin.orders", "GET", "/admin/orders", params={"limit": 25})
            count["admin"] += 2
            await asyncio.sleep(2)

    t0 = time.perf_counter()
    await asyncio.gather(*(rider_loop(rc) for rc, _ in riders), *(customer_loop(c, o) for c, o in customers),
                         *(browse_loop() for _ in range(20)), admin_loop(), return_exceptions=True)
    dt = time.perf_counter() - t0
    print(f"  {sum(count.values())} requests in {dt:.0f}s -> {sum(count.values()) / dt:.0f} req/s  {dict(count)}")
    await bounded(10, [rc.req("rider.offline", "PUT", "/delivery/availability", json={"is_online": False}) for rc, _ in riders])


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, round(p / 100 * (len(xs) - 1)))]


async def main() -> None:
    db = await asyncpg.connect(DSN)
    limits = httpx.Limits(max_connections=200, max_keepalive_connections=200)
    async with httpx.AsyncClient(timeout=30, limits=limits) as http:
        adm = await admin(http)
        rests = (await Client(http).req("catalog.restaurants", "GET", "/catalog/restaurants", params=HOME)).json()["items"]
        rest_ids = [r["id"] for r in rests]
        dosa = next(r for r in rests if r["slug"] == "the-dosa-republic")
        menu = (await Client(http).req("catalog.menu", "GET", f"/catalog/restaurants/{dosa['id']}/menu")).json()
        food = next(f for c in menu["categories"] for f in c["foods"] if not f["option_groups"])
        zone_id = str(await db.fetchval("SELECT zone_id FROM restaurants WHERE id = $1", uuid.UUID(dosa["id"])))
        near = tuple(await db.fetchrow("SELECT lat, lng FROM restaurants WHERE id = $1", uuid.UUID(dosa["id"])))

        await phase_a(http, rest_ids)
        orders = await phase_b(http, food)
        await phase_c(http, food, db)
        await phase_f(http, food, db)
        await phase_e(http)
        await phase_d(http, adm, orders, zone_id, near, db)
        await phase_g(http, adm, orders[8:], zone_id, near, rest_ids)
    await db.close()

    print("\n=== latency (ms) and status codes per endpoint ===")
    print(f"{'endpoint':32} {'n':>6} {'p50':>7} {'p95':>7} {'p99':>7} {'max':>7}  codes")
    for k in sorted(lat):
        xs = lat[k]
        print(f"{k:32} {len(xs):6} {statistics.median(xs):7.0f} {pct(xs, 95):7.0f} {pct(xs, 99):7.0f} {max(xs):7.0f}  {dict(codes[k])}")
    total = sum(sum(c.values()) for c in codes.values())
    five = sum(v for c in codes.values() for s, v in c.items() if isinstance(s, int) and s >= 500)
    print(f"\ntotal requests {total}, 5xx {five}")
    if notes:
        print("notes:", Counter(notes).most_common(8))
    print(f"BUGS ({len(bugs)})")
    for b in dict.fromkeys(bugs):
        print("  -", b)


asyncio.run(main())
