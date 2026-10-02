"""Rider dispatch.

Live rider positions live in Redis (a GEO set per zone plus a short-TTL freshness key per rider), never
in the main tables. Offers go to one rider at a time, nearest first; an offer that is rejected or expires
moves on to the next candidate. Database partial unique indexes guarantee one active rider per order and
one active order per rider even under races.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import timedelta

from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ProblemError
from app.core.redis import get_redis
from app.db.session import sessionmaker
from app.models import DeliveryAssignment, DeliveryPartner, Order, Restaurant
from app.models.delivery import ACTIVE_ASSIGNMENT_STATUSES
from app.services.geo import haversine_m
from app.services.orders import now

log = logging.getLogger("hungerly.dispatch")

DISPATCHABLE_ORDER_STATUSES = ("preparing", "ready_for_pickup")


def geo_key(zone_id: uuid.UUID | str) -> str:
    return f"riders:geo:{zone_id}"


def fresh_key(partner_id: uuid.UUID | str) -> str:
    return f"rider:fresh:{partner_id}"


def seen_key(partner_id: uuid.UUID | str) -> str:
    return f"rider:seen:{partner_id}"


# A rider whose app has sent no location for this long is switched offline automatically, so dashboards
# never show phantom "available" riders (app killed, phone off, no signal).
STALE_OFFLINE_SECONDS = 15 * 60


async def fresh_ids(ids: list[uuid.UUID]) -> set[uuid.UUID]:
    """Riders (of `ids`) with a recent location, i.e. actually reachable for dispatch right now."""
    if not ids:
        return set()
    try:
        pipe = get_redis().pipeline(transaction=False)
        for pid in ids:
            pipe.exists(fresh_key(pid))
        flags = await pipe.execute()
    except RedisError:
        return set()
    return {pid for pid, ok in zip(ids, flags, strict=True) if ok}


async def record_location(partner: DeliveryPartner, lat: float, lng: float) -> None:
    if partner.zone_id is None:
        return
    redis = get_redis()
    ttl = get_settings().rider_location_ttl_seconds
    pipe = redis.pipeline(transaction=False)
    pipe.geoadd(geo_key(partner.zone_id), (lng, lat, str(partner.id)))
    pipe.set(fresh_key(partner.id), f"{lat},{lng}", ex=ttl)
    pipe.set(seen_key(partner.id), "1", ex=STALE_OFFLINE_SECONDS)
    await pipe.execute()


async def last_location(partner_id: uuid.UUID) -> tuple[float, float] | None:
    try:
        raw = await get_redis().get(fresh_key(partner_id))
    except RedisError:
        return None
    if not raw:
        return None
    lat, lng = raw.split(",")
    return float(lat), float(lng)


async def remove_location(partner: DeliveryPartner) -> None:
    if partner.zone_id is None:
        return
    try:
        redis = get_redis()
        await redis.zrem(geo_key(partner.zone_id), str(partner.id))
        await redis.delete(fresh_key(partner.id))
    except RedisError:
        pass


def payout_for(pickup_m: int, drop_m: int) -> int:
    s = get_settings()
    km = (pickup_m + drop_m) / 1000
    return s.rider_base_payout_minor + int(round(km * s.rider_per_km_payout_minor))


async def _candidates(db: AsyncSession, order: Order, restaurant: Restaurant) -> list[tuple[uuid.UUID, int]]:
    """Nearest online, active, idle riders who have not already declined this order."""
    s = get_settings()
    try:
        nearby = await get_redis().geosearch(
            geo_key(order.zone_id), longitude=restaurant.lng, latitude=restaurant.lat,
            radius=s.dispatch_radius_m, unit="m", sort="ASC", count=25, withdist=True,
        )
    except RedisError:
        log.error("dispatch: redis unavailable")
        return []
    ranked: list[tuple[uuid.UUID, int]] = []
    for member, dist in nearby:
        try:
            pid = uuid.UUID(member)
        except ValueError:
            continue
        if await get_redis().exists(fresh_key(pid)):
            ranked.append((pid, int(dist)))
    if not ranked:
        return []

    ids = [pid for pid, _ in ranked]
    eligible = set(
        (
            await db.execute(
                select(DeliveryPartner.id).where(
                    DeliveryPartner.id.in_(ids),
                    DeliveryPartner.status == "active",
                    DeliveryPartner.is_online.is_(True),
                    DeliveryPartner.zone_id == order.zone_id,
                )
            )
        ).scalars()
    )
    busy = set(
        (
            await db.execute(
                select(DeliveryAssignment.delivery_partner_id).where(
                    DeliveryAssignment.delivery_partner_id.in_(ids),
                    DeliveryAssignment.status.in_((*ACTIVE_ASSIGNMENT_STATUSES, "offered")),
                )
            )
        ).scalars()
    )
    tried = set(
        (
            await db.execute(
                select(DeliveryAssignment.delivery_partner_id).where(DeliveryAssignment.order_id == order.id)
            )
        ).scalars()
    )
    return [(pid, d) for pid, d in ranked if pid in eligible and pid not in busy and pid not in tried]


async def dispatch(db: AsyncSession, order: Order) -> DeliveryAssignment | None:
    """Offer the order to the best candidate, if it still needs a rider. Caller commits."""
    if order.status not in DISPATCHABLE_ORDER_STATUSES:
        return None
    existing = (
        await db.execute(
            select(DeliveryAssignment.id).where(
                DeliveryAssignment.order_id == order.id,
                DeliveryAssignment.status.in_((*ACTIVE_ASSIGNMENT_STATUSES, "offered")),
            )
        )
    ).first()
    if existing:
        return None
    restaurant = await db.get(Restaurant, order.restaurant_id)
    assert restaurant is not None
    for partner_id, pickup_m in await _candidates(db, order, restaurant):
        assignment = DeliveryAssignment(
            order_id=order.id,
            delivery_partner_id=partner_id,
            status="offered",
            offered_at=now(),
            offer_expires_at=now() + timedelta(seconds=get_settings().delivery_offer_ttl_seconds),
            pickup_distance_m=pickup_m,
            drop_distance_m=order.delivery_distance_m,
        )
        try:
            async with db.begin_nested():
                db.add(assignment)
        except IntegrityError:
            continue  # lost a race for this rider; try the next one
        return assignment
    return None


async def manual_assign(db: AsyncSession, order: Order, partner: DeliveryPartner, admin_user_id: uuid.UUID) -> DeliveryAssignment:
    if order.status not in ("placed", *DISPATCHABLE_ORDER_STATUSES):
        raise ProblemError(409, "order.invalid_transition", "Riders can only be assigned before pickup.")
    if partner.status != "active":
        raise ProblemError(409, "delivery.not_active", "This rider is not active.")
    if order.zone_id != partner.zone_id:
        raise ProblemError(409, "delivery.outside_zone", "This rider works in a different zone.")
    current = (
        await db.execute(
            select(DeliveryAssignment)
            .where(DeliveryAssignment.order_id == order.id, DeliveryAssignment.status.in_((*ACTIVE_ASSIGNMENT_STATUSES, "offered")))
            .with_for_update()
        )
    ).scalars().all()
    for a in current:
        if a.status in ACTIVE_ASSIGNMENT_STATUSES and a.status != "accepted":
            raise ProblemError(409, "delivery.already_in_progress", "The current rider has already reached the restaurant.")
        a.status = "cancelled"
        a.cancelled_at = now()
        a.cancel_reason = "reassigned_by_admin"
        a.version += 1
    await db.flush()

    restaurant = await db.get(Restaurant, order.restaurant_id)
    assert restaurant is not None
    loc = await last_location(partner.id)
    pickup_m = haversine_m(loc[0], loc[1], restaurant.lat, restaurant.lng) if loc else 0
    assignment = DeliveryAssignment(
        order_id=order.id,
        delivery_partner_id=partner.id,
        status="accepted",
        assigned_by=admin_user_id,
        offered_at=now(),
        offer_expires_at=now(),
        responded_at=now(),
        pickup_distance_m=pickup_m,
        drop_distance_m=order.delivery_distance_m,
        payout_minor=payout_for(pickup_m, order.delivery_distance_m),
    )
    try:
        async with db.begin_nested():
            db.add(assignment)
    except IntegrityError:
        raise ProblemError(409, "delivery.already_on_delivery", "This rider is already on another delivery.") from None
    return assignment


async def expire_offers_once() -> int:
    """Expire stale offers and re-dispatch their orders. Safe to run on several instances."""
    count = 0
    async with sessionmaker()() as db:
        stale_orders = set(
            (
                await db.execute(
                    select(DeliveryAssignment.order_id)
                    .where(DeliveryAssignment.status == "offered", DeliveryAssignment.offer_expires_at < now())
                    .limit(100)
                )
            ).scalars()
        )
        # Orders that still need a rider (e.g. nobody was online when the restaurant accepted).
        waiting = set(
            (await db.execute(select(Order.id).where(Order.status.in_(DISPATCHABLE_ORDER_STATUSES)).limit(100))).scalars()
        )
        for oid in stale_orders | waiting:
            # Lock order first, then its assignments: the same order every other path uses.
            order = (
                await db.execute(select(Order).where(Order.id == oid).with_for_update(skip_locked=True))
            ).scalar_one_or_none()
            if order is None:
                continue
            stale = (
                await db.execute(
                    select(DeliveryAssignment)
                    .where(
                        DeliveryAssignment.order_id == oid,
                        DeliveryAssignment.status == "offered",
                        DeliveryAssignment.offer_expires_at < now(),
                    )
                    .with_for_update()
                )
            ).scalars().all()
            for a in stale:
                a.status = "expired"
                a.responded_at = now()
                a.version += 1
                count += 1
            await db.flush()
            await dispatch(db, order)
            await db.commit()
    return count


async def offline_stale_riders() -> int:
    """Switch off riders who are 'online' but have gone silent (never riders mid-delivery)."""
    async with sessionmaker()() as db:
        online = (
            await db.execute(select(DeliveryPartner).where(DeliveryPartner.is_online.is_(True)).limit(500))
        ).scalars().all()
        if not online:
            return 0
        try:
            pipe = get_redis().pipeline(transaction=False)
            for p in online:
                pipe.exists(seen_key(p.id))
            seen = await pipe.execute()
        except RedisError:
            return 0  # cannot tell; never switch riders off on a Redis outage
        busy = set(
            (
                await db.execute(
                    select(DeliveryAssignment.delivery_partner_id).where(
                        DeliveryAssignment.status.in_(ACTIVE_ASSIGNMENT_STATUSES)
                    )
                )
            ).scalars()
        )
        count = 0
        for p, ok in zip(online, seen, strict=True):
            if not ok and p.id not in busy:
                p.is_online = False
                await remove_location(p)
                count += 1
        await db.commit()
        return count


async def run_sweeper(stop: asyncio.Event, interval: float = 5.0) -> None:
    tick = 0
    while not stop.is_set():
        try:
            await expire_offers_once()
            if tick % 12 == 0:  # about once a minute
                await offline_stale_riders()
            tick += 1
        except Exception:  # noqa: BLE001 - the loop must survive transient DB/Redis errors
            log.exception("dispatch sweeper iteration failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval)
        except TimeoutError:
            pass
