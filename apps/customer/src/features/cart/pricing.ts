import type { CartItem, DiscountRule, Money, Offer, SelectedOption } from '@hungerly/types';
import {
  addMoney,
  money,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  zeroMoney,
} from '@hungerly/utils';

/**
 * Client-side ESTIMATE of the bill. The server is the source of truth for prices, fees,
 * taxes and discounts (docs/BLUEPRINT.md §12 FR-CART-2); this exists so the prototype cart
 * feels real and so the UI is ready for a server-provided bill with the same shape.
 */

export function unitPrice(basePrice: Money, options: SelectedOption[]): Money {
  return options.reduce((total, option) => addMoney(total, option.priceDelta), basePrice);
}

export function lineTotal(item: CartItem): Money {
  return multiplyMoney(unitPrice(item.basePrice, item.selectedOptions), item.quantity);
}

export function discountFor(rule: DiscountRule | undefined, subtotal: Money): Money {
  if (!rule || subtotal.amountMinor < rule.minimumOrder.amountMinor) return zeroMoney();
  if (rule.kind === 'flat') {
    return money(Math.min(rule.amount.amountMinor, subtotal.amountMinor));
  }
  // Percent discounts round down to whole paise and are capped.
  const raw = Math.floor((subtotal.amountMinor * rule.percentBps) / 10_000);
  return money(Math.min(raw, rule.maxDiscount.amountMinor));
}

export interface BillInput {
  items: CartItem[];
  deliveryFee: Money;
  minimumOrder: Money;
  offer?: Offer;
  /**
   * Night-time surcharge in paise (0 when not applicable or feature disabled).
   * Set by the caller from the server's pricing-config response so the estimate
   * matches what the server will charge at order creation.
   */
  nightChargeMinor?: number;
}

export interface Bill {
  itemCount: number;
  subtotal: Money;
  deliveryFee: Money;
  discount: Money;
  /** Night-time surcharge. Zero when the feature is off or it is not currently night. */
  nightCharge: Money;
  total: Money;
  /** How much more is needed to reach the restaurant's minimum order, if anything. */
  shortOfMinimum: Money | null;
  /** How much more unlocks the offer, if an offer exists and is not yet applied. */
  shortOfOffer: Money | null;
}

export function computeBill({ items, deliveryFee, minimumOrder, offer, nightChargeMinor = 0 }: BillInput): Bill {
  const subtotal = sumMoney(items.map(lineTotal));
  const discount = discountFor(offer?.rule, subtotal);
  const itemCount = items.reduce((count, item) => count + item.quantity, 0);
  const fee = itemCount === 0 ? zeroMoney() : deliveryFee;
  const nightCharge = itemCount === 0 ? zeroMoney() : money(nightChargeMinor);
  const total = subtractMoney(addMoney(addMoney(subtotal, fee), nightCharge), discount);
  const minimumGap = minimumOrder.amountMinor - subtotal.amountMinor;
  const offerGap = offer ? offer.rule.minimumOrder.amountMinor - subtotal.amountMinor : 0;

  return {
    itemCount,
    subtotal,
    deliveryFee: fee,
    discount,
    nightCharge,
    total,
    shortOfMinimum: itemCount > 0 && minimumGap > 0 ? money(minimumGap) : null,
    shortOfOffer: offer && itemCount > 0 && offerGap > 0 ? money(offerGap) : null,
  };
}
