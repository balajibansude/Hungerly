from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response
from pydantic import Field
from sqlalchemy import func, select, tuple_
from sqlalchemy.exc import IntegrityError

from app.api.deps import DB, Rider, RiderAnyStatus, audit
from app.api.pagination import decode_cursor, encode_cursor
from app.core import crypto, ratelimit
from app.core.config import get_settings
from app.core.errors import ProblemError
from app.models import DeliveryAssignment, DeliveryLocationPing, Order, Restaurant, ServiceZone, User
from app.models.delivery import ACTIVE_ASSIGNMENT_STATUSES
from app.schemas.common import CleanText, LatLng, Strict, mask_phone, money
from app.services import dispatch
from app.services import orders as order_svc
from app.services.geo import haversine_m, point

router = APIRouter(prefix="/delivery", tags=["delivery"])

def restaurant_address(r: Restaurant) -> str:
    """Street address without repeating the restaurant name or locality (riders read this on the move)."""
    line = r.address_line1
    if line.lower().startswith(r.display_name.lower()):
        line = line[len(r.display_name):].lstrip(" ,")
    parts = [p for p in (line, r.locality) if p]
    out: list[str] = []
    for p in parts:
        if not any(p.lower() in o.lower() for o in out):
            out.append(p)
    return ", ".join(out) or r.locality


GEOFENCE_M = 500
IST = timedelta(hours=5, minutes=30)


# --- Profile & onboarding --------------------------------------------------------------


def partner_out(ctx_partner, user: User | None) -> dict:
    p = ctx_partner
    return {
        "id": str(p.id),
        "status": p.status,
        "status_reason": p.status_reason,
        "full_name": user.full_name if user else None,
        "phone_e164": user.phone_e164 if user else None,
        "zone_id": str(p.zone_id) if p.zone_id else None,
        "vehicle_type": p.vehicle_type,
        "vehicle_registration": p.vehicle_registration,
        "is_online": p.is_online,
        "rating": {"average": float(p.rating_avg or 0), "count": p.rating_count},
        "onboarding": {
            "profile": bool(user and user.full_name),
            "vehicle": bool(p.vehicle_type),
            "zone": bool(p.zone_id),
            "submitted": p.submitted_at is not None,
        },
    }


@router.get("/me")
async def me(ctx: RiderAnyStatus, db: DB) -> dict:
    user = await db.get(User, ctx.principal.user_id)
    return partner_out(ctx.partner, user)


class OnboardingIn(Strict):
    full_name: Annotated[CleanText, Field(min_length=2, max_length=120)]
    vehicle_type: Literal["bicycle", "motorcycle", "scooter", "ev_scooter"]
    vehicle_registration: str | None = Field(default=None, pattern=r"^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$")
    driving_license_number: str | None = Field(default=None, pattern=r"^[A-Z]{2}[0-9]{2}[ -]?[0-9]{11}$")
    zone_id: uuid.UUID


@router.post("/onboarding")
async def submit_onboarding(body: OnboardingIn, ctx: RiderAnyStatus, db: DB) -> dict:
    partner = ctx.partner
    if partner.status not in ("onboarding", "rejected"):
        raise ProblemError(409, "delivery.onboarding_closed", "Your details are already under review or approved.")
    if body.vehicle_type != "bicycle" and not (body.vehicle_registration and body.driving_license_number):
        raise ProblemError(422, "delivery.documents_required", "Vehicle number and driving licence are required for motor vehicles.")
    zone = await db.get(ServiceZone, body.zone_id)
    if zone is None or not zone.is_active:
        raise ProblemError(422, "delivery.zone_invalid")
    user = await db.get(User, ctx.principal.user_id)
    assert user is not None
    user.full_name = body.full_name
    partner.vehicle_type = body.vehicle_type
    partner.vehicle_registration = body.vehicle_registration
    partner.driving_license_number = body.driving_license_number
    partner.zone_id = zone.id
    partner.status = "pending_review"
    partner.status_reason = None
    partner.submitted_at = order_svc.now()
    audit(db, ctx.principal, "delivery_partner.onboarding_submitted", "delivery_partner", partner.id)
    await db.commit()
    return partner_out(partner, user)


@router.get("/zones")
async def zones(ctx: RiderAnyStatus, db: DB) -> list[dict]:
    rows = (await db.execute(select(ServiceZone).where(ServiceZone.is_active.is_(True)).order_by(ServiceZone.name))).scalars()
    return [{"id": str(z.id), "name": z.name} for z in rows]


# --- Availability & location ---------------------------------------------------------------


class AvailabilityIn(Strict):
    is_online: bool
    location: LatLng | None = None


async def _active_assignment(db: DB, partner_id: uuid.UUID, *, lock: bool = False) -> DeliveryAssignment | None:
    stmt = select(DeliveryAssignment).where(
        DeliveryAssignment.delivery_partner_id == partner_id,
        DeliveryAssignment.status.in_(ACTIVE_ASSIGNMENT_STATUSES),
    )
    if lock:
        stmt = stmt.with_for_update()
    return (await db.execute(stmt)).scalar_one_or_none()


@router.put("/availability")
async def set_availability(body: AvailabilityIn, ctx: Rider, db: DB) -> dict:
    partner = ctx.partner
    if body.is_online:
        if body.location is None:
            raise ProblemError(422, "delivery.location_required", "Turn on location to go online.")
        partner.is_online = True
        partner.last_online_at = order_svc.now()
        await dispatch.record_location(partner, body.location.lat, body.location.lng)
    else:
        if await _active_assignment(db, partner.id):
            raise ProblemError(409, "delivery.has_active_assignment", "Finish your current delivery before going offline.")
        partner.is_online = False
        await dispatch.remove_location(partner)
    await db.commit()
    return {"is_online": partner.is_online}


class Ping(Strict):
    lat: float = Field(ge=6.0, le=38.0)
    lng: float = Field(ge=68.0, le=98.0)
    accuracy_m: float | None = Field(default=None, ge=0, le=5000)
    recorded_at: datetime


class LocationIn(Strict):
    points: list[Ping] = Field(min_length=1, max_length=20)


@router.post("/location", status_code=204)
async def post_location(body: LocationIn, ctx: Rider, db: DB) -> Response:
    await ratelimit.enforce(f"loc:{ctx.partner.id}", limit=30, window_seconds=60)
    if not ctx.partner.is_online:
        raise ProblemError(403, "delivery.offline")
    now = order_svc.now()
    pts = [pt for pt in body.points if now - timedelta(minutes=10) <= pt.recorded_at.astimezone(UTC) <= now + timedelta(seconds=30)]
    if not pts:
        raise ProblemError(422, "delivery.location_stale")
    latest = max(pts, key=lambda pt: pt.recorded_at)
    await dispatch.record_location(ctx.partner, latest.lat, latest.lng)
    a = await _active_assignment(db, ctx.partner.id)
    if a is not None:
        for pt in pts:
            db.add(DeliveryLocationPing(
                assignment_id=a.id, lat=pt.lat, lng=pt.lng, location=point(pt.lat, pt.lng),
                accuracy_m=pt.accuracy_m, recorded_at=pt.recorded_at,
            ))
        await db.commit()
    return Response(status_code=204)


# --- Offers & assignments --------------------------------------------------------------------


async def _assignment_view(db: DB, a: DeliveryAssignment, *, full: bool) -> dict:
    order = await db.get(Order, a.order_id)
    assert order is not None
    restaurant = await db.get(Restaurant, order.restaurant_id)
    assert restaurant is not None
    view = {
        "id": str(a.id),
        "status": a.status,
        "version": a.version,
        "offer_expires_at": a.offer_expires_at if a.status == "offered" else None,
        "order": {
            "id": str(order.id),
            "order_number": order.order_number,
            "status": order.status,
            "item_count": sum(i.quantity for i in order.items),
            "payment_method": order.payment_method,
            "cash_to_collect": money(order.total_minor if order.payment_method == "cod" else 0),
            "estimated_ready_at": order.estimated_ready_at,
        },
        "pickup": {
            "name": restaurant.display_name,
            "address": restaurant_address(restaurant),
            "location": {"lat": restaurant.lat, "lng": restaurant.lng},
            "phone_e164": restaurant.phone_e164 if full else None,
        },
        "drop": {
            "locality": order.delivery_address.get("locality"),
            "location": {"lat": order.delivery_lat, "lng": order.delivery_lng} if full else None,
        },
        "pickup_distance_m": a.pickup_distance_m,
        "drop_distance_m": a.drop_distance_m,
        "estimated_payout": money(a.payout_minor or dispatch.payout_for(a.pickup_distance_m or 0, a.drop_distance_m or 0)),
    }
    if full:
        # The exact address and contact are revealed only once the rider has accepted.
        addr = order.delivery_address
        view["drop"].update({
            "line1": addr.get("line1"), "line2": addr.get("line2"), "landmark": addr.get("landmark"),
            "contact_name": addr.get("contact_name"), "contact_phone_e164": addr.get("contact_phone_e164"),
            "masked_phone": mask_phone(addr.get("contact_phone_e164")), "instructions": addr.get("instructions"),
        })
        view["items"] = [{"name": i.name, "quantity": i.quantity} for i in order.items]
    return view


async def _lock_own(db: DB, ctx: Rider, assignment_id: uuid.UUID) -> tuple[DeliveryAssignment, Order]:
    """Lock order then assignment (same order as admin and dispatch paths, so no deadlocks)."""
    scoped = (DeliveryAssignment.id == assignment_id, DeliveryAssignment.delivery_partner_id == ctx.partner.id)
    order_id = (await db.execute(select(DeliveryAssignment.order_id).where(*scoped))).scalar_one_or_none()
    if order_id is None:
        raise ProblemError(404, "delivery.assignment_not_found")
    order = await order_svc.lock_order(db, order_id)
    a = (await db.execute(select(DeliveryAssignment).where(*scoped).with_for_update())).scalar_one()
    return a, order


@router.get("/offers")
async def list_offers(ctx: Rider, db: DB) -> list[dict]:
    rows = (
        await db.execute(
            select(DeliveryAssignment).where(
                DeliveryAssignment.delivery_partner_id == ctx.partner.id,
                DeliveryAssignment.status == "offered",
                DeliveryAssignment.offer_expires_at > order_svc.now(),
            )
        )
    ).scalars().all()
    return [await _assignment_view(db, a, full=False) for a in rows]


@router.post("/offers/{assignment_id}/accept")
async def accept_offer(assignment_id: uuid.UUID, ctx: Rider, db: DB) -> dict:
    a, order = await _lock_own(db, ctx, assignment_id)
    if a.status != "offered":
        raise ProblemError(409, "delivery.offer_taken", "This offer is no longer available.")
    if a.offer_expires_at <= order_svc.now():
        a.status = "expired"
        await db.commit()
        raise ProblemError(410, "delivery.offer_expired", "This offer has expired.")
    if order.status not in dispatch.DISPATCHABLE_ORDER_STATUSES:
        a.status = "cancelled"
        a.cancel_reason = "order_unavailable"
        await db.commit()
        raise ProblemError(409, "delivery.offer_taken", "This order is no longer available.")
    a.status = "accepted"
    a.responded_at = order_svc.now()
    a.payout_minor = dispatch.payout_for(a.pickup_distance_m or 0, a.drop_distance_m or 0)
    a.version += 1
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ProblemError(409, "delivery.already_on_delivery", "You already have an active delivery.") from None
    return await _assignment_view(db, a, full=True)


class RejectIn(Strict):
    reason: Literal["too_far", "vehicle_issue", "busy", "other"]


@router.post("/offers/{assignment_id}/reject")
async def reject_offer(assignment_id: uuid.UUID, body: RejectIn, ctx: Rider, db: DB) -> dict:
    a, order = await _lock_own(db, ctx, assignment_id)
    if a.status != "offered":
        raise ProblemError(409, "delivery.offer_taken")
    a.status = "rejected"
    a.responded_at = order_svc.now()
    a.cancel_reason = body.reason
    a.version += 1
    await db.flush()
    await dispatch.dispatch(db, order)  # move on to the next nearest rider
    await db.commit()
    return {"status": "rejected"}


@router.get("/assignments/current")
async def current_assignment(ctx: Rider, db: DB) -> dict | None:
    a = await _active_assignment(db, ctx.partner.id)
    return await _assignment_view(db, a, full=True) if a else None


class StepIn(Strict):
    location: LatLng


async def _near(ctx: Rider, loc: LatLng, lat: float, lng: float, code: str) -> None:
    await dispatch.record_location(ctx.partner, loc.lat, loc.lng)
    if get_settings().env in ("staging", "production") and haversine_m(loc.lat, loc.lng, lat, lng) > GEOFENCE_M:
        raise ProblemError(422, code, "You need to be closer to the location to do this.")


def _step(a: DeliveryAssignment, allowed_from: tuple[str, ...], to: str, ts_field: str) -> None:
    if a.status not in allowed_from:
        raise ProblemError(409, "delivery.invalid_transition", extra={"current_status": a.status})
    a.status = to
    setattr(a, ts_field, order_svc.now())
    a.version += 1


@router.post("/assignments/{assignment_id}/arrived-restaurant")
async def arrived_restaurant(assignment_id: uuid.UUID, body: StepIn, ctx: Rider, db: DB) -> dict:
    a, order = await _lock_own(db, ctx, assignment_id)
    restaurant = await db.get(Restaurant, order.restaurant_id)
    assert restaurant is not None
    await _near(ctx, body.location, restaurant.lat, restaurant.lng, "delivery.too_far_from_restaurant")
    _step(a, ("accepted",), "arrived_at_restaurant", "arrived_restaurant_at")
    await db.commit()
    return await _assignment_view(db, a, full=True)


@router.post("/assignments/{assignment_id}/picked-up")
async def picked_up(assignment_id: uuid.UUID, body: StepIn, ctx: Rider, db: DB) -> dict:
    a, order = await _lock_own(db, ctx, assignment_id)
    restaurant = await db.get(Restaurant, order.restaurant_id)
    assert restaurant is not None
    await _near(ctx, body.location, restaurant.lat, restaurant.lng, "delivery.too_far_from_restaurant")
    if order.status not in ("preparing", "ready_for_pickup"):
        raise ProblemError(409, "delivery.invalid_transition", extra={"order_status": order.status})
    _step(a, ("accepted", "arrived_at_restaurant"), "picked_up", "picked_up_at")
    order_svc.transition(db, order, "picked_up", actor_type="delivery_partner", actor_user_id=ctx.principal.user_id)
    await db.commit()
    return await _assignment_view(db, a, full=True)


@router.post("/assignments/{assignment_id}/arrived-customer")
async def arrived_customer(assignment_id: uuid.UUID, body: StepIn, ctx: Rider, db: DB) -> dict:
    a, order = await _lock_own(db, ctx, assignment_id)
    await _near(ctx, body.location, order.delivery_lat, order.delivery_lng, "delivery.too_far_from_customer")
    _step(a, ("picked_up",), "arrived_at_customer", "arrived_customer_at")
    await db.commit()
    return await _assignment_view(db, a, full=True)


class DeliveredIn(Strict):
    delivery_otp: str = Field(pattern=r"^\d{4}$")
    cod_collected_minor: int | None = Field(default=None, ge=0)
    location: LatLng


@router.post("/assignments/{assignment_id}/delivered")
async def delivered(assignment_id: uuid.UUID, body: DeliveredIn, ctx: Rider, db: DB) -> dict:
    # Brute-force guard on the 4-digit handover code.
    await ratelimit.enforce(f"dotp:{assignment_id}", limit=5, window_seconds=900, code="delivery.otp_attempts_exceeded", fail_closed=True)
    a, order = await _lock_own(db, ctx, assignment_id)
    await _near(ctx, body.location, order.delivery_lat, order.delivery_lng, "delivery.too_far_from_customer")
    if a.status not in ("picked_up", "arrived_at_customer"):
        raise ProblemError(409, "delivery.invalid_transition", extra={"current_status": a.status})
    if not crypto.constant_time_equals(order.delivery_otp, body.delivery_otp):
        raise ProblemError(400, "delivery.otp_invalid", "The delivery code is incorrect. Ask the customer again.")
    if order.payment_method == "cod":
        if body.cod_collected_minor != order.total_minor:
            raise ProblemError(422, "delivery.cod_amount_mismatch", f"Collect exactly ₹{order.total_minor / 100:.2f}.")
        a.cod_collected_minor = body.cod_collected_minor
    _step(a, ("picked_up", "arrived_at_customer"), "delivered", "delivered_at")
    order_svc.transition(db, order, "delivered", actor_type="delivery_partner", actor_user_id=ctx.principal.user_id)
    await db.commit()
    return {"status": "delivered", "earned": money(a.payout_minor or 0)}


class IssueIn(Strict):
    kind: Literal["customer_unreachable", "wrong_address", "restaurant_delay", "food_damaged", "vehicle_breakdown", "accident", "other"]
    note: Annotated[CleanText, Field(max_length=300)] | None = None


@router.post("/assignments/{assignment_id}/issue", status_code=202)
async def report_issue(assignment_id: uuid.UUID, body: IssueIn, ctx: Rider, db: DB) -> dict:
    """Flag a problem to operations. It lands in the audit trail the admin panel shows for the order."""
    await ratelimit.enforce(f"issue:{ctx.partner.id}", limit=10, window_seconds=3600)
    a, order = await _lock_own(db, ctx, assignment_id)
    audit(db, ctx.principal, f"delivery.issue.{body.kind}", "order", order.id,
          {"assignment_id": str(a.id), "assignment_status": a.status, "note": body.note})
    await db.commit()
    return {"status": "reported"}


# --- History & earnings ------------------------------------------------------------------------


@router.get("/history")
async def history(
    ctx: Rider, db: DB, limit: Annotated[int, Query(ge=1, le=50)] = 20, cursor: str | None = None
) -> dict:
    stmt = (
        select(DeliveryAssignment, Order.order_number, Restaurant.display_name)
        .join(Order, Order.id == DeliveryAssignment.order_id)
        .join(Restaurant, Restaurant.id == Order.restaurant_id)
        .where(
            DeliveryAssignment.delivery_partner_id == ctx.partner.id,
            DeliveryAssignment.status.in_(("delivered", "cancelled", "failed")),
        )
        .order_by(DeliveryAssignment.created_at.desc(), DeliveryAssignment.id.desc())
        .limit(limit + 1)
    )
    pos = decode_cursor(cursor)
    if pos:
        stmt = stmt.where(tuple_(DeliveryAssignment.created_at, DeliveryAssignment.id) < tuple_(pos[0], pos[1]))
    rows = (await db.execute(stmt)).all()
    items = [
        {
            "id": str(a.id), "order_number": num, "restaurant_name": name, "status": a.status,
            "earned": money(a.payout_minor if a.status == "delivered" else 0),
            "distance_m": (a.pickup_distance_m or 0) + (a.drop_distance_m or 0),
            "delivered_at": a.delivered_at, "created_at": a.created_at,
        }
        for a, num, name in rows[:limit]
    ]
    nxt = encode_cursor(rows[limit - 1][0].created_at, rows[limit - 1][0].id) if len(rows) > limit else None
    return {"items": items, "next_cursor": nxt}


@router.get("/earnings")
async def earnings(
    ctx: Rider,
    db: DB,
    from_date: Annotated[date | None, Query(alias="from")] = None,
    to_date: Annotated[date | None, Query(alias="to")] = None,
) -> dict:
    # Days are counted in India Standard Time, matching what the rider sees on their phone.
    today = (order_svc.now() + IST).date()
    start = from_date or today - timedelta(days=6)
    end = to_date or today
    if end < start or (end - start).days > 92:
        raise ProblemError(422, "validation.range_invalid", "Choose a range of up to 3 months.")
    lo = datetime.combine(start, time.min, tzinfo=UTC) - IST
    hi = datetime.combine(end + timedelta(days=1), time.min, tzinfo=UTC) - IST
    day = func.date_trunc("day", DeliveryAssignment.delivered_at + IST)
    rows = (
        await db.execute(
            select(day, func.count(), func.coalesce(func.sum(DeliveryAssignment.payout_minor), 0),
                   func.coalesce(func.sum(DeliveryAssignment.cod_collected_minor), 0))
            .where(
                DeliveryAssignment.delivery_partner_id == ctx.partner.id,
                DeliveryAssignment.status == "delivered",
                DeliveryAssignment.delivered_at >= lo,
                DeliveryAssignment.delivered_at < hi,
            )
            .group_by(day)
            .order_by(day)
        )
    ).all()
    days = [{"date": d.date().isoformat(), "deliveries": n, "earned": money(int(e)), "cash_collected": money(int(c))} for d, n, e, c in rows]
    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "total_earned": money(sum(int(r[2]) for r in rows)),
        "total_deliveries": sum(r[1] for r in rows),
        "cash_in_hand": money(sum(int(r[3]) for r in rows)),
        "days": days,
    }
