"""Server-side pricing. The client never supplies prices: every bill is recomputed from live menu
data, zone fees and settings."""

from __future__ import annotations

import math
import uuid
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ProblemError
from app.models import CartItem, MenuItem, Restaurant, ServiceZone


@dataclass(slots=True)
class PricedLine:
    cart_item_id: uuid.UUID | None
    menu_item: MenuItem
    quantity: int
    unit_price_minor: int
    options_price_minor: int
    options: list[dict]
    option_ids: list[str]
    notes: str | None
    is_available: bool

    @property
    def line_total_minor(self) -> int:
        return (self.unit_price_minor + self.options_price_minor) * self.quantity


@dataclass(slots=True)
class Bill:
    subtotal_minor: int = 0
    packaging_fee_minor: int = 0
    delivery_fee_minor: int = 0
    platform_fee_minor: int = 0
    tax_minor: int = 0
    discount_minor: int = 0
    tip_minor: int = 0

    @property
    def total_minor(self) -> int:
        return (
            self.subtotal_minor + self.packaging_fee_minor + self.delivery_fee_minor + self.platform_fee_minor
            + self.tax_minor + self.tip_minor - self.discount_minor
        )

    def as_dict(self) -> dict[str, int]:
        return {
            "subtotal_minor": self.subtotal_minor,
            "packaging_fee_minor": self.packaging_fee_minor,
            "delivery_fee_minor": self.delivery_fee_minor,
            "platform_fee_minor": self.platform_fee_minor,
            "tax_minor": self.tax_minor,
            "discount_minor": self.discount_minor,
            "tip_minor": self.tip_minor,
            "total_minor": self.total_minor,
        }


@dataclass(slots=True)
class PricedCart:
    lines: list[PricedLine]
    bill: Bill
    warnings: list[dict] = field(default_factory=list)


def validate_options(item: MenuItem, option_ids: list[str]) -> tuple[int, list[dict], bool]:
    """Return (options_price_minor, snapshot, all_available). Raises on structurally invalid choices."""
    chosen = set(option_ids)
    if len(chosen) != len(option_ids):
        raise ProblemError(422, "cart.options_invalid", "An option was selected twice.")
    known: set[str] = set()
    price = 0
    snapshot: list[dict] = []
    available = True
    for group in item.option_groups:
        picked = [o for o in group.options if str(o.id) in chosen]
        known.update(str(o.id) for o in group.options)
        if not (group.min_select <= len(picked) <= group.max_select):
            raise ProblemError(
                422, "cart.options_invalid", f"Choose between {group.min_select} and {group.max_select} for {group.name}."
            )
        for o in picked:
            available = available and o.is_available
            price += o.price_delta_minor
            snapshot.append({"group_name": group.name, "option_name": o.name, "price_delta_minor": o.price_delta_minor})
    if chosen - known:
        raise ProblemError(422, "cart.options_invalid", "An option does not belong to this item.")
    return price, snapshot, available


async def load_items(db: AsyncSession, restaurant_id: uuid.UUID, ids: list[uuid.UUID]) -> dict[uuid.UUID, MenuItem]:
    if not ids:
        return {}
    rows = await db.execute(
        select(MenuItem).where(
            MenuItem.id.in_(ids), MenuItem.restaurant_id == restaurant_id, MenuItem.deleted_at.is_(None)
        )
    )
    return {m.id: m for m in rows.scalars()}


async def price_cart_items(db: AsyncSession, restaurant_id: uuid.UUID, items: list[CartItem]) -> list[PricedLine]:
    menu = await load_items(db, restaurant_id, [ci.menu_item_id for ci in items])
    lines: list[PricedLine] = []
    for ci in items:
        item = menu.get(ci.menu_item_id)
        if item is None:
            continue  # removed from menu; dropped from the bill
        try:
            opt_price, snapshot, opts_ok = validate_options(item, list(ci.option_ids or []))
        except ProblemError:
            opt_price, snapshot, opts_ok = 0, [], False
        lines.append(
            PricedLine(
                cart_item_id=ci.id,
                menu_item=item,
                quantity=ci.quantity,
                unit_price_minor=item.price_minor,
                options_price_minor=opt_price,
                options=snapshot,
                option_ids=list(ci.option_ids or []),
                notes=ci.notes,
                is_available=item.is_available and item.is_active and opts_ok,
            )
        )
    return lines


def delivery_fee(zone: ServiceZone, distance_m: int, subtotal_minor: int) -> int:
    if zone.free_delivery_threshold_minor is not None and subtotal_minor >= zone.free_delivery_threshold_minor:
        return 0
    km = math.ceil(distance_m / 1000)
    return zone.base_delivery_fee_minor + zone.per_km_fee_minor * max(0, km - 2)


def compute_bill(
    lines: list[PricedLine], restaurant: Restaurant, zone: ServiceZone | None, distance_m: int | None, tip_minor: int = 0
) -> Bill:
    settings = get_settings()
    subtotal = sum(line.line_total_minor for line in lines if line.is_available)
    bill = Bill(subtotal_minor=subtotal, tip_minor=tip_minor)
    if subtotal == 0:
        return bill
    bill.packaging_fee_minor = restaurant.packaging_fee_minor
    bill.platform_fee_minor = settings.platform_fee_minor
    # Integer basis points, rounded half-up: no floating point for money.
    bill.tax_minor = (subtotal * settings.tax_rate_bps + 5000) // 10000
    if zone is not None and distance_m is not None:
        bill.delivery_fee_minor = delivery_fee(zone, distance_m, subtotal)
    return bill
