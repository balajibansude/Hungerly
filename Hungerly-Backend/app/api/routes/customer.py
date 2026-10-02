from __future__ import annotations

import hashlib
import json
import secrets
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Header, Query, Response
from pydantic import EmailStr, Field
from sqlalchemy import func, select, tuple_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError

from app.api.deps import DB, AnyP, CustomerP
from app.api.pagination import decode_cursor, encode_cursor
from app.core import crypto
from app.core.errors import ProblemError
from app.models import (
    Address,
    Cart,
    CartItem,
    DeliveryAssignment,
    DeliveryPartner,
    MenuItem,
    Order,
    OrderItem,
    OrderStatusEvent,
    Restaurant,
    User,
)
from app.models.delivery import ACTIVE_ASSIGNMENT_STATUSES
from app.schemas.common import CleanText, LatLng, Name, PhoneE164, Strict, mask_phone, money
from app.services import dispatch, pricing
from app.services import orders as order_svc
from app.services.geo import haversine_m, point, zone_for

router = APIRouter(tags=["customer"])

MAX_ADDRESSES = 20


# --- Profile ----------------------------------------------------------------------------


class ProfilePatch(Strict):
    full_name: Name | None = None
    email: EmailStr | None = None


def _me_out(user: User) -> dict:
    return {
        "id": str(user.id),
        "phone_e164": user.phone_e164,
        "full_name": user.full_name,
        "email": user.email,
        "roles": user.role_names,
    }


@router.get("/me")
async def get_me(p: AnyP, db: DB) -> dict:
    user = await db.get(User, p.user_id)
    if user is None:
        raise ProblemError(404, "user.not_found")
    return _me_out(user)


@router.patch("/me")
async def patch_me(body: ProfilePatch, p: AnyP, db: DB) -> dict:
    user = await db.get(User, p.user_id)
    if user is None:
        raise ProblemError(404, "user.not_found")
    if p.client_app == "admin":
        raise ProblemError(403, "auth.forbidden", "Admin profiles are managed by a super admin.")
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.email is not None:
        user.email = str(body.email).lower()
        user.email_verified_at = None
    try:
        await db.commit()
    except IntegrityError:
        raise ProblemError(409, "user.email_taken", "This email is already in use.") from None
    return _me_out(user)


# --- Addresses ------------------------------------------------------------------------------


class AddressIn(Strict):
    label: Literal["home", "work", "other"]
    line1: Annotated[CleanText, Field(min_length=1, max_length=200)]
    line2: Annotated[CleanText, Field(max_length=200)] | None = None
    landmark: Annotated[CleanText, Field(max_length=120)] | None = None
    locality: Annotated[CleanText, Field(min_length=1, max_length=120)]
    city: Annotated[CleanText, Field(min_length=1, max_length=80)]
    state: Annotated[CleanText, Field(min_length=1, max_length=80)]
    postal_code: str = Field(pattern=r"^[1-9][0-9]{5}$")
    location: LatLng
    contact_name: Name | None = None
    contact_phone_e164: PhoneE164 | None = None
    delivery_instructions: Annotated[CleanText, Field(max_length=300)] | None = None


def address_out(a: Address, serviceable: bool | None = None) -> dict:
    out = {
        "id": str(a.id),
        "label": a.label,
        "line1": a.line1,
        "line2": a.line2,
        "landmark": a.landmark,
        "locality": a.locality,
        "city": a.city,
        "state": a.state,
        "postal_code": a.postal_code,
        "location": {"lat": a.lat, "lng": a.lng},
        "contact_name": a.contact_name,
        "contact_phone_e164": a.contact_phone_e164,
        "delivery_instructions": a.delivery_instructions,
    }
    if serviceable is not None:
        out["serviceable"] = serviceable
    return out


async def _own_address(db: DB, p: CustomerP, address_id: uuid.UUID) -> Address:
    a = (
        await db.execute(
            select(Address).where(Address.id == address_id, Address.user_id == p.user_id, Address.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if a is None:
        raise ProblemError(404, "address.not_found")
    return a


@router.get("/customer/addresses")
async def list_addresses(p: CustomerP, db: DB) -> list[dict]:
    rows = (
        await db.execute(
            select(Address).where(Address.user_id == p.user_id, Address.deleted_at.is_(None)).order_by(Address.created_at)
        )
    ).scalars()
    return [address_out(a) for a in rows]


@router.post("/customer/addresses", status_code=201)
async def create_address(body: AddressIn, p: CustomerP, db: DB) -> dict:
    count = (
        await db.execute(select(func.count()).where(Address.user_id == p.user_id, Address.deleted_at.is_(None)))
    ).scalar_one()
    if count >= MAX_ADDRESSES:
        raise ProblemError(422, "address.limit_reached", "You can save up to 20 addresses.")
    data = body.model_dump(exclude={"location"})
    a = Address(
        user_id=p.user_id, **data, lat=body.location.lat, lng=body.location.lng,
        location=point(body.location.lat, body.location.lng),
    )
    db.add(a)
    zone = await zone_for(db, a.lat, a.lng)
    await db.commit()
    return address_out(a, serviceable=zone is not None)


@router.patch("/customer/addresses/{address_id}")
async def update_address(address_id: uuid.UUID, body: AddressIn, p: CustomerP, db: DB) -> dict:
    a = await _own_address(db, p, address_id)
    for k, v in body.model_dump(exclude={"location"}).items():
        setattr(a, k, v)
    a.lat, a.lng = body.location.lat, body.location.lng
    a.location = point(a.lat, a.lng)
    zone = await zone_for(db, a.lat, a.lng)
    await db.commit()
    return address_out(a, serviceable=zone is not None)


@router.delete("/customer/addresses/{address_id}", status_code=204)
async def delete_address(address_id: uuid.UUID, p: CustomerP, db: DB) -> Response:
    a = await _own_address(db, p, address_id)
    a.deleted_at = order_svc.now()
    await db.commit()
    return Response(status_code=204)


# --- Cart -------------------------------------------------------------------------------------


class CartItemIn(Strict):
    menu_item_id: uuid.UUID
    quantity: int = Field(ge=1, le=20)
    option_ids: list[uuid.UUID] = Field(default_factory=list, max_length=30)
    notes: Annotated[CleanText, Field(max_length=200)] | None = None
    replace_cart: bool = False


class CartItemPatch(Strict):
    quantity: int = Field(ge=0, le=20)


class CartAddressIn(Strict):
    address_id: uuid.UUID


async def _get_cart(db: DB, user_id: uuid.UUID, *, lock: bool = False) -> Cart:
    stmt = select(Cart).where(Cart.user_id == user_id)
    if lock:
        stmt = stmt.with_for_update()
    cart = (await db.execute(stmt)).scalar_one_or_none()
    if cart is None:
        # A new customer's first taps can arrive together; let the unique index pick one creator, then read it back.
        await db.execute(pg_insert(Cart).values(user_id=user_id).on_conflict_do_nothing(index_elements=[Cart.user_id]))
        cart = (await db.execute(stmt)).scalar_one()
    return cart


async def _cart_context(db: DB, cart: Cart):
    restaurant = await db.get(Restaurant, cart.restaurant_id) if cart.restaurant_id else None
    address = None
    if cart.address_id:
        address = (
            await db.execute(select(Address).where(Address.id == cart.address_id, Address.deleted_at.is_(None)))
        ).scalar_one_or_none()
    zone = await zone_for(db, address.lat, address.lng) if address else None
    distance = haversine_m(address.lat, address.lng, restaurant.lat, restaurant.lng) if address and restaurant else None
    return restaurant, address, zone, distance


async def cart_view(db: DB, cart: Cart, tip_minor: int = 0) -> dict:
    restaurant, address, zone, distance = await _cart_context(db, cart)
    if restaurant is None or not cart.items:
        return {
            "restaurant": None, "items": [], "address": address_out(address) if address else None,
            "bill": pricing.Bill().as_dict(), "warnings": [], "can_checkout": False, "blocking_reasons": ["cart.empty"],
        }
    lines = await pricing.price_cart_items(db, restaurant.id, cart.items)
    bill = pricing.compute_bill(lines, restaurant, zone, distance, tip_minor)
    blocking: list[str] = []
    warnings = [{"code": "cart.item_unavailable", "cart_item_id": str(li.cart_item_id)} for li in lines if not li.is_available]
    if warnings:
        blocking.append("cart.item_unavailable")
    if not (restaurant.status == "active" and restaurant.is_accepting_orders):
        blocking.append("restaurant.closed")
    if address is None:
        blocking.append("address.missing")
    elif zone is None or restaurant.zone_id != zone.id or (distance or 0) > zone.max_delivery_radius_m:
        blocking.append("address.unserviceable")
    if bill.subtotal_minor < restaurant.min_order_minor:
        blocking.append("cart.below_minimum")
    return {
        "restaurant": {"id": str(restaurant.id), "name": restaurant.display_name, "is_open": restaurant.is_accepting_orders},
        "items": [
            {
                "id": str(li.cart_item_id),
                "menu_item_id": str(li.menu_item.id),
                "name": li.menu_item.name,
                "food_type": li.menu_item.food_type,
                "quantity": li.quantity,
                "options": li.options,
                "option_ids": li.option_ids,
                "notes": li.notes,
                "unit_price": money(li.unit_price_minor + li.options_price_minor),
                "line_total": money(li.line_total_minor),
                "is_available": li.is_available,
            }
            for li in lines
        ],
        "address": address_out(address) if address else None,
        "bill": bill.as_dict(),
        "warnings": warnings,
        "can_checkout": not blocking,
        "blocking_reasons": blocking,
    }


@router.get("/customer/cart")
async def get_cart(p: CustomerP, db: DB) -> dict:
    cart = await _get_cart(db, p.user_id)
    view = await cart_view(db, cart)
    await db.commit()
    return view


@router.post("/customer/cart/items")
async def add_cart_item(body: CartItemIn, p: CustomerP, db: DB) -> dict:
    cart = await _get_cart(db, p.user_id, lock=True)
    item = (
        await db.execute(select(MenuItem).where(MenuItem.id == body.menu_item_id, MenuItem.deleted_at.is_(None)))
    ).scalar_one_or_none()
    if item is None or not item.is_active:
        raise ProblemError(404, "menu.item_not_found")
    restaurant = await db.get(Restaurant, item.restaurant_id)
    if restaurant is None or restaurant.status != "active":
        raise ProblemError(404, "menu.item_not_found")
    if not item.is_available:
        raise ProblemError(409, "menu.item_unavailable", f"{item.name} is out of stock right now.")
    option_ids = sorted(str(o) for o in body.option_ids)
    _, _, opts_ok = pricing.validate_options(item, option_ids)
    if not opts_ok:
        raise ProblemError(409, "menu.option_unavailable", "One of the selected options is out of stock.")

    if cart.restaurant_id and cart.restaurant_id != item.restaurant_id and cart.items:
        if not body.replace_cart:
            current = await db.get(Restaurant, cart.restaurant_id)
            raise ProblemError(
                409, "cart.restaurant_conflict",
                f"Your cart has items from {current.display_name if current else 'another restaurant'}.",
            )
        cart.items.clear()
    cart.restaurant_id = item.restaurant_id

    existing = next(
        (ci for ci in cart.items if ci.menu_item_id == item.id and list(ci.option_ids or []) == option_ids and ci.notes == body.notes),
        None,
    )
    if existing:
        existing.quantity = min(20, existing.quantity + body.quantity)
    else:
        if len(cart.items) >= 30:
            raise ProblemError(422, "cart.too_many_items")
        cart.items.append(CartItem(menu_item_id=item.id, quantity=body.quantity, option_ids=option_ids, notes=body.notes))
    cart.updated_at = order_svc.now()
    await db.flush()
    view = await cart_view(db, cart)
    await db.commit()
    return view


@router.patch("/customer/cart/items/{cart_item_id}")
async def patch_cart_item(cart_item_id: uuid.UUID, body: CartItemPatch, p: CustomerP, db: DB) -> dict:
    cart = await _get_cart(db, p.user_id, lock=True)
    line = next((ci for ci in cart.items if ci.id == cart_item_id), None)
    if line is None:
        raise ProblemError(404, "cart.item_not_found")
    if body.quantity == 0:
        cart.items.remove(line)
    else:
        line.quantity = body.quantity
    if not cart.items:
        cart.restaurant_id = None
    await db.flush()
    view = await cart_view(db, cart)
    await db.commit()
    return view


@router.delete("/customer/cart", status_code=204)
async def clear_cart(p: CustomerP, db: DB) -> Response:
    cart = await _get_cart(db, p.user_id, lock=True)
    cart.items.clear()
    cart.restaurant_id = None
    await db.commit()
    return Response(status_code=204)


@router.put("/customer/cart/address")
async def set_cart_address(body: CartAddressIn, p: CustomerP, db: DB) -> dict:
    address = await _own_address(db, p, body.address_id)
    cart = await _get_cart(db, p.user_id, lock=True)
    cart.address_id = address.id
    await db.flush()
    view = await cart_view(db, cart)
    await db.commit()
    return view


# --- Orders ------------------------------------------------------------------------------------


class PlaceOrderIn(Strict):
    payment_method: Literal["cod", "online"]
    tip_minor: int = Field(default=0, ge=0, le=50000)
    special_instructions: Annotated[CleanText, Field(max_length=500)] | None = None
    expected_total_minor: int = Field(ge=0)


class CancelIn(Strict):
    reason_code: Literal["changed_mind", "ordered_by_mistake", "delay", "other"]
    comment: Annotated[CleanText, Field(max_length=300)] | None = None


IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=16, max_length=64, pattern=r"^[A-Za-z0-9-]+$")]


def _order_number() -> str:
    alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"  # no 0/O/1/I/L ambiguity
    return "HGR-" + "".join(secrets.choice(alphabet) for _ in range(7))


def order_summary(o: Order, restaurant_name: str | None = None) -> dict:
    return {
        "id": str(o.id),
        "order_number": o.order_number,
        "restaurant_id": str(o.restaurant_id),
        "restaurant_name": restaurant_name,
        "status": o.status,
        "payment_method": o.payment_method,
        "payment_status": o.payment_status,
        "lines": [{"name": i.name, "quantity": i.quantity, "line_total": money(i.line_total_minor)} for i in o.items],
        "total": money(o.total_minor),
        "placed_at": o.placed_at or o.created_at,
        "version": o.version,
    }


def bill_out(o: Order) -> dict:
    return {
        "subtotal_minor": o.subtotal_minor,
        "packaging_fee_minor": o.packaging_fee_minor,
        "delivery_fee_minor": o.delivery_fee_minor,
        "platform_fee_minor": o.platform_fee_minor,
        "tax_minor": o.tax_minor,
        "discount_minor": o.discount_minor,
        "tip_minor": o.tip_minor,
        "total_minor": o.total_minor,
    }


def timeline_out(o: Order) -> list[dict]:
    return [{"status": e.to_status, "at": e.created_at, "actor": e.actor_type, "reason": e.reason} for e in o.events]


@router.post("/customer/orders", status_code=201)
async def place_order(body: PlaceOrderIn, p: CustomerP, db: DB, idempotency_key: IdempotencyKey) -> dict:
    request_hash = hashlib.sha256(json.dumps(body.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()

    async def replay() -> dict | None:
        prior = (
            await db.execute(select(Order).where(Order.customer_user_id == p.user_id, Order.idempotency_key == idempotency_key))
        ).scalar_one_or_none()
        if prior is None:
            return None
        if prior.idempotency_hash != request_hash:
            raise ProblemError(409, "idempotency.key_reused")
        return {"order": order_summary(prior), "next_action": "none", "replayed": True}

    if (prior := await replay()) is not None:
        return prior

    if body.payment_method == "online":
        raise ProblemError(422, "payment.method_unavailable", "Online payment is coming soon. Choose cash on delivery.")

    cart = await _get_cart(db, p.user_id, lock=True)
    # Retries sent while the first attempt was still running queue on the cart lock; once it is ours, the
    # first attempt has committed (and emptied the cart), so look for its order again before going further.
    if (prior := await replay()) is not None:
        return prior
    view = await cart_view(db, cart, body.tip_minor)
    if not view["items"]:
        raise ProblemError(409, "cart.empty")
    if not view["can_checkout"]:
        raise ProblemError(409, "cart.not_checkoutable", extra={"blocking_reasons": view["blocking_reasons"]})
    if view["bill"]["total_minor"] != body.expected_total_minor:
        raise ProblemError(409, "order.price_changed", "Prices changed. Review your bill.", extra={"bill": view["bill"]})

    restaurant, address, zone, distance = await _cart_context(db, cart)
    assert restaurant and address and zone and distance is not None
    if body.payment_method == "cod" and not zone.cod_enabled:
        raise ProblemError(422, "payment.method_unavailable")
    lines = await pricing.price_cart_items(db, restaurant.id, cart.items)
    bill = pricing.compute_bill(lines, restaurant, zone, distance, body.tip_minor)
    user = await db.get(User, p.user_id)
    assert user is not None

    order = Order(
        order_number=_order_number(),
        customer_user_id=p.user_id,
        restaurant_id=restaurant.id,
        zone_id=zone.id,
        status="placed",
        payment_method=body.payment_method,
        payment_status="pending",
        delivery_address={
            "line1": address.line1, "line2": address.line2, "landmark": address.landmark,
            "locality": address.locality, "city": address.city, "postal_code": address.postal_code,
            "contact_name": address.contact_name or user.full_name,
            "contact_phone_e164": address.contact_phone_e164 or user.phone_e164,
            "instructions": address.delivery_instructions,
        },
        delivery_lat=address.lat,
        delivery_lng=address.lng,
        delivery_location=point(address.lat, address.lng),
        delivery_distance_m=distance,
        **{k: v for k, v in bill.as_dict().items() if k != "total_minor"},
        total_minor=bill.total_minor,
        special_instructions=body.special_instructions,
        idempotency_key=idempotency_key,
        idempotency_hash=request_hash,
        delivery_otp=crypto.random_digits(4),
        placed_at=order_svc.now(),
        items=[],
        events=[],
    )
    for li in lines:
        order.items.append(
            OrderItem(
                menu_item_id=li.menu_item.id, name=li.menu_item.name, food_type=li.menu_item.food_type,
                unit_price_minor=li.unit_price_minor, options_price_minor=li.options_price_minor,
                quantity=li.quantity, line_total_minor=li.line_total_minor, options=li.options, notes=li.notes,
            )
        )
    db.add(order)
    await db.flush()
    db.add(OrderStatusEvent(order_id=order.id, from_status=None, to_status="placed", actor_type="customer", actor_user_id=p.user_id))
    cart.items.clear()
    cart.restaurant_id = None
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ProblemError(409, "idempotency.conflict", "This order is already being placed.") from None
    return {"order": order_summary(order, restaurant.display_name), "next_action": "none"}


@router.get("/customer/orders")
async def list_orders(
    p: CustomerP, db: DB, limit: Annotated[int, Query(ge=1, le=50)] = 20, cursor: str | None = None
) -> dict:
    stmt = (
        select(Order, Restaurant.display_name)
        .join(Restaurant, Restaurant.id == Order.restaurant_id)
        .where(Order.customer_user_id == p.user_id)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(limit + 1)
    )
    pos = decode_cursor(cursor)
    if pos:
        stmt = stmt.where(tuple_(Order.created_at, Order.id) < tuple_(pos[0], pos[1]))
    rows = (await db.execute(stmt)).all()
    items = [order_summary(o, name) for o, name in rows[:limit]]
    next_cursor = encode_cursor(rows[limit - 1][0].created_at, rows[limit - 1][0].id) if len(rows) > limit else None
    return {"items": items, "next_cursor": next_cursor}


@router.get("/customer/orders/{order_id}")
async def get_order(order_id: uuid.UUID, p: CustomerP, db: DB) -> dict:
    o = (
        await db.execute(select(Order).where(Order.id == order_id, Order.customer_user_id == p.user_id))
    ).scalar_one_or_none()
    if o is None:
        raise ProblemError(404, "order.not_found")
    restaurant = await db.get(Restaurant, o.restaurant_id)
    delivery = None
    a = (
        await db.execute(
            select(DeliveryAssignment).where(
                DeliveryAssignment.order_id == o.id, DeliveryAssignment.status.in_(ACTIVE_ASSIGNMENT_STATUSES)
            )
        )
    ).scalar_one_or_none()
    if a is not None:
        partner = await db.get(DeliveryPartner, a.delivery_partner_id)
        rider = await db.get(User, partner.user_id) if partner else None
        loc = None
        # Location is shared only after pickup, and only with this order's customer.
        if a.status in ("picked_up", "arrived_at_customer") and partner:
            ll = await dispatch.last_location(partner.id)
            loc = {"lat": ll[0], "lng": ll[1]} if ll else None
        delivery = {
            "status": a.status,
            "partner": {
                "first_name": (rider.full_name or "Rider").split(" ")[0] if rider else "Rider",
                "vehicle_type": partner.vehicle_type if partner else None,
                "masked_phone": mask_phone(rider.phone_e164) if rider else None,
            },
            "last_location": loc,
        }
    return {
        **order_summary(o, restaurant.display_name if restaurant else None),
        "bill": bill_out(o),
        "items": [
            {"name": i.name, "food_type": i.food_type, "quantity": i.quantity, "options": i.options,
             "line_total": money(i.line_total_minor), "notes": i.notes}
            for i in o.items
        ],
        "delivery_address": o.delivery_address,
        "timeline": timeline_out(o),
        # Shown to the customer so they can hand it to the rider at the door.
        "delivery_otp": o.delivery_otp if o.status in ("preparing", "ready_for_pickup", "picked_up") else None,
        "estimated_delivery_at": o.estimated_delivery_at,
        "delivery": delivery,
        "cancellable": o.status in ("pending_payment", "placed"),
    }


@router.post("/customer/orders/{order_id}/cancel")
async def cancel_order(
    order_id: uuid.UUID, body: CancelIn, p: CustomerP, db: DB,
    if_match: Annotated[str | None, Header(alias="If-Match", max_length=12)] = None,
) -> dict:
    o = await order_svc.lock_order(db, order_id, customer_id=p.user_id)
    order_svc.check_version(o, if_match)
    if o.status not in ("pending_payment", "placed"):
        raise ProblemError(409, "order.cannot_cancel", "The restaurant is already preparing this order. Contact support.",
                           extra={"current_status": o.status})
    order_svc.transition(db, o, "cancelled", actor_type="customer", actor_user_id=p.user_id, reason=body.reason_code)
    await order_svc.cancel_active_assignment(db, o.id, "order_cancelled")
    await db.commit()
    return order_summary(o)
