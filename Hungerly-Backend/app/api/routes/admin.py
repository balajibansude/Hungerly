from __future__ import annotations

import uuid
from datetime import UTC, datetime, time, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, Query
from pydantic import EmailStr, Field
from sqlalchemy import func, or_, select, tuple_
from sqlalchemy.exc import IntegrityError

from app.api.deps import DB, Principal, admin, audit
from app.api.pagination import decode_cursor, encode_cursor
from app.core import crypto
from app.core.errors import ProblemError
from app.models import (
    AdminProfile,
    AuditLog,
    DeliveryAssignment,
    DeliveryPartner,
    Order,
    Restaurant,
    ServiceZone,
    User,
    UserRole,
)
from app.models.delivery import ACTIVE_ASSIGNMENT_STATUSES
from app.schemas.common import CleanText, Name, Strict, mask_email, mask_phone, money
from app.services import auth as auth_svc
from app.services import dispatch
from app.services import orders as order_svc
from app.services.geo import haversine_m

router = APIRouter(prefix="/admin", tags=["admin"])

Ops = Annotated[Principal, Depends(admin("operations"))]
OpsOrSupport = Annotated[Principal, Depends(admin("operations", "support"))]
AnyAdmin = Annotated[Principal, Depends(admin("operations", "support", "finance"))]
Super = Annotated[Principal, Depends(admin())]
Limit = Annotated[int, Query(ge=1, le=100)]
IfMatch = Annotated[str | None, Header(alias="If-Match", max_length=12)]


def _page(rows: list, limit: int, key) -> str | None:
    if len(rows) <= limit:
        return None
    created_at, row_id = key(rows[limit - 1])
    return encode_cursor(created_at, row_id)


def _today_start() -> datetime:
    # Operational "today" in India Standard Time.
    ist = timedelta(hours=5, minutes=30)
    local = datetime.now(UTC) + ist
    return datetime.combine(local.date(), time.min, tzinfo=UTC) - ist


# --- Dashboard ---------------------------------------------------------------------------


@router.get("/dashboard/live")
async def dashboard(p: AnyAdmin, db: DB) -> dict:
    by_status = dict(
        (await db.execute(select(Order.status, func.count()).where(Order.status.in_(order_svc.LIVE_STATUSES)).group_by(Order.status))).all()
    )
    today = _today_start()
    today_row = (
        await db.execute(
            select(
                func.count().filter(Order.status == "delivered"),
                func.coalesce(func.sum(Order.total_minor).filter(Order.status == "delivered"), 0),
                func.count().filter(Order.status == "cancelled"),
                func.count(),
            ).where(Order.created_at >= today)
        )
    ).one()
    online_ids = list(
        (await db.execute(select(DeliveryPartner.id).where(DeliveryPartner.is_online.is_(True), DeliveryPartner.status == "active"))).scalars()
    )
    # "Online" means reachable now (recent location), not just a switch left on in a closed app.
    reachable = await dispatch.fresh_ids(online_ids)
    busy_ids = set(
        (await db.execute(select(DeliveryAssignment.delivery_partner_id).where(DeliveryAssignment.status.in_(ACTIVE_ASSIGNMENT_STATUSES)))).scalars()
    )
    online = len(reachable | (busy_ids & set(online_ids)))
    busy = len(busy_ids)
    yesterday_row = (
        await db.execute(
            select(func.count(), func.coalesce(func.sum(Order.total_minor).filter(Order.status == "delivered"), 0)).where(
                Order.created_at >= today - timedelta(days=1), Order.created_at < order_svc.now() - timedelta(days=1)
            )
        )
    ).one()
    top = (
        await db.execute(
            select(Restaurant.id, Restaurant.display_name, func.count(), func.coalesce(func.sum(Order.total_minor), 0))
            .join(Order, Order.restaurant_id == Restaurant.id)
            .where(Order.created_at >= today, Order.status != "cancelled")
            .group_by(Restaurant.id, Restaurant.display_name)
            .order_by(func.count().desc())
            .limit(5)
        )
    ).all()
    pending_riders = (await db.execute(select(func.count()).where(DeliveryPartner.status == "pending_review"))).scalar_one()
    unassigned = (
        await db.execute(
            select(func.count())
            .select_from(Order)
            .where(
                Order.status.in_(("preparing", "ready_for_pickup")),
                ~select(DeliveryAssignment.id)
                .where(DeliveryAssignment.order_id == Order.id, DeliveryAssignment.status.in_(ACTIVE_ASSIGNMENT_STATUSES))
                .exists(),
            )
        )
    ).scalar_one()
    delayed = (
        await db.execute(
            select(func.count()).where(
                Order.status.in_(order_svc.LIVE_STATUSES), Order.estimated_delivery_at < order_svc.now()
            )
        )
    ).scalar_one()
    stale_placed = (
        await db.execute(
            select(func.count()).where(Order.status == "placed", Order.placed_at < order_svc.now() - timedelta(minutes=5))
        )
    ).scalar_one()
    return {
        "live_orders": {s: by_status.get(s, 0) for s in order_svc.LIVE_STATUSES},
        "needs_attention": {"unassigned": unassigned, "delayed": delayed, "awaiting_acceptance": stale_placed},
        "riders": {
            "online": online,
            "on_delivery": busy,
            "idle": max(0, online - busy),
            "stale": max(0, len(online_ids) - online),
            "pending_review": pending_riders,
        },
        "today": {
            "orders": today_row[3],
            "delivered": today_row[0],
            "cancelled": today_row[2],
            "gmv": money(int(today_row[1])),
        },
        # Same time window yesterday, for "vs yesterday" trends.
        "yesterday": {"orders": yesterday_row[0], "gmv": money(int(yesterday_row[1]))},
        "top_restaurants": [
            {"id": str(rid), "name": name, "orders": n, "gmv": money(int(g))} for rid, name, n, g in top
        ],
    }


@router.get("/dashboard/timeseries")
async def timeseries(p: AnyAdmin, db: DB, days: Annotated[int, Query(ge=1, le=90)] = 14) -> list[dict]:
    since = _today_start() - timedelta(days=days - 1)
    day = func.date_trunc("day", Order.created_at + timedelta(hours=5, minutes=30))
    rows = (
        await db.execute(
            select(day, func.count(), func.coalesce(func.sum(Order.total_minor).filter(Order.status == "delivered"), 0))
            .where(Order.created_at >= since)
            .group_by(day)
            .order_by(day)
        )
    ).all()
    return [{"date": d.date().isoformat(), "orders": n, "gmv": money(int(g))} for d, n, g in rows]


# --- Orders ---------------------------------------------------------------------------------

OrderStatus = Literal["pending_payment", "placed", "preparing", "ready_for_pickup", "picked_up", "delivered", "cancelled", "live"]


@router.get("/orders")
async def list_orders(
    p: OpsOrSupport,
    db: DB,
    status: OrderStatus | None = None,
    q: Annotated[str | None, Query(max_length=20, pattern=r"^[A-Za-z0-9-]+$")] = None,
    restaurant_id: uuid.UUID | None = None,
    limit: Limit = 25,
    cursor: str | None = None,
) -> dict:
    stmt = (
        select(Order, Restaurant.display_name, User.full_name)
        .join(Restaurant, Restaurant.id == Order.restaurant_id)
        .join(User, User.id == Order.customer_user_id)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(limit + 1)
    )
    if status == "live":
        stmt = stmt.where(Order.status.in_(order_svc.LIVE_STATUSES))
    elif status:
        stmt = stmt.where(Order.status == status)
    if q:
        stmt = stmt.where(Order.order_number == q.upper() if q.upper().startswith("HGR-") else Order.order_number.ilike(f"%{q}%"))
    if restaurant_id:
        stmt = stmt.where(Order.restaurant_id == restaurant_id)
    pos = decode_cursor(cursor)
    if pos:
        stmt = stmt.where(tuple_(Order.created_at, Order.id) < tuple_(pos[0], pos[1]))
    rows = (await db.execute(stmt)).all()
    order_ids = [o.id for o, _, _ in rows[:limit]]
    riders = {}
    if order_ids:
        for oid, name in (
            await db.execute(
                select(DeliveryAssignment.order_id, User.full_name)
                .join(DeliveryPartner, DeliveryPartner.id == DeliveryAssignment.delivery_partner_id)
                .join(User, User.id == DeliveryPartner.user_id)
                .where(DeliveryAssignment.order_id.in_(order_ids), DeliveryAssignment.status.in_((*ACTIVE_ASSIGNMENT_STATUSES, "delivered")))
            )
        ).all():
            riders[oid] = name
    items = [
        {
            "id": str(o.id),
            "order_number": o.order_number,
            "status": o.status,
            "restaurant_name": rname,
            "customer_name": cname or "Customer",
            "rider_name": riders.get(o.id),
            "item_count": sum(i.quantity for i in o.items),
            "total": money(o.total_minor),
            "payment_method": o.payment_method,
            "payment_status": o.payment_status,
            "locality": o.delivery_address.get("locality"),
            "placed_at": o.placed_at or o.created_at,
            "estimated_delivery_at": o.estimated_delivery_at,
            "is_delayed": bool(o.estimated_delivery_at and o.status in order_svc.LIVE_STATUSES and o.estimated_delivery_at < order_svc.now()),
            "version": o.version,
        }
        for o, rname, cname in rows[:limit]
    ]
    return {"items": items, "next_cursor": _page(rows, limit, lambda r: (r[0].created_at, r[0].id))}


async def _order_detail(db: DB, o: Order) -> dict:
    restaurant = await db.get(Restaurant, o.restaurant_id)
    customer = await db.get(User, o.customer_user_id)
    assignments = (
        await db.execute(
            select(DeliveryAssignment, User.full_name, DeliveryPartner.vehicle_type)
            .join(DeliveryPartner, DeliveryPartner.id == DeliveryAssignment.delivery_partner_id)
            .join(User, User.id == DeliveryPartner.user_id)
            .where(DeliveryAssignment.order_id == o.id)
            .order_by(DeliveryAssignment.created_at)
        )
    ).all()
    issues = (
        await db.execute(
            select(AuditLog.action, AuditLog.changes, AuditLog.created_at, User.full_name)
            .outerjoin(User, User.id == AuditLog.actor_user_id)
            .where(AuditLog.entity_type == "order", AuditLog.entity_id == o.id, AuditLog.action.startswith("delivery.issue."))
            .order_by(AuditLog.created_at.desc())
        )
    ).all()
    addr = dict(o.delivery_address)
    addr["contact_phone_e164"] = mask_phone(addr.get("contact_phone_e164"))
    return {
        "id": str(o.id),
        "order_number": o.order_number,
        "status": o.status,
        "version": o.version,
        "payment_method": o.payment_method,
        "payment_status": o.payment_status,
        "restaurant": {
            "id": str(restaurant.id), "name": restaurant.display_name, "phone_e164": restaurant.phone_e164,
            "locality": restaurant.locality, "location": {"lat": restaurant.lat, "lng": restaurant.lng},
        } if restaurant else None,
        "customer": {
            "id": str(o.customer_user_id),
            "name": customer.full_name if customer else None,
            "masked_phone": mask_phone(customer.phone_e164) if customer else None,
        },
        "delivery_address": addr,
        "delivery_location": {"lat": o.delivery_lat, "lng": o.delivery_lng},
        "delivery_distance_m": o.delivery_distance_m,
        "items": [
            {"name": i.name, "food_type": i.food_type, "quantity": i.quantity, "options": i.options,
             "line_total": money(i.line_total_minor), "notes": i.notes}
            for i in o.items
        ],
        "bill": {k: getattr(o, k) for k in (
            "subtotal_minor", "packaging_fee_minor", "delivery_fee_minor", "platform_fee_minor",
            "tax_minor", "discount_minor", "tip_minor", "total_minor")},
        "special_instructions": o.special_instructions,
        "timeline": [{"status": e.to_status, "from": e.from_status, "at": e.created_at, "actor": e.actor_type, "reason": e.reason} for e in o.events],
        "assignments": [
            {
                "id": str(a.id), "status": a.status, "rider_name": name, "vehicle_type": vt,
                "delivery_partner_id": str(a.delivery_partner_id), "manual": a.assigned_by is not None,
                "offered_at": a.offered_at, "responded_at": a.responded_at, "picked_up_at": a.picked_up_at,
                "delivered_at": a.delivered_at, "payout": money(a.payout_minor or 0), "cancel_reason": a.cancel_reason,
            }
            for a, name, vt in assignments
        ],
        "placed_at": o.placed_at,
        "estimated_ready_at": o.estimated_ready_at,
        "estimated_delivery_at": o.estimated_delivery_at,
        "cancellation_reason": o.cancellation_reason,
        "cancelled_by": o.cancelled_by,
        "issues": [
            {"kind": action.removeprefix("delivery.issue."), "note": (changes or {}).get("note"), "at": at, "reported_by": name}
            for action, changes, at, name in issues
        ],
    }


@router.get("/orders/{order_id}")
async def get_order(order_id: uuid.UUID, p: OpsOrSupport, db: DB) -> dict:
    o = await db.get(Order, order_id)
    if o is None:
        raise ProblemError(404, "order.not_found")
    return await _order_detail(db, o)


class AcceptIn(Strict):
    prep_minutes: int = Field(ge=5, le=90)


class ReasonIn(Strict):
    reason: Annotated[CleanText, Field(min_length=3, max_length=300)]


@router.post("/orders/{order_id}/accept")
async def accept_order(order_id: uuid.UUID, body: AcceptIn, p: Ops, db: DB, if_match: IfMatch = None) -> dict:
    """Accept on behalf of the restaurant (until the restaurant app exists) and start dispatch."""
    o = await order_svc.lock_order(db, order_id)
    order_svc.check_version(o, if_match)
    order_svc.accept(db, o, body.prep_minutes, actor_type="admin", actor_user_id=p.user_id)
    await db.flush()
    await dispatch.dispatch(db, o)
    audit(db, p, "order.accept", "order", o.id, {"prep_minutes": body.prep_minutes})
    await db.commit()
    return await _order_detail(db, o)


@router.post("/orders/{order_id}/ready")
async def mark_ready(order_id: uuid.UUID, p: Ops, db: DB, if_match: IfMatch = None) -> dict:
    o = await order_svc.lock_order(db, order_id)
    order_svc.check_version(o, if_match)
    order_svc.transition(db, o, "ready_for_pickup", actor_type="admin", actor_user_id=p.user_id)
    audit(db, p, "order.ready", "order", o.id)
    await db.commit()
    return await _order_detail(db, o)


@router.post("/orders/{order_id}/cancel")
async def cancel_order(order_id: uuid.UUID, body: ReasonIn, p: Ops, db: DB, if_match: IfMatch = None) -> dict:
    o = await order_svc.lock_order(db, order_id)
    order_svc.check_version(o, if_match)
    before = o.status
    order_svc.transition(db, o, "cancelled", actor_type="admin", actor_user_id=p.user_id, reason=body.reason)
    await order_svc.cancel_active_assignment(db, o.id, "order_cancelled")
    audit(db, p, "order.cancel", "order", o.id, {"from_status": before, "reason": body.reason})
    await db.commit()
    return await _order_detail(db, o)


class AssignIn(Strict):
    delivery_partner_id: uuid.UUID


@router.get("/orders/{order_id}/available-riders")
async def available_riders(order_id: uuid.UUID, p: Ops, db: DB) -> list[dict]:
    o = await db.get(Order, order_id)
    if o is None:
        raise ProblemError(404, "order.not_found")
    restaurant = await db.get(Restaurant, o.restaurant_id)
    assert restaurant is not None
    busy = select(DeliveryAssignment.delivery_partner_id).where(DeliveryAssignment.status.in_(ACTIVE_ASSIGNMENT_STATUSES))
    rows = (
        await db.execute(
            select(DeliveryPartner, User.full_name)
            .join(User, User.id == DeliveryPartner.user_id)
            .where(
                DeliveryPartner.zone_id == o.zone_id,
                DeliveryPartner.status == "active",
                DeliveryPartner.is_online.is_(True),
                DeliveryPartner.id.not_in(busy),
            )
            .limit(100)
        )
    ).all()
    out = []
    for partner, name in rows:
        loc = await dispatch.last_location(partner.id)
        out.append({
            "id": str(partner.id),
            "name": name,
            "vehicle_type": partner.vehicle_type,
            "rating": float(partner.rating_avg or 0),
            "distance_m": haversine_m(loc[0], loc[1], restaurant.lat, restaurant.lng) if loc else None,
            "location_fresh": loc is not None,
        })
    out.sort(key=lambda r: (r["distance_m"] is None, r["distance_m"] or 0))
    return out


@router.post("/orders/{order_id}/assign")
async def assign_rider(order_id: uuid.UUID, body: AssignIn, p: Ops, db: DB, if_match: IfMatch = None) -> dict:
    o = await order_svc.lock_order(db, order_id)
    order_svc.check_version(o, if_match)
    partner = (
        await db.execute(select(DeliveryPartner).where(DeliveryPartner.id == body.delivery_partner_id).with_for_update())
    ).scalar_one_or_none()
    if partner is None:
        raise ProblemError(404, "delivery_partner.not_found")
    a = await dispatch.manual_assign(db, o, partner, p.user_id)
    o.version += 1
    audit(db, p, "order.assign_rider", "order", o.id, {"delivery_partner_id": str(partner.id), "assignment_id": str(a.id)})
    await db.commit()
    return await _order_detail(db, o)


# --- Delivery partners -----------------------------------------------------------------------


def _partner_row(partner: DeliveryPartner, user: User, zone_name: str | None) -> dict:
    return {
        "id": str(partner.id),
        "user_id": str(user.id),
        "name": user.full_name,
        "masked_phone": mask_phone(user.phone_e164),
        "status": partner.status,
        "status_reason": partner.status_reason,
        "zone": zone_name,
        "zone_id": str(partner.zone_id) if partner.zone_id else None,
        "vehicle_type": partner.vehicle_type,
        "is_online": partner.is_online,
        "rating": float(partner.rating_avg or 0),
        "submitted_at": partner.submitted_at,
        "approved_at": partner.approved_at,
        "created_at": partner.created_at,
    }


@router.get("/delivery-partners")
async def list_partners(
    p: OpsOrSupport,
    db: DB,
    status: Literal["onboarding", "pending_review", "active", "suspended", "rejected", "offboarded", "online"] | None = None,
    q: Annotated[str | None, Query(min_length=2, max_length=60)] = None,
    limit: Limit = 25,
    cursor: str | None = None,
) -> dict:
    stmt = (
        select(DeliveryPartner, User, ServiceZone.name)
        .join(User, User.id == DeliveryPartner.user_id)
        .outerjoin(ServiceZone, ServiceZone.id == DeliveryPartner.zone_id)
        .order_by(DeliveryPartner.created_at.desc(), DeliveryPartner.id.desc())
        .limit(limit + 1)
    )
    if status == "online":
        stmt = stmt.where(DeliveryPartner.is_online.is_(True), DeliveryPartner.status == "active")
    elif status:
        stmt = stmt.where(DeliveryPartner.status == status)
    if q:
        stmt = stmt.where(_user_search(q))
    pos = decode_cursor(cursor)
    if pos:
        stmt = stmt.where(tuple_(DeliveryPartner.created_at, DeliveryPartner.id) < tuple_(pos[0], pos[1]))
    rows = (await db.execute(stmt)).all()
    return {
        "items": [_partner_row(dp, u, z) for dp, u, z in rows[:limit]],
        "next_cursor": _page(rows, limit, lambda r: (r[0].created_at, r[0].id)),
    }


@router.get("/delivery-partners/{partner_id}")
async def get_partner(partner_id: uuid.UUID, p: OpsOrSupport, db: DB) -> dict:
    row = (
        await db.execute(
            select(DeliveryPartner, User, ServiceZone.name)
            .join(User, User.id == DeliveryPartner.user_id)
            .outerjoin(ServiceZone, ServiceZone.id == DeliveryPartner.zone_id)
            .where(DeliveryPartner.id == partner_id)
        )
    ).first()
    if row is None:
        raise ProblemError(404, "delivery_partner.not_found")
    partner, user, zone = row
    stats = (
        await db.execute(
            select(
                func.count().filter(DeliveryAssignment.status == "delivered"),
                func.coalesce(func.sum(DeliveryAssignment.payout_minor).filter(DeliveryAssignment.status == "delivered"), 0),
                func.count().filter(DeliveryAssignment.status.in_(("rejected", "expired"))),
                func.count(),
            ).where(DeliveryAssignment.delivery_partner_id == partner.id)
        )
    ).one()
    # Document numbers are sensitive: show only the last 4 characters.
    def last4(v: str | None) -> str | None:
        return f"••••{v[-4:]}" if v else None

    loc = await dispatch.last_location(partner.id)
    recent = (
        await db.execute(
            select(DeliveryAssignment, Order.order_number, Restaurant.display_name)
            .join(Order, Order.id == DeliveryAssignment.order_id)
            .join(Restaurant, Restaurant.id == Order.restaurant_id)
            .where(DeliveryAssignment.delivery_partner_id == partner.id)
            .order_by(DeliveryAssignment.created_at.desc())
            .limit(10)
        )
    ).all()
    return {
        **_partner_row(partner, user, zone),
        "masked_email": mask_email(user.email),
        "vehicle_registration": last4(partner.vehicle_registration),
        "driving_license_number": last4(partner.driving_license_number),
        "last_location": {"lat": loc[0], "lng": loc[1]} if loc else None,
        "reachable": loc is not None,
        "last_online_at": partner.last_online_at,
        "recent_deliveries": [
            {
                "id": str(a.id), "order_id": str(a.order_id), "order_number": num, "restaurant_name": rname,
                "status": a.status, "payout": money(a.payout_minor or 0), "at": a.delivered_at or a.offered_at,
            }
            for a, num, rname in recent
        ],
        "stats": {
            "delivered": stats[0], "earned": money(int(stats[1])),
            "declined_or_missed": stats[2], "offers": stats[3],
            "acceptance_rate": round(100 * (1 - stats[2] / stats[3]), 1) if stats[3] else None,
        },
    }


class PartnerDecisionIn(Strict):
    action: Literal["approve", "reject", "suspend", "reinstate"]
    reason: Annotated[CleanText, Field(max_length=300)] | None = None


_PARTNER_ACTIONS = {
    "approve": ({"pending_review"}, "active"),
    "reject": ({"pending_review"}, "rejected"),
    "suspend": ({"active"}, "suspended"),
    "reinstate": ({"suspended"}, "active"),
}


@router.post("/delivery-partners/{partner_id}/decision")
async def partner_decision(partner_id: uuid.UUID, body: PartnerDecisionIn, p: Ops, db: DB) -> dict:
    partner = (
        await db.execute(select(DeliveryPartner).where(DeliveryPartner.id == partner_id).with_for_update())
    ).scalar_one_or_none()
    if partner is None:
        raise ProblemError(404, "delivery_partner.not_found")
    allowed_from, to = _PARTNER_ACTIONS[body.action]
    if partner.status not in allowed_from:
        raise ProblemError(409, "delivery_partner.invalid_transition", extra={"current_status": partner.status})
    if body.action in ("reject", "suspend") and not body.reason:
        raise ProblemError(422, "validation.reason_required", "Give a reason. The rider will see it.")
    if body.action == "suspend":
        active = (
            await db.execute(
                select(DeliveryAssignment.id).where(
                    DeliveryAssignment.delivery_partner_id == partner.id, DeliveryAssignment.status.in_(ACTIVE_ASSIGNMENT_STATUSES)
                )
            )
        ).first()
        if active:
            raise ProblemError(409, "delivery.has_active_assignment", "Reassign the rider's current order first.")
        partner.is_online = False
        await dispatch.remove_location(partner)
    before = partner.status
    partner.status = to
    partner.status_reason = body.reason
    if body.action == "approve":
        partner.approved_at = order_svc.now()
        partner.approved_by = p.user_id
    audit(db, p, f"delivery_partner.{body.action}", "delivery_partner", partner.id,
          {"from": before, "to": to, "reason": body.reason})
    await db.commit()
    user = await db.get(User, partner.user_id)
    zone = await db.get(ServiceZone, partner.zone_id) if partner.zone_id else None
    return _partner_row(partner, user, zone.name if zone else None)


@router.get("/riders/live")
async def live_riders(p: OpsOrSupport, db: DB) -> list[dict]:
    rows = (
        await db.execute(
            select(DeliveryPartner, User.full_name)
            .join(User, User.id == DeliveryPartner.user_id)
            .where(DeliveryPartner.is_online.is_(True), DeliveryPartner.status == "active")
            .limit(500)
        )
    ).all()
    busy = dict(
        (await db.execute(
            select(DeliveryAssignment.delivery_partner_id, DeliveryAssignment.status)
            .where(DeliveryAssignment.status.in_(ACTIVE_ASSIGNMENT_STATUSES))
        )).all()
    )
    out = []
    for partner, name in rows:
        loc = await dispatch.last_location(partner.id)
        out.append({
            "id": str(partner.id), "name": name, "vehicle_type": partner.vehicle_type,
            "assignment_status": busy.get(partner.id), "location": {"lat": loc[0], "lng": loc[1]} if loc else None,
            # No recent GPS: the app is closed or offline, so dispatch cannot reach this rider.
            "reachable": loc is not None or partner.id in busy,
        })
    out.sort(key=lambda r: (not r["reachable"], r["assignment_status"] is None))
    return out


# --- Restaurants ------------------------------------------------------------------------------


@router.get("/restaurants")
async def list_restaurants(
    p: OpsOrSupport,
    db: DB,
    status: Literal["draft", "pending_review", "active", "suspended", "rejected", "closed"] | None = None,
    q: Annotated[str | None, Query(min_length=2, max_length=60)] = None,
) -> list[dict]:
    stmt = select(Restaurant).order_by(Restaurant.display_name).limit(200)
    if status:
        stmt = stmt.where(Restaurant.status == status)
    if q:
        stmt = stmt.where(Restaurant.display_name.ilike(f"%{_escape_like(q)}%", escape="\\"))
    live = dict(
        (await db.execute(
            select(Order.restaurant_id, func.count()).where(Order.status.in_(order_svc.LIVE_STATUSES)).group_by(Order.restaurant_id)
        )).all()
    )
    return [
        {
            "id": str(r.id), "name": r.display_name, "locality": r.locality, "status": r.status,
            "is_accepting_orders": r.is_accepting_orders, "cuisines": [c.name for c in r.cuisines],
            "rating": float(r.rating_avg or 0), "commission_bps": r.commission_bps, "live_orders": live.get(r.id, 0),
            "image_url": r.image_url,
        }
        for r in (await db.execute(stmt)).scalars()
    ]


class RestaurantPatch(Strict):
    is_accepting_orders: bool | None = None
    status: Literal["active", "suspended"] | None = None
    reason: Annotated[CleanText, Field(max_length=300)] | None = None


@router.patch("/restaurants/{restaurant_id}")
async def patch_restaurant(restaurant_id: uuid.UUID, body: RestaurantPatch, p: Ops, db: DB) -> dict:
    r = (await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id).with_for_update())).scalar_one_or_none()
    if r is None:
        raise ProblemError(404, "restaurant.not_found")
    changes: dict = {}
    if body.status and body.status != r.status:
        if body.status == "suspended" and not body.reason:
            raise ProblemError(422, "validation.reason_required")
        changes["status"] = [r.status, body.status]
        r.status = body.status
        r.status_reason = body.reason
        if body.status == "suspended":
            r.is_accepting_orders = False
    if body.is_accepting_orders is not None and body.is_accepting_orders != r.is_accepting_orders:
        if body.is_accepting_orders and r.status != "active":
            raise ProblemError(409, "restaurant.not_active")
        changes["is_accepting_orders"] = [r.is_accepting_orders, body.is_accepting_orders]
        r.is_accepting_orders = body.is_accepting_orders
    if changes:
        audit(db, p, "restaurant.update", "restaurant", r.id, {**changes, "reason": body.reason})
    await db.commit()
    return {"id": str(r.id), "status": r.status, "is_accepting_orders": r.is_accepting_orders}


# --- Users ----------------------------------------------------------------------------------------


def _escape_like(q: str) -> str:
    return q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _user_search(q: str):
    """Phone numbers are encrypted, so they match exactly via the blind index; names match by substring."""
    conds = [User.full_name.ilike(f"%{_escape_like(q)}%", escape="\\")]
    digits = "".join(ch for ch in q if ch.isdigit())
    if len(digits) >= 10:
        conds.append(User.phone_bidx == auth_svc.phone_bidx("+91" + digits[-10:]))
    if "@" in q:
        conds.append(User.email == q.lower())
    return or_(*conds)


@router.get("/users")
async def list_users(
    p: OpsOrSupport,
    db: DB,
    q: Annotated[str | None, Query(min_length=2, max_length=60)] = None,
    role: Literal["customer", "delivery_partner", "admin"] | None = None,
    limit: Limit = 25,
    cursor: str | None = None,
) -> dict:
    stmt = select(User).where(User.deleted_at.is_(None)).order_by(User.created_at.desc(), User.id.desc()).limit(limit + 1)
    if q:
        stmt = stmt.where(_user_search(q))
    if role:
        stmt = stmt.where(User.roles.any(UserRole.role == role))
    pos = decode_cursor(cursor)
    if pos:
        stmt = stmt.where(tuple_(User.created_at, User.id) < tuple_(pos[0], pos[1]))
    rows = (await db.execute(stmt)).scalars().all()
    stats: dict = {}
    ids = [u.id for u in rows[:limit]]
    if ids:
        stats = {
            uid: (n, int(spent))
            for uid, n, spent in (await db.execute(
                select(
                    Order.customer_user_id, func.count(),
                    func.coalesce(func.sum(Order.total_minor).filter(Order.status == "delivered"), 0),
                ).where(Order.customer_user_id.in_(ids)).group_by(Order.customer_user_id)
            )).all()
        }
    items = [
        {
            # Contact details are masked in lists; the eye icon calls /reveal, which is audited.
            "id": str(u.id), "name": u.full_name, "masked_phone": mask_phone(u.phone_e164), "masked_email": mask_email(u.email),
            "roles": u.role_names, "status": u.status, "orders": stats.get(u.id, (0, 0))[0],
            "total_spent": money(stats.get(u.id, (0, 0))[1]),
            "created_at": u.created_at, "last_login_at": u.last_login_at,
        }
        for u in rows[:limit]
    ]
    return {"items": items, "next_cursor": _page(rows, limit, lambda u: (u.created_at, u.id))}


class UserStatusIn(Strict):
    status: Literal["active", "suspended"]
    reason: Annotated[CleanText, Field(min_length=3, max_length=300)]


@router.post("/users/{user_id}/status")
async def set_user_status(user_id: uuid.UUID, body: UserStatusIn, p: Ops, db: DB) -> dict:
    user = (await db.execute(select(User).where(User.id == user_id).with_for_update())).scalar_one_or_none()
    if user is None or user.deleted_at is not None:
        raise ProblemError(404, "user.not_found")
    if "admin" in user.role_names and p.admin_role != "super_admin":
        raise ProblemError(403, "auth.forbidden", "Only a super admin can change another admin.")
    if user.id == p.user_id:
        raise ProblemError(409, "user.cannot_change_self")
    before = user.status
    user.status = body.status
    revoked = 0
    if body.status == "suspended":
        revoked = await auth_svc.revoke_all_sessions(db, user.id, "admin")
    audit(db, p, f"user.{'suspend' if body.status == 'suspended' else 'reinstate'}", "user", user.id,
          {"from": before, "to": body.status, "reason": body.reason, "sessions_revoked": revoked})
    await db.commit()
    return {"id": str(user.id), "status": user.status, "sessions_revoked": revoked}


# --- Admin accounts (super admin) ------------------------------------------------------------------


class AdminCreateIn(Strict):
    email: EmailStr
    full_name: Name
    admin_role: Literal["super_admin", "operations", "support", "finance"]
    temporary_password: str = Field(min_length=12, max_length=128)


@router.get("/admins")
async def list_admins(p: Super, db: DB) -> list[dict]:
    rows = (
        await db.execute(select(User, AdminProfile).join(AdminProfile, AdminProfile.user_id == User.id).order_by(User.created_at))
    ).all()
    return [
        {"id": str(u.id), "email": u.email, "name": u.full_name, "admin_role": ap.admin_role, "is_active": ap.is_active,
         "mfa_enrolled": ap.totp_enabled_at is not None, "last_login_at": u.last_login_at}
        for u, ap in rows
    ]


@router.post("/admins", status_code=201)
async def create_admin(body: AdminCreateIn, p: Super, db: DB) -> dict:
    user = User(email=str(body.email).lower(), full_name=body.full_name, password_hash=crypto.hash_password(body.temporary_password), roles=[])
    user.roles.append(UserRole(role="admin", granted_by=p.user_id))
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        raise ProblemError(409, "user.email_taken") from None
    db.add(AdminProfile(user_id=user.id, admin_role=body.admin_role))
    audit(db, p, "admin.create", "user", user.id, {"admin_role": body.admin_role})
    await db.commit()
    return {"id": str(user.id), "email": user.email, "admin_role": body.admin_role}


class AdminPatch(Strict):
    admin_role: Literal["super_admin", "operations", "support", "finance"] | None = None
    is_active: bool | None = None


@router.patch("/admins/{user_id}")
async def patch_admin(user_id: uuid.UUID, body: AdminPatch, p: Super, db: DB) -> dict:
    profile = (await db.execute(select(AdminProfile).where(AdminProfile.user_id == user_id).with_for_update())).scalar_one_or_none()
    if profile is None:
        raise ProblemError(404, "admin.not_found")
    if user_id == p.user_id:
        raise ProblemError(409, "admin.cannot_change_self")
    demoting = (body.admin_role not in (None, "super_admin") or body.is_active is False) and profile.admin_role == "super_admin"
    if demoting:
        supers = (await db.execute(
            select(func.count()).where(AdminProfile.admin_role == "super_admin", AdminProfile.is_active.is_(True))
        )).scalar_one()
        if supers <= 1:
            raise ProblemError(409, "admin.last_super_admin", "At least one active super admin must remain.")
    changes = {}
    if body.admin_role and body.admin_role != profile.admin_role:
        changes["admin_role"] = [profile.admin_role, body.admin_role]
        profile.admin_role = body.admin_role
    if body.is_active is not None and body.is_active != profile.is_active:
        changes["is_active"] = [profile.is_active, body.is_active]
        profile.is_active = body.is_active
    if changes:
        # Role changes take effect immediately: existing tokens carry the old role.
        await auth_svc.revoke_all_sessions(db, user_id, "admin")
        audit(db, p, "admin.update", "user", user_id, changes)
    await db.commit()
    return {"id": str(user_id), "admin_role": profile.admin_role, "is_active": profile.is_active}


# --- Audit & reference data ---------------------------------------------------------------------------


@router.get("/audit-logs")
async def audit_logs(
    p: Super,
    db: DB,
    entity_type: Annotated[str | None, Query(max_length=32, pattern=r"^[a-z_]+$")] = None,
    entity_id: uuid.UUID | None = None,
    actor_user_id: uuid.UUID | None = None,
    action: Annotated[str | None, Query(max_length=64, pattern=r"^[a-z_.]+$")] = None,
    limit: Limit = 50,
    cursor: str | None = None,
) -> dict:
    stmt = (
        select(AuditLog, User.full_name, User.email)
        .outerjoin(User, User.id == AuditLog.actor_user_id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit + 1)
    )
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if actor_user_id:
        stmt = stmt.where(AuditLog.actor_user_id == actor_user_id)
    if action:
        stmt = stmt.where(AuditLog.action.startswith(action))
    pos = decode_cursor(cursor)
    if pos:
        stmt = stmt.where(tuple_(AuditLog.created_at, AuditLog.id) < tuple_(pos[0], pos[1]))
    rows = (await db.execute(stmt)).all()
    return {
        "items": [
            {
                "id": str(a.id), "action": a.action, "entity_type": a.entity_type,
                "entity_id": str(a.entity_id) if a.entity_id else None,
                "actor": name or email or ("system" if a.actor_user_id is None else "unknown"),
                "actor_role": a.actor_role, "changes": a.changes, "ip_address": str(a.ip_address) if a.ip_address else None,
                "request_id": a.request_id, "created_at": a.created_at,
            }
            for a, name, email in rows[:limit]
        ],
        "next_cursor": _page(rows, limit, lambda r: (r[0].created_at, r[0].id)),
    }


@router.get("/zones")
async def list_zones(p: AnyAdmin, db: DB) -> list[dict]:
    rows = (await db.execute(select(ServiceZone).order_by(ServiceZone.name))).scalars()
    return [
        {"id": str(z.id), "name": z.name, "is_active": z.is_active, "cod_enabled": z.cod_enabled,
         "base_delivery_fee": money(z.base_delivery_fee_minor), "max_delivery_radius_m": z.max_delivery_radius_m}
        for z in rows
    ]
