from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EncryptedString, Timestamps, UUIDPk


class City(UUIDPk, Timestamps, Base):
    __tablename__ = "cities"

    name: Mapped[str] = mapped_column(String(80))
    state: Mapped[str] = mapped_column(String(80))
    country_code: Mapped[str] = mapped_column(String(2), default="IN", server_default="IN")
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata")
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    __table_args__ = (UniqueConstraint("country_code", "state", "name", name="uq_cities_name"),)


class ServiceZone(UUIDPk, Timestamps, Base):
    __tablename__ = "service_zones"

    city_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cities.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    boundary = mapped_column(Geography("MULTIPOLYGON", srid=4326, spatial_index=True), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    max_delivery_radius_m: Mapped[int] = mapped_column(Integer, default=7000)
    base_delivery_fee_minor: Mapped[int] = mapped_column(BigInteger, default=2000)
    per_km_fee_minor: Mapped[int] = mapped_column(BigInteger, default=500)
    free_delivery_threshold_minor: Mapped[int | None] = mapped_column(BigInteger)
    cod_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")


class Address(UUIDPk, Timestamps, Base):
    __tablename__ = "addresses"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(8))
    line1: Mapped[str] = mapped_column(EncryptedString("addresses.line1"))
    line2: Mapped[str | None] = mapped_column(EncryptedString("addresses.line2"))
    landmark: Mapped[str | None] = mapped_column(EncryptedString("addresses.landmark"))
    locality: Mapped[str] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(80))
    state: Mapped[str] = mapped_column(String(80))
    postal_code: Mapped[str] = mapped_column(String(10))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    location = mapped_column(Geography("POINT", srid=4326, spatial_index=True), nullable=False)
    contact_name: Mapped[str | None] = mapped_column(EncryptedString("addresses.contact_name"))
    contact_phone_e164: Mapped[str | None] = mapped_column(EncryptedString("addresses.contact_phone_e164"))
    delivery_instructions: Mapped[str | None] = mapped_column(EncryptedString("addresses.delivery_instructions"))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (CheckConstraint("label IN ('home', 'work', 'other')", name="label"),)
