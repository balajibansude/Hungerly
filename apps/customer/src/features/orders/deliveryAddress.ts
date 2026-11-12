import type { OrderSummary } from '@hungerly/types';
import type { IconName } from '@hungerly/ui';

import { addressLabels, addressLines, formatAddress } from '@/features/addresses/format';

export interface OrderDeliveryDisplay {
  title: string;
  icon: IconName;
  lines: string[];
  /** One-line form for screen readers. */
  accessibilityLabel: string;
}

/**
 * What the order screens show under "Delivering to", from the address snapshot stored on the
 * order. Null for orders without one (placed before addresses were attached), which then
 * simply show no address.
 */
export function orderDeliveryDisplay(
  order: Pick<OrderSummary, 'deliveryAddress'>,
): OrderDeliveryDisplay | null {
  const address = order.deliveryAddress;
  if (!address) return null;
  const label = addressLabels[address.label];
  return {
    title: label.title,
    icon: label.icon,
    lines: addressLines(address),
    accessibilityLabel: `Delivering to ${label.title}: ${formatAddress(address)}`,
  };
}
