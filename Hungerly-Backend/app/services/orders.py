"""Order lifecycle. Clients request transitions; only this module changes `orders.status`.

Every transition locks the order row, validates against the state machine, bumps `version`
and writes an `order_status_events` row in the same transaction.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.models import DeliveryAssignment, Order, OrderStatusEvent
from app.models.delivery import ACTIVE_ASSIGNMENT_STATUSES

TRANSITIONS: dict[str, set[str]] = {
    "pending_payment": {"placed", "cancelled"},
    "placed": {"preparing", "cancelled"},
    "preparing": {"ready_for_pickup", "picked_up", "cancelled"},
    "ready_for_pickup": {"picked_up", "cancelled"},
    "picked_up": {"delivered", "cancelled"},
    "delivered": set(),
    "cancelled": set(),
}

_MILESTONES = {
    "placed": "placed_at",
    "preparing": "accepted_at",
    "ready_for_pickup": "ready_at",
    "picked_up": "picked_up_at",
    "delivered": "delivered_at",
    "cancelled": "cancelled_at",
}

LIVE_STATUSES = ("placed", "preparing", "ready_for_pickup", "picked_up")


def now() -> datetime:
    return datetime.now(UTC)


async def lock_order(db: AsyncSession, order_id: uuid.UUID, *, customer_id: uuid.UUID | None = None) -> Order:
    stmt = select(Order).where(Order.id == order_id).with_for_update()
    if customer_id is not None:
        # Scoped query: another customer's order is indistinguishable from a missing one.
        stmt = stmt.where(Order.customer_user_id == customer_id)
    order = (await db.execute(stmt)).scalar_one_or_none()
    if order is None:
        raise ProblemError(404, "order.not_found")
    return order


def check_version(order: Order, if_match: str | None) -> None:
    if if_match is not None and if_match.strip('"') != str(order.version):
        raise ProblemError(409, "order.version_conflict", extra={"current_version": order.version})


def transition(
    db: AsyncSession,
    order: Order,
    to_status: str,
    *,
    actor_type: str,
    actor_user_id: uuid.UUID | None,
    reason: str | None = None,
) -> None:
    if to_status not in TRANSITIONS.get(order.status, set()):
        raise ProblemError(
            409, "order.invalid_transition",
            f"Order is {order.status.replace('_', ' ')} and cannot move to {to_status.replace('_', ' ')}.",
            extra={"current_status": order.status},
        )
    from_status = order.status
    ts = now()
    order.status = to_status
    setattr(order, _MILESTONES[to_status], ts)
    order.version += 1
    if to_status == "cancelled":
        order.cancelled_by = actor_type if actor_type != "delivery_partner" else "system"
        order.cancellation_reason = reason
        if order.payment_status == "paid":
            order.payment_status = "refund_pending"
        elif order.payment_status == "pending":
            order.payment_status = "not_applicable" if order.payment_method == "cod" else "failed"
    if to_status == "delivered" and order.payment_method == "cod":
        order.payment_status = "paid"
    db.add(
        OrderStatusEvent(
            order_id=order.id, from_status=from_status, to_status=to_status,
            actor_type=actor_type, actor_user_id=actor_user_id, reason=reason,
        )
    )


def accept(db: AsyncSession, order: Order, prep_minutes: int, *, actor_type: str, actor_user_id: uuid.UUID | None) -> None:
    transition(db, order, "preparing", actor_type=actor_type, actor_user_id=actor_user_id)
    order.estimated_ready_at = now() + timedelta(minutes=prep_minutes)
    order.estimated_delivery_at = order.estimated_ready_at + timedelta(minutes=max(10, order.delivery_distance_m // 300))


async def cancel_active_assignment(db: AsyncSession, order_id: uuid.UUID, reason: str) -> DeliveryAssignment | None:
    rows = (
        await db.execute(
            select(DeliveryAssignment)
            .where(
                DeliveryAssignment.order_id == order_id,
                DeliveryAssignment.status.in_((*ACTIVE_ASSIGNMENT_STATUSES, "offered")),
            )
            .with_for_update()
        )
    ).scalars().all()
    active = None
    for a in rows:
        if a.status in ACTIVE_ASSIGNMENT_STATUSES:
            active = a
        a.status = "cancelled"
        a.cancelled_at = now()
        a.cancel_reason = reason
        a.version += 1
    return active
