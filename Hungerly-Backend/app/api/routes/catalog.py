from __future__ import annotations

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select

from app.api.deps import DB, PUBLIC
from app.core import ratelimit
from app.core.errors import ProblemError
from app.models import Cuisine, MenuCategory, MenuItem, Restaurant
from app.schemas.common import money
from app.services.geo import haversine_m, point, zone_for

router = APIRouter(
    prefix="/catalog",
    tags=["catalog"],
    dependencies=[Depends(ratelimit.limit_by_ip("catalog", limit=120, window_seconds=60))],
)

Lat = Annotated[float, Query(ge=6.0, le=38.0)]
Lng = Annotated[float, Query(ge=68.0, le=98.0)]
OptLat = Annotated[float | None, Query(ge=6.0, le=38.0)]
OptLng = Annotated[float | None, Query(ge=68.0, le=98.0)]


def _eta(r: Restaurant, distance_m: int | None) -> dict:
    travel = max(5, (distance_m or 3000) // 300)
    base = r.avg_prep_minutes + travel
    return {"min": base, "max": base + 10}


def restaurant_summary(r: Restaurant, distance_m: int | None) -> dict:
    return {
        "id": str(r.id),
        "slug": r.slug,
        "name": r.display_name,
        "cuisines": [c.name for c in r.cuisines],
        "image_url": r.image_url,
        "rating": {"average": float(r.rating_avg or 0), "count": r.rating_count},
        "delivery_time_minutes": _eta(r, distance_m),
        "distance_m": distance_m,
        "price_level": r.price_level,
        "cost_for_two": money(r.cost_for_two_minor),
        "is_open": r.status == "active" and r.is_accepting_orders,
        "is_pure_veg": r.is_pure_veg,
    }


@router.get("/serviceability", openapi_extra={PUBLIC: True})
async def serviceability(lat: Lat, lng: Lng, db: DB) -> dict:
    zone = await zone_for(db, lat, lng)
    return {"serviceable": zone is not None, "zone_id": str(zone.id) if zone else None}


@router.get("/cuisines", openapi_extra={PUBLIC: True})
async def cuisines(db: DB) -> list[dict]:
    rows = (await db.execute(select(Cuisine).order_by(Cuisine.name))).scalars()
    return [{"id": str(c.id), "name": c.name, "slug": c.slug} for c in rows]


@router.get("/restaurants", openapi_extra={PUBLIC: True})
async def list_restaurants(
    db: DB,
    lat: Lat,
    lng: Lng,
    veg_only: bool = False,
    cuisine: Annotated[str | None, Query(max_length=60, pattern=r"^[a-z0-9-]+$")] = None,
    q: Annotated[str | None, Query(min_length=2, max_length=60)] = None,
    sort: Literal["relevance", "rating", "delivery_time", "distance"] = "relevance",
    limit: Annotated[int, Query(ge=1, le=50)] = 30,
) -> dict:
    zone = await zone_for(db, lat, lng)
    if zone is None:
        return {"items": [], "serviceable": False, "next_cursor": None}
    here = point(lat, lng)
    distance = func.ST_Distance(Restaurant.location, here)
    stmt = (
        select(Restaurant, distance.label("distance"))
        .where(
            Restaurant.zone_id == zone.id,
            Restaurant.status == "active",
            func.ST_DWithin(Restaurant.location, here, zone.max_delivery_radius_m),
        )
        .limit(limit)
    )
    if veg_only:
        stmt = stmt.where(Restaurant.is_pure_veg.is_(True))
    if cuisine:
        stmt = stmt.where(Restaurant.cuisines.any(Cuisine.slug == cuisine))
    if q:
        # Bound parameter; `%`/`_` are escaped so user input cannot widen the pattern.
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        stmt = stmt.where(Restaurant.display_name.ilike(f"%{escaped}%", escape="\\"))
    # Sorting is allow-listed: the user picks a key, never a column name.
    order = {
        "rating": [Restaurant.rating_avg.desc().nulls_last(), distance],
        "delivery_time": [Restaurant.avg_prep_minutes + distance / 300, distance],
        "distance": [distance],
        "relevance": [Restaurant.is_accepting_orders.desc(), Restaurant.rating_avg.desc().nulls_last(), distance],
    }[sort]
    rows = (await db.execute(stmt.order_by(*order))).all()
    items = [restaurant_summary(r, int(d)) for r, d in rows]
    items.sort(key=lambda i: not i["is_open"])  # closed restaurants last
    return {"items": items, "serviceable": True, "next_cursor": None}


async def _active_restaurant(db: DB, restaurant_id: uuid.UUID) -> Restaurant:
    r = await db.get(Restaurant, restaurant_id)
    if r is None or r.status != "active":
        raise ProblemError(404, "restaurant.not_found")
    return r


@router.get("/restaurants/{restaurant_id}", openapi_extra={PUBLIC: True})
async def get_restaurant(
    restaurant_id: uuid.UUID, db: DB, lat: OptLat = None, lng: OptLng = None
) -> dict:
    r = await _active_restaurant(db, restaurant_id)
    distance = haversine_m(lat, lng, r.lat, r.lng) if lat is not None and lng is not None else None
    return {
        **restaurant_summary(r, distance),
        "description": r.description,
        "locality": r.locality,
        "minimum_order": money(r.min_order_minor),
        "packaging_fee": money(r.packaging_fee_minor),
    }


def menu_item_out(m: MenuItem) -> dict:
    return {
        "id": str(m.id),
        "category_id": str(m.category_id),
        "name": m.name,
        "description": m.description,
        "price": money(m.price_minor),
        "food_type": m.food_type,
        "image_url": m.image_url,
        "is_available": m.is_available,
        "is_bestseller": m.is_bestseller,
        "option_groups": [
            {
                "id": str(g.id),
                "name": g.name,
                "min_select": g.min_select,
                "max_select": g.max_select,
                "options": [
                    {"id": str(o.id), "name": o.name, "price_delta": money(o.price_delta_minor), "is_available": o.is_available}
                    for o in g.options
                ],
            }
            for g in m.option_groups
        ],
    }


@router.get("/restaurants/{restaurant_id}/menu", openapi_extra={PUBLIC: True})
async def get_menu(restaurant_id: uuid.UUID, db: DB) -> dict:
    r = await _active_restaurant(db, restaurant_id)
    cats = (
        await db.execute(
            select(MenuCategory)
            .where(MenuCategory.restaurant_id == r.id, MenuCategory.is_active.is_(True), MenuCategory.deleted_at.is_(None))
            .order_by(MenuCategory.sort_order)
        )
    ).scalars().all()
    items = (
        await db.execute(
            select(MenuItem)
            .where(MenuItem.restaurant_id == r.id, MenuItem.is_active.is_(True), MenuItem.deleted_at.is_(None))
            .order_by(MenuItem.sort_order)
        )
    ).scalars().all()
    by_cat: dict[uuid.UUID, list[dict]] = {}
    for m in items:
        by_cat.setdefault(m.category_id, []).append(menu_item_out(m))
    return {
        "restaurant_id": str(r.id),
        "is_open": r.is_accepting_orders,
        "categories": [{"id": str(c.id), "name": c.name, "foods": by_cat.get(c.id, [])} for c in cats if by_cat.get(c.id)],
    }
