from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from geoalchemy2 import Geography
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EncryptedString, Timestamps, UUIDPk

PARTNER_STATUSES = ("onboarding", "pending_review", "active", "suspended", "rejected", "offboarded")
VEHICLE_TYPES = ("bicycle", "motorcycle", "scooter", "ev_scooter")
ASSIGNMENT_STATUSES = (
    "offered",
    "accepted",
    "rejected",
    "expired",
    "arrived_at_restaurant",
    "picked_up",
    "arrived_at_customer",
    "delivered",
    "cancelled",
    "failed",
)
ACTIVE_ASSIGNMENT_STATUSES = ("accepted", "arrived_at_restaurant", "picked_up", "arrived_at_customer")


def _in(col: str, values: tuple[str, ...]) -> str:
    return f"{col} IN ({', '.join(repr(v) for v in values)})"


_ACTIVE = text("status IN ('accepted', 'arrived_at_restaurant', 'picked_up', 'arrived_at_customer')")


class DeliveryPartner(UUIDPk, Timestamps, Base):
    __tablename__ = "delivery_partners"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), unique=True)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("service_zones.id"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="onboarding", server_default="onboarding")
    status_reason: Mapped[str | None] = mapped_column(String(300))
    vehicle_type: Mapped[str | None] = mapped_column(String(16))
    vehicle_registration: Mapped[str | None] = mapped_column(EncryptedString("delivery_partners.vehicle_registration"))
    driving_license_number: Mapped[str | None] = mapped_column(
        EncryptedString("delivery_partners.driving_license_number")
    )
    is_online: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    last_online_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rating_avg: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    rating_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))

    __table_args__ = (
        CheckConstraint(_in("status", PARTNER_STATUSES), name="status"),
        CheckConstraint(f"vehicle_type IS NULL OR {_in('vehicle_type', VEHICLE_TYPES)}", name="vehicle_type"),
    )


class DeliveryAssignment(UUIDPk, Base):
    __tablename__ = "delivery_assignments"

    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    delivery_partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("delivery_partners.id"))
    status: Mapped[str] = mapped_column(String(24))
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))  # set for manual admin assignment
    offered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    offer_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    arrived_restaurant_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    picked_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    arrived_customer_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pickup_distance_m: Mapped[int | None] = mapped_column(Integer)
    drop_distance_m: Mapped[int | None] = mapped_column(Integer)
    payout_minor: Mapped[int | None] = mapped_column(BigInteger)
    cod_collected_minor: Mapped[int | None] = mapped_column(BigInteger)
    cancel_reason: Mapped[str | None] = mapped_column(String(64))
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    __table_args__ = (
        CheckConstraint(_in("status", ASSIGNMENT_STATUSES), name="status"),
        # One active rider per order, and (MVP) one active order per rider.
        Index("uq_assignments_active_order", "order_id", unique=True, postgresql_where=_ACTIVE),
        Index("uq_assignments_active_partner", "delivery_partner_id", unique=True, postgresql_where=_ACTIVE),
        Index(
            "uq_assignments_open_offer",
            "order_id",
            "delivery_partner_id",
            unique=True,
            postgresql_where=text("status = 'offered'"),
        ),
        Index("ix_assignments_partner_created", "delivery_partner_id", text("created_at DESC")),
    )


class DeliveryLocationPing(Base):
    __tablename__ = "delivery_location_pings"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    assignment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("delivery_assignments.id", ondelete="CASCADE"))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    location = mapped_column(Geography("POINT", srid=4326, spatial_index=False), nullable=False)
    accuracy_m: Mapped[float | None] = mapped_column(Float)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("ix_pings_assignment_time", "assignment_id", "recorded_at"),)
