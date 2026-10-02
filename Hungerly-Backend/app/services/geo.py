from __future__ import annotations

import math

from geoalchemy2.elements import WKTElement
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ServiceZone


def point(lat: float, lng: float) -> WKTElement:
    # Coordinates are validated floats; formatting them cannot inject SQL.
    return WKTElement(f"POINT({float(lng):.7f} {float(lat):.7f})", srid=4326)


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return int(2 * r * math.asin(math.sqrt(a)))


async def zone_for(db: AsyncSession, lat: float, lng: float) -> ServiceZone | None:
    stmt = (
        select(ServiceZone)
        .where(ServiceZone.is_active.is_(True), func.ST_Covers(ServiceZone.boundary, point(lat, lng)))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()
