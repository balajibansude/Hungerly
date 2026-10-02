from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    LargeBinary,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import CITEXT, INET
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, EncryptedString, Timestamps, UUIDPk

USER_STATUSES = ("active", "suspended", "deleted")
ROLES = ("customer", "restaurant_staff", "delivery_partner", "admin")
CLIENT_APPS = ("customer", "restaurant", "delivery", "admin")
ADMIN_ROLES = ("super_admin", "operations", "support", "finance")


def _in(col: str, values: tuple[str, ...]) -> str:
    return f"{col} IN ({', '.join(repr(v) for v in values)})"


class User(UUIDPk, Timestamps, Base):
    __tablename__ = "users"

    # Phone numbers are encrypted at rest; `phone_bidx` (keyed HMAC) allows exact-match lookup.
    phone_e164: Mapped[str | None] = mapped_column(EncryptedString("users.phone_e164"))
    phone_bidx: Mapped[bytes | None] = mapped_column(LargeBinary(32))
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    email: Mapped[str | None] = mapped_column(CITEXT)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    password_hash: Mapped[str | None] = mapped_column(Text)
    full_name: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(16), default="active", server_default="active")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    roles: Mapped[list[UserRole]] = relationship(
        back_populates="user", lazy="selectin", cascade="all, delete-orphan", foreign_keys="UserRole.user_id"
    )
    admin_profile: Mapped[AdminProfile | None] = relationship(back_populates="user", lazy="selectin")

    __table_args__ = (
        CheckConstraint(_in("status", USER_STATUSES), name="status"),
        CheckConstraint("phone_bidx IS NOT NULL OR email IS NOT NULL", name="has_identifier"),
        Index("uq_users_phone_bidx", "phone_bidx", unique=True, postgresql_where=text("deleted_at IS NULL")),
        Index("uq_users_email", "email", unique=True, postgresql_where=text("deleted_at IS NULL")),
    )

    @property
    def role_names(self) -> list[str]:
        return [r.role for r in self.roles]


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[str] = mapped_column(String(32), primary_key=True)
    granted_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    user: Mapped[User] = relationship(back_populates="roles", foreign_keys=[user_id])

    __table_args__ = (CheckConstraint(_in("role", ROLES), name="role"),)


class AuthSession(UUIDPk, Base):
    __tablename__ = "auth_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    client_app: Mapped[str] = mapped_column(String(16))
    refresh_token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    previous_token_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    device_id: Mapped[str | None] = mapped_column(String(128))
    device_name: Mapped[str | None] = mapped_column(String(128))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    ip_address: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    idle_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoke_reason: Mapped[str | None] = mapped_column(String(32))

    __table_args__ = (CheckConstraint(_in("client_app", CLIENT_APPS), name="client_app"),)


class AdminProfile(Base):
    __tablename__ = "admin_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True)
    admin_role: Mapped[str] = mapped_column(String(16))
    totp_secret: Mapped[str | None] = mapped_column(EncryptedString("admin_profiles.totp_secret"))
    totp_enabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Hashes of single-use recovery codes (refresh_token_digest of each code).
    recovery_code_hashes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    user: Mapped[User] = relationship(back_populates="admin_profile")

    __table_args__ = (CheckConstraint(_in("admin_role", ADMIN_ROLES), name="admin_role"),)


class CustomerProfile(Base):
    __tablename__ = "customer_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    default_address_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("addresses.id", ondelete="SET NULL", use_alter=True)
    )
    marketing_opt_in: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
