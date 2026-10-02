"""Admin: customer/restaurant detail panels, audited PII reveal, and global search.

PII policy: lists and detail panels return masked phone numbers and emails. Full values are returned only
by the explicit `/reveal` endpoints, which (1) require an admin role allowed to contact people, (2) are
rate-limited per admin so the eye icon cannot be used to scrape the customer base, and (3) write a
`pii.reveal` audit entry naming who saw what, when and from where.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select

from app.api.deps import DB, Principal, admin, audit
from app.api.routes.admin import _escape_like, _today_start, _user_search
from app.core import ratelimit
from app.core.errors import ProblemError
from app.models import (
    Address,
    AuthSession,
    DeliveryPartner,
    MenuCategory,
    MenuItem,
    Order,
    Restaurant,
    User,
)
from app.schemas.common import mask_email, mask_phone, money
from app.services import auth as auth_svc
from app.services import orders as order_svc

router = APIRouter(prefix="/admin", tags=["admin"])

Viewer = Annotated[Principal, Depends(admin("operations", "support", "finance"))]
Contact = Annotated[Principal, Depends(admin("operations", "support"))]
Ops = Annotated[Principal, Depends(admin("operations"))]
Super = Annotated[Principal, Depends(admin())]

REVEAL_LIMIT = 40  # per admin per 10 minutes


async def _reveal_guard(p: Principal) -> None:
    await ratelimit.enforce(
        f"reveal:{p.user_id}", limit=REVEAL_LIMIT, window_seconds=600, code="pii.reveal_rate_limited", fail_closed=True
    )


def _addr_out(a: Address, *, full: bool) -> dict:
    line1 = a.line1 if full else (a.line1[:3] + "•••" if a.line1 else None)
    return {
        "id": str(a.id),
        "label": a.label,
        "line1": line1,
        "line2": a.line2 if full else None,
        "landmark": a.landmark if full else None,
        "locality": a.locality,
        "city": a.city,
        "postal_code": a.postal_code,
        "location": {"lat": a.lat, "lng": a.lng},
        "contact_phone": a.contact_phone_e164 if full else mask_phone(a.contact_phone_e164),
        "instructions": a.delivery_instructions if full else None,
    }


# --- Customers ----------------------------------------------------------------------------------


@router.get("/users/{user_id}")
async def user_detail(user_id: uuid.UUID, p: Viewer, db: DB) -> dict:
    user = await db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise ProblemError(404, "user.not_found")
    totals = (
        await db.execute(
            select(
                func.count(),
                func.count().filter(Order.status == "delivered"),
                func.count().filter(Order.status == "cancelled"),
                func.coalesce(func.sum(Order.total_minor).filter(Order.status == "delivered"), 0),
                func.min(Order.created_at),
                func.max(Order.created_at),
            ).where(Order.customer_user_id == user.id)
        )
    ).one()
    orders = (
        await db.execute(
            select(Order, Restaurant.display_name)
            .join(Restaurant, Restaurant.id == Order.restaurant_id)
            .where(Order.customer_user_id == user.id)
            .order_by(Order.created_at.desc())
            .limit(15)
        )
    ).all()
    favourite = (
        await db.execute(
            select(Restaurant.display_name, func.count())
            .join(Order, Order.restaurant_id == Restaurant.id)
            .where(Order.customer_user_id == user.id)
            .group_by(Restaurant.display_name)
            .order_by(func.count().desc())
            .limit(1)
        )
    ).first()
    addresses = (
        await db.execute(select(Address).where(Address.user_id == user.id, Address.deleted_at.is_(None)).order_by(Address.created_at))
    ).scalars().all()
    sessions = (
        await db.execute(
            select(AuthSession)
            .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None), AuthSession.expires_at > order_svc.now())
            .order_by(AuthSession.last_used_at.desc())
            .limit(10)
        )
    ).scalars().all()
    partner = (await db.execute(select(DeliveryPartner.id, DeliveryPartner.status).where(DeliveryPartner.user_id == user.id))).first()
    n, delivered, cancelled, spent, first_at, last_at = totals
    return {
        "id": str(user.id),
        "name": user.full_name,
        "masked_phone": mask_phone(user.phone_e164),
        "masked_email": mask_email(user.email),
        "has_email": user.email is not None,
        "phone_verified": user.phone_verified_at is not None,
        "roles": user.role_names,
        "status": user.status,
        "created_at": user.created_at,
        "last_login_at": user.last_login_at,
        "stats": {
            "orders": n,
            "delivered": delivered,
            "cancelled": cancelled,
            "total_spent": money(int(spent)),
            "average_order": money(int(spent) // delivered if delivered else 0),
            "first_order_at": first_at,
            "last_order_at": last_at,
            "favourite_restaurant": favourite[0] if favourite else None,
        },
        "addresses": [_addr_out(a, full=False) for a in addresses],
        "recent_orders": [
            {
                "id": str(o.id), "order_number": o.order_number, "restaurant_name": rname, "status": o.status,
                "total": money(o.total_minor), "placed_at": o.placed_at or o.created_at,
            }
            for o, rname in orders
        ],
        "sessions": [
            {"id": str(s.id), "client_app": s.client_app, "device_name": s.device_name, "last_used_at": s.last_used_at, "created_at": s.created_at}
            for s in sessions
        ],
        "delivery_partner": {"id": str(partner[0]), "status": partner[1]} if partner else None,
    }


@router.post("/users/{user_id}/reveal")
async def reveal_user(user_id: uuid.UUID, p: Contact, db: DB) -> dict:
    await _reveal_guard(p)
    user = await db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise ProblemError(404, "user.not_found")
    if "admin" in user.role_names and p.admin_role != "super_admin":
        raise ProblemError(403, "auth.forbidden", "Only a super admin can view another admin's contact details.")
    addresses = (
        await db.execute(select(Address).where(Address.user_id == user.id, Address.deleted_at.is_(None)).order_by(Address.created_at))
    ).scalars().all()
    audit(db, p, "pii.reveal", "user", user.id, {"fields": ["phone", "email", "addresses"]})
    await db.commit()
    return {
        "phone_e164": user.phone_e164,
        "email": user.email,
        "addresses": [_addr_out(a, full=True) for a in addresses],
    }


@router.post("/users/{user_id}/sessions/revoke")
async def revoke_user_sessions(user_id: uuid.UUID, p: Ops, db: DB) -> dict:
    user = await db.get(User, user_id)
    if user is None:
        raise ProblemError(404, "user.not_found")
    if "admin" in user.role_names and p.admin_role != "super_admin":
        raise ProblemError(403, "auth.forbidden")
    n = await auth_svc.revoke_all_sessions(db, user.id, "admin")
    audit(db, p, "user.sessions_revoked", "user", user.id, {"sessions_revoked": n})
    await db.commit()
    return {"sessions_revoked": n}


# --- Orders & riders -----------------------------------------------------------------------------


@router.post("/orders/{order_id}/reveal")
async def reveal_order_contact(order_id: uuid.UUID, p: Contact, db: DB) -> dict:
    await _reveal_guard(p)
    o = await db.get(Order, order_id)
    if o is None:
        raise ProblemError(404, "order.not_found")
    customer = await db.get(User, o.customer_user_id)
    audit(db, p, "pii.reveal", "order", o.id, {"fields": ["customer_phone", "delivery_contact"]})
    await db.commit()
    return {
        "customer_phone_e164": customer.phone_e164 if customer else None,
        "customer_email": customer.email if customer else None,
        "delivery_contact_phone_e164": o.delivery_address.get("contact_phone_e164"),
        "delivery_contact_name": o.delivery_address.get("contact_name"),
    }


@router.post("/delivery-partners/{partner_id}/reveal")
async def reveal_partner(partner_id: uuid.UUID, p: Contact, db: DB) -> dict:
    await _reveal_guard(p)
    partner = await db.get(DeliveryPartner, partner_id)
    if partner is None:
        raise ProblemError(404, "delivery_partner.not_found")
    user = await db.get(User, partner.user_id)
    # Identity documents are the most sensitive data we hold: full numbers for super admins only.
    docs = p.admin_role == "super_admin"
    audit(db, p, "pii.reveal", "delivery_partner", partner.id, {"fields": ["phone", *(["documents"] if docs else [])]})
    await db.commit()
    return {
        "phone_e164": user.phone_e164 if user else None,
        "email": user.email if user else None,
        "vehicle_registration": partner.vehicle_registration if docs else None,
        "driving_license_number": partner.driving_license_number if docs else None,
        "documents_visible": docs,
    }


# --- Restaurants -----------------------------------------------------------------------------------


@router.get("/restaurants/{restaurant_id}")
async def restaurant_detail(restaurant_id: uuid.UUID, p: Viewer, db: DB) -> dict:
    r = await db.get(Restaurant, restaurant_id)
    if r is None:
        raise ProblemError(404, "restaurant.not_found")
    today = _today_start()
    stats = (
        await db.execute(
            select(
                func.count().filter(Order.created_at >= today),
                func.coalesce(func.sum(Order.total_minor).filter(Order.created_at >= today, Order.status == "delivered"), 0),
                func.count().filter(Order.status.in_(order_svc.LIVE_STATUSES)),
                func.count().filter(Order.status == "cancelled", Order.cancelled_by == "restaurant"),
                func.count(),
            ).where(Order.restaurant_id == r.id)
        )
    ).one()
    cats = (
        await db.execute(
            select(MenuCategory).where(MenuCategory.restaurant_id == r.id, MenuCategory.deleted_at.is_(None)).order_by(MenuCategory.sort_order)
        )
    ).scalars().all()
    items = (
        await db.execute(select(MenuItem).where(MenuItem.restaurant_id == r.id, MenuItem.deleted_at.is_(None)).order_by(MenuItem.sort_order))
    ).scalars().all()
    recent = (
        await db.execute(select(Order).where(Order.restaurant_id == r.id).order_by(Order.created_at.desc()).limit(8))
    ).scalars().all()
    by_cat: dict[uuid.UUID, list[dict]] = {}
    for m in items:
        by_cat.setdefault(m.category_id, []).append(
            {"id": str(m.id), "name": m.name, "price": money(m.price_minor), "food_type": m.food_type,
             "is_available": m.is_available, "is_bestseller": m.is_bestseller}
        )
    today_n, today_gmv, live, rejected, total = stats
    return {
        "id": str(r.id),
        "name": r.display_name,
        "description": r.description,
        "status": r.status,
        "status_reason": r.status_reason,
        "is_accepting_orders": r.is_accepting_orders,
        "phone_e164": r.phone_e164,  # business line, not personal data
        "address": ", ".join(
            part for part in (r.address_line1, None if r.locality in r.address_line1 else r.locality, f"{r.city} {r.postal_code}") if part
        ),
        "location": {"lat": r.lat, "lng": r.lng},
        "cuisines": [c.name for c in r.cuisines],
        "image_url": r.image_url,
        "rating": {"average": float(r.rating_avg or 0), "count": r.rating_count},
        "commission_bps": r.commission_bps,
        "avg_prep_minutes": r.avg_prep_minutes,
        "min_order": money(r.min_order_minor),
        "packaging_fee": money(r.packaging_fee_minor),
        "is_pure_veg": r.is_pure_veg,
        "stats": {"orders_today": today_n, "gmv_today": money(int(today_gmv)), "live_orders": live, "rejected_by_restaurant": rejected, "orders_all_time": total},
        "menu": [
            {"id": str(c.id), "name": c.name, "items": by_cat.get(c.id, [])} for c in cats
        ],
        "recent_orders": [
            {"id": str(o.id), "order_number": o.order_number, "status": o.status, "total": money(o.total_minor), "placed_at": o.placed_at or o.created_at}
            for o in recent
        ],
    }


# --- Global search (command palette) ------------------------------------------------------------


@router.get("/search")
async def search(p: Viewer, db: DB, q: Annotated[str, Query(min_length=2, max_length=60)]) -> dict:
    await ratelimit.enforce(f"search:{p.user_id}", limit=60, window_seconds=60)
    term = q.strip()
    like = f"%{_escape_like(term)}%"
    orders = (
        await db.execute(
            select(Order.id, Order.order_number, Order.status, Order.total_minor)
            .where(Order.order_number.ilike(like, escape="\\"))
            .order_by(Order.created_at.desc())
            .limit(5)
        )
    ).all()
    users = (
        await db.execute(select(User).where(User.deleted_at.is_(None), _user_search(term)).order_by(User.created_at.desc()).limit(6))
    ).scalars().all()
    partner_by_user = dict(
        (await db.execute(select(DeliveryPartner.user_id, DeliveryPartner.id).where(DeliveryPartner.user_id.in_([u.id for u in users])))).all()
    ) if users else {}
    restaurants = (
        await db.execute(
            select(Restaurant.id, Restaurant.display_name, Restaurant.locality, Restaurant.status)
            .where(or_(Restaurant.display_name.ilike(like, escape="\\"), Restaurant.locality.ilike(like, escape="\\")))
            .limit(5)
        )
    ).all()
    return {
        "orders": [{"id": str(i), "order_number": n, "status": s, "total": money(t)} for i, n, s, t in orders],
        "people": [
            {
                "id": str(u.id), "name": u.full_name, "masked_phone": mask_phone(u.phone_e164), "roles": u.role_names,
                "delivery_partner_id": str(partner_by_user[u.id]) if u.id in partner_by_user else None,
            }
            for u in users
        ],
        "restaurants": [{"id": str(i), "name": n, "locality": loc, "status": s} for i, n, loc, s in restaurants],
    }

