from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from geoalchemy2 import Geography
from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, EncryptedJSON, EncryptedString, Timestamps, UUIDPk

ORDER_STATUSES = ("pending_payment", "placed", "preparing", "ready_for_pickup", "picked_up", "delivered", "cancelled")
PAYMENT_STATUSES = ("pending", "paid", "failed", "refund_pending", "partially_refunded", "refunded", "not_applicable")
ACTOR_TYPES = ("customer", "restaurant", "delivery_partner", "system", "admin")


def _in(col: str, values: tuple[str, ...]) -> str:
    return f"{col} IN ({', '.join(repr(v) for v in values)})"


class Cart(UUIDPk, Base):
    __tablename__ = "carts"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    restaurant_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("restaurants.id"))
    address_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("addresses.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), onupdate=text("now()"))

    items: Mapped[list[CartItem]] = relationship(
        lazy="selectin", cascade="all, delete-orphan", order_by="CartItem.created_at"
    )


class CartItem(UUIDPk, Base):
    __tablename__ = "cart_items"

    cart_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("carts.id", ondelete="CASCADE"), index=True)
    menu_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("menu_items.id"))
    quantity: Mapped[int] = mapped_column(SmallInteger)
    # Sorted list of selected option ids (validated against the item's option groups on every read).
    option_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)
    notes: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    __table_args__ = (CheckConstraint("quantity BETWEEN 1 AND 50", name="quantity"),)


class Order(UUIDPk, Timestamps, Base):
    __tablename__ = "orders"

    order_number: Mapped[str] = mapped_column(String(16), unique=True)
    customer_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    restaurant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("restaurants.id"))
    zone_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("service_zones.id"))
    status: Mapped[str] = mapped_column(String(20))
    payment_method: Mapped[str] = mapped_column(String(8))
    payment_status: Mapped[str] = mapped_column(String(20))
    # Snapshot of the address at placement time, encrypted as a whole.
    delivery_address: Mapped[dict[str, Any]] = mapped_column(EncryptedJSON("orders.delivery_address"))
    delivery_lat: Mapped[float] = mapped_column()
    delivery_lng: Mapped[float] = mapped_column()
    delivery_location = mapped_column(Geography("POINT", srid=4326), nullable=False)
    delivery_distance_m: Mapped[int] = mapped_column(Integer)
    subtotal_minor: Mapped[int] = mapped_column(BigInteger)
    packaging_fee_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    delivery_fee_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    platform_fee_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    tax_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    discount_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    tip_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    total_minor: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    special_instructions: Mapped[str | None] = mapped_column(String(500))
    idempotency_key: Mapped[str] = mapped_column(String(64))
    idempotency_hash: Mapped[str] = mapped_column(String(64))
    # 4-digit code the customer gives the rider at handover; encrypted at rest.
    delivery_otp: Mapped[str] = mapped_column(EncryptedString("orders.delivery_otp"))
    estimated_ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    estimated_delivery_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    placed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    picked_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_by: Mapped[str | None] = mapped_column(String(16))
    cancellation_reason: Mapped[str | None] = mapped_column(String(64))
    version: Mapped[int] = mapped_column(Integer, default=1)

    items: Mapped[list[OrderItem]] = relationship(lazy="selectin", order_by="OrderItem.created_at")
    events: Mapped[list[OrderStatusEvent]] = relationship(lazy="selectin", order_by="OrderStatusEvent.created_at")

    __table_args__ = (
        CheckConstraint(_in("status", ORDER_STATUSES), name="status"),
        CheckConstraint(_in("payment_status", PAYMENT_STATUSES), name="payment_status"),
        CheckConstraint("payment_method IN ('online', 'cod')", name="payment_method"),
        CheckConstraint(
            "total_minor = subtotal_minor + packaging_fee_minor + delivery_fee_minor + platform_fee_minor"
            " + tax_minor + tip_minor - discount_minor",
            name="total_matches",
        ),
        CheckConstraint(
            "total_minor >= 0 AND subtotal_minor >= 0 AND packaging_fee_minor >= 0 AND delivery_fee_minor >= 0"
            " AND platform_fee_minor >= 0 AND tax_minor >= 0 AND discount_minor >= 0 AND tip_minor >= 0",
            name="amounts_non_negative",
        ),
        CheckConstraint("(status = 'cancelled') = (cancelled_at IS NOT NULL)", name="cancelled_consistent"),
        UniqueConstraint("customer_user_id", "idempotency_key", name="uq_orders_idempotency"),
        Index("ix_orders_customer_created", "customer_user_id", text("created_at DESC")),
        Index("ix_orders_restaurant_status", "restaurant_id", "status", text("placed_at DESC")),
        Index("ix_orders_live", "status", postgresql_where=text("status NOT IN ('delivered', 'cancelled')")),
        Index("ix_orders_created", "created_at", postgresql_using="brin"),
    )


class OrderItem(UUIDPk, Base):
    __tablename__ = "order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), index=True)
    menu_item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("menu_items.id"))
    name: Mapped[str] = mapped_column(String(120))
    food_type: Mapped[str] = mapped_column(String(8))
    unit_price_minor: Mapped[int] = mapped_column(BigInteger)
    options_price_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    quantity: Mapped[int] = mapped_column(SmallInteger)
    line_total_minor: Mapped[int] = mapped_column(BigInteger)
    # Snapshot: [{"group_name", "option_name", "price_delta_minor"}]
    options: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    notes: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    __table_args__ = (
        CheckConstraint("quantity BETWEEN 1 AND 50", name="quantity"),
        CheckConstraint(
            "line_total_minor = (unit_price_minor + options_price_minor) * quantity", name="line_total"
        ),
    )


class OrderStatusEvent(UUIDPk, Base):
    __tablename__ = "order_status_events"

    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"))
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20))
    actor_type: Mapped[str] = mapped_column(String(20))
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    __table_args__ = (
        CheckConstraint(_in("actor_type", ACTOR_TYPES), name="actor_type"),
        Index("ix_order_status_events_order", "order_id", "created_at"),
    )
