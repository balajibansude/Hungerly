import type { Address, Money, PaymentMethod } from '@hungerly/types';
import { formatMoney } from '@hungerly/utils';

import { addressLabels } from '@/features/addresses/format';

export const paymentMethodTitles: Record<PaymentMethod, string> = {
  cod: 'Cash on delivery',
  online: 'Pay online',
};

export interface CheckoutSummaryText {
  /** "Home · Koregaon Park", or null when no address is chosen yet. */
  address: string | null;
  payment: string;
  payable: string;
  placeOrderLabel: string;
  /** Spoken form of the Place order button, naming the amount, payment method and address. */
  placeOrderAccessibilityLabel: string;
}

/** Text for the compact summary above Place order, and for the button itself. */
export function checkoutSummaryText({
  address,
  paymentMethod,
  total,
}: {
  address: Pick<Address, 'label' | 'locality'> | null;
  paymentMethod: PaymentMethod;
  total: Money;
}): CheckoutSummaryText {
  const payable = formatMoney(total);
  const payment = paymentMethodTitles[paymentMethod];
  const where = address ? `${addressLabels[address.label].title} · ${address.locality}` : null;
  const paying =
    paymentMethod === 'cod' ? `pay ${payable} cash on delivery` : `pay ${payable} online`;
  return {
    address: where,
    payment,
    payable,
    placeOrderLabel: `Place order · ${payable}`,
    placeOrderAccessibilityLabel: `Place order, ${paying}${
      address ? `, to ${addressLabels[address.label].title}, ${address.locality}` : ''
    }`,
  };
}
