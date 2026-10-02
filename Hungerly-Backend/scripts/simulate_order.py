"""Development helper: place realistic customer orders through the public API, so the rider app and
admin panel have live work to show (the customer app is not wired to the API yet).

Usage:
    python scripts/simulate_order.py                  # 1 order, waits for an admin to accept it
    python scripts/simulate_order.py --count 3 --accept   # also accept for the restaurant -> dispatch to riders

--accept uses the service layer directly (the same code path as the admin "Accept" button).
Refuses to run outside development.
"""

from __future__ import annotations

import argparse
import asyncio
import random
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from app.core.config import get_settings  # noqa: E402

ADDRESSES = [
    ("Flat 402, Amar Residency", "Lane 6", "Near Osho Garden", "Koregaon Park", 18.5362, 73.8939),
    ("B-1203, Marvel Edge", "Viman Nagar Road", "Opp. Phoenix Mall", "Viman Nagar", 18.5590, 73.9105),
    ("12, Silver Oaks", "Lane 3", "Behind Gold Gym", "Kalyani Nagar", 18.5485, 73.9025),
    ("House 7, Sopan Baug", "Ghorpadi", "Near Army Gate", "Camp", 18.5205, 73.8890),
]
NAMES = ["Asha Rao", "Kabir Mehta", "Neha Iyer", "Rohan Gupta", "Priya Nair"]


async def place(client: httpx.AsyncClient, n: int) -> str | None:
    phone = f"+9197{random.randint(10_000_000, 99_999_999)}"
    dev = "sim-" + uuid.uuid4().hex[:16]
    r = await client.post("/auth/otp/request", json={"phone_e164": phone, "client_app": "customer", "device_id": dev})
    r.raise_for_status()
    r = await client.post("/auth/otp/verify", json={
        "otp_request_id": r.json()["otp_request_id"], "phone_e164": phone, "otp": "123456",
        "client_app": "customer", "device_id": dev})
    r.raise_for_status()
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    await client.patch("/me", headers=h, json={"full_name": random.choice(NAMES)})

    line1, line2, landmark, locality, lat, lng = random.choice(ADDRESSES)
    addr = (await client.post("/customer/addresses", headers=h, json={
        "label": "home", "line1": line1, "line2": line2, "landmark": landmark, "locality": locality,
        "city": "Pune", "state": "Maharashtra", "postal_code": "411001", "location": {"lat": lat, "lng": lng},
        "delivery_instructions": random.choice([None, "Ring the bell twice", "Leave with the guard", "Call on arrival"]),
    })).json()

    restaurants = [x for x in (await client.get("/catalog/restaurants", params={"lat": lat, "lng": lng})).json()["items"] if x["is_open"]]
    rest = random.choice(restaurants)
    menu = (await client.get(f"/catalog/restaurants/{rest['id']}/menu")).json()
    foods = [f for c in menu["categories"] for f in c["foods"] if f["is_available"]]
    for food in random.sample(foods, k=min(len(foods), random.randint(2, 3))):
        option_ids = []
        for g in food["option_groups"]:
            opts = [o["id"] for o in g["options"] if o["is_available"]]
            option_ids += opts[: g["min_select"]]
        await client.post("/customer/cart/items", headers=h, json={
            "menu_item_id": food["id"], "quantity": random.randint(1, 2), "option_ids": option_ids, "replace_cart": True})
    cart = (await client.put("/customer/cart/address", headers=h, json={"address_id": addr["id"]})).json()
    if not cart["can_checkout"]:
        print(f"  #{n}: skipped ({', '.join(cart['blocking_reasons'])})")
        return None
    r = await client.post("/customer/orders", headers={**h, "Idempotency-Key": str(uuid.uuid4())}, json={
        "payment_method": "cod", "expected_total_minor": cart["bill"]["total_minor"]})
    r.raise_for_status()
    order = r.json()["order"]
    print(f"  #{n}: {order['order_number']}  {rest['name']}  ->  {locality}   Rs {order['total']['amount_minor'] / 100:.2f}")
    return order["id"]


async def accept(order_ids: list[str]) -> None:
    from app.db.session import dispose_engine, sessionmaker
    from app.services import dispatch
    from app.services import orders as order_svc

    async with sessionmaker()() as db:
        for oid in order_ids:
            o = await order_svc.lock_order(db, uuid.UUID(oid))
            order_svc.accept(db, o, random.choice([10, 15, 20]), actor_type="system", actor_user_id=None)
            await db.flush()
            a = await dispatch.dispatch(db, o)
            await db.commit()
            print(f"  accepted {o.order_number}: " + ("offered to nearest online rider" if a else "no online rider nearby yet (will retry)"))
    await dispose_engine()


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=1)
    parser.add_argument("--accept", action="store_true")
    parser.add_argument("--api", default="http://127.0.0.1:8000/api/v1")
    args = parser.parse_args()
    if get_settings().is_production_like:
        sys.exit("refusing to simulate orders outside development")
    async with httpx.AsyncClient(base_url=args.api, timeout=15) as client:
        print("Placing orders:")
        ids = [oid for i in range(args.count) if (oid := await place(client, i + 1))]
    if args.accept and ids:
        await accept(ids)


if __name__ == "__main__":
    asyncio.run(main())
