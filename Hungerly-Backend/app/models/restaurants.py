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
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPk

RESTAURANT_STATUSES = ("draft", "pending_review", "active", "suspended", "rejected", "closed")
FOOD_TYPES = ("veg", "non_veg", "egg")


class Cuisine(UUIDPk, Base):
    __tablename__ = "cuisines"

    name: Mapped[str] = mapped_column(String(60), unique=True)
    slug: Mapped[str] = mapped_column(String(60), unique=True)


class RestaurantCuisine(Base):
    __tablename__ = "restaurant_cuisines"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), primary_key=True)
    cuisine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cuisines.id", ondelete="CASCADE"), primary_key=True)


class Restaurant(UUIDPk, Timestamps, Base):
    __tablename__ = "restaurants"

    slug: Mapped[str] = mapped_column(CITEXT, unique=True)
    display_name: Mapped[str] = mapped_column(String(120))
    legal_name: Mapped[str | None] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    phone_e164: Mapped[str] = mapped_column(String(16))
    zone_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("service_zones.id"), index=True)
    address_line1: Mapped[str] = mapped_column(String(200))
    locality: Mapped[str] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(80))
    postal_code: Mapped[str] = mapped_column(String(10))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    location = mapped_column(Geography("POINT", srid=4326, spatial_index=True), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="draft", server_default="draft")
    status_reason: Mapped[str | None] = mapped_column(String(300))
    is_accepting_orders: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    is_pure_veg: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    avg_prep_minutes: Mapped[int] = mapped_column(Integer, default=20)
    price_level: Mapped[int] = mapped_column(SmallInteger, default=2)
    cost_for_two_minor: Mapped[int] = mapped_column(BigInteger, default=40000)
    min_order_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    packaging_fee_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    commission_bps: Mapped[int] = mapped_column(Integer, default=1800)
    image_url: Mapped[str | None] = mapped_column(String(500))
    rating_avg: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    rating_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))

    cuisines: Mapped[list[Cuisine]] = relationship(secondary="restaurant_cuisines", lazy="selectin")

    __table_args__ = (
        CheckConstraint(
            "status IN (" + ", ".join(repr(s) for s in RESTAURANT_STATUSES) + ")", name="status"
        ),
        CheckConstraint("avg_prep_minutes BETWEEN 5 AND 120", name="prep_minutes"),
        CheckConstraint("commission_bps BETWEEN 0 AND 10000", name="commission"),
        CheckConstraint("price_level BETWEEN 1 AND 3", name="price_level"),
        CheckConstraint("min_order_minor >= 0 AND packaging_fee_minor >= 0", name="fees"),
        Index("ix_restaurants_active_zone", "zone_id", postgresql_where=text("status = 'active'")),
    )


class MenuCategory(UUIDPk, Timestamps, Base):
    __tablename__ = "menu_categories"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (UniqueConstraint("id", "restaurant_id", name="uq_menu_categories_id_restaurant"),)


class MenuItem(UUIDPk, Timestamps, Base):
    __tablename__ = "menu_items"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), index=True)
    category_id: Mapped[uuid.UUID] = mapped_column()
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(String(500))
    price_minor: Mapped[int] = mapped_column(BigInteger)
    food_type: Mapped[str] = mapped_column(String(8))
    image_url: Mapped[str | None] = mapped_column(String(500))
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    is_bestseller: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    option_groups: Mapped[list[MenuOptionGroup]] = relationship(
        lazy="selectin", order_by="MenuOptionGroup.sort_order", cascade="all, delete-orphan"
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["category_id", "restaurant_id"],
            ["menu_categories.id", "menu_categories.restaurant_id"],
            name="fk_menu_items_category_same_restaurant",
        ),
        CheckConstraint("price_minor > 0", name="price"),
        CheckConstraint("food_type IN ('veg', 'non_veg', 'egg')", name="food_type"),
    )


class MenuOptionGroup(UUIDPk, Base):
    __tablename__ = "menu_option_groups"

    menu_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("menu_items.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    min_select: Mapped[int] = mapped_column(SmallInteger, default=0)
    max_select: Mapped[int] = mapped_column(SmallInteger, default=1)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    options: Mapped[list[MenuOption]] = relationship(
        lazy="selectin", order_by="MenuOption.sort_order", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("min_select >= 0 AND max_select >= 1 AND max_select >= min_select", name="select_bounds"),
    )


class MenuOption(UUIDPk, Base):
    __tablename__ = "menu_options"

    option_group_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("menu_option_groups.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    price_delta_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (CheckConstraint("price_delta_minor >= 0", name="price_delta"),)
