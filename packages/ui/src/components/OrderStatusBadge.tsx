import type { OrderStatus } from '@hungerly/types';
import type { StyleProp, ViewStyle } from 'react-native';

import { Badge, type BadgeTone } from './Badge';
import type { IconName } from './Icon';

/** Who is reading the status. Only wording differs; colours and icons are shared. */
export type OrderStatusAudience = 'customer' | 'partner';

export interface OrderStatusMeta {
  /** Customer-facing wording. */
  label: string;
  /** Restaurant-partner wording, where it differs (e.g. a placed order is "New" in the kitchen). */
  partnerLabel: string;
  tone: BadgeTone;
  icon: IconName;
}

/**
 * The one order-status vocabulary and colour mapping used by every app
 * (FRONTEND_BLUEPRINT §2.3). Statuses are the database's (`orders.status`).
 */
export const orderStatusMeta: Record<OrderStatus, OrderStatusMeta> = {
  pending_payment: {
    label: 'Awaiting payment',
    partnerLabel: 'Awaiting payment',
    tone: 'neutral',
    icon: 'card-outline',
  },
  placed: { label: 'Placed', partnerLabel: 'New', tone: 'info', icon: 'notifications-outline' },
  preparing: {
    label: 'Preparing',
    partnerLabel: 'Preparing',
    tone: 'warning',
    icon: 'flame-outline',
  },
  ready_for_pickup: {
    label: 'Ready for pickup',
    partnerLabel: 'Ready for pickup',
    tone: 'success',
    icon: 'bag-check-outline',
  },
  picked_up: {
    label: 'On the way',
    partnerLabel: 'Picked up',
    tone: 'dark',
    icon: 'bicycle-outline',
  },
  delivered: {
    label: 'Delivered',
    partnerLabel: 'Delivered',
    tone: 'neutral',
    icon: 'checkmark-done-outline',
  },
  cancelled: {
    label: 'Cancelled',
    partnerLabel: 'Cancelled',
    tone: 'error',
    icon: 'close-circle-outline',
  },
};

export function orderStatusLabel(status: OrderStatus, audience: OrderStatusAudience = 'customer') {
  const meta = orderStatusMeta[status];
  return audience === 'partner' ? meta.partnerLabel : meta.label;
}

export interface OrderStatusBadgeProps {
  status: OrderStatus;
  audience?: OrderStatusAudience;
  style?: StyleProp<ViewStyle>;
}

/** Status pill with the shared wording, colour and icon for an order status. */
export function OrderStatusBadge({ status, audience = 'customer', style }: OrderStatusBadgeProps) {
  const { tone, icon } = orderStatusMeta[status];
  return <Badge label={orderStatusLabel(status, audience)} tone={tone} icon={icon} style={style} />;
}
