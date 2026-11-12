import { useQuery } from '@hungerly/app-core';
import { zeroMoney } from '@hungerly/utils';
import { useMemo } from 'react';

import { useServices } from '@/services';

import { computeBill } from './pricing';
import { useCartStore } from './store';

function nightChargeMinorFor(
  subtotalMinor: number,
  itemCount: number,
  nightCharge: { enabled: boolean; isNightNow: boolean; chargeType: 'fixed' | 'percent'; amountMinor: number; percentBps: number | null } | undefined,
): number {
  if (!nightCharge || !nightCharge.enabled || !nightCharge.isNightNow || itemCount === 0) return 0;
  if (nightCharge.chargeType === 'fixed') return nightCharge.amountMinor;
  const bps = nightCharge.percentBps ?? 0;
  return Math.floor((subtotalMinor * bps) / 10_000);
}

/** Cart contents plus the (estimated) bill, recomputed only when the cart or pricing config changes. */
export function useCartSummary() {
  const { catalog } = useServices();
  const restaurant = useCartStore((s) => s.restaurant);
  const items = useCartStore((s) => s.items);

  const pricingConfig = useQuery('pricing-config', () => catalog.getPricingConfig());

  const bill = useMemo(() => {
    const subtotalItems = items;
    const tempBill = computeBill({
      items: subtotalItems,
      deliveryFee: restaurant?.deliveryFee ?? zeroMoney(),
      minimumOrder: restaurant?.minimumOrder ?? zeroMoney(),
      offer: restaurant?.offer,
    });
    const nightInfo = pricingConfig.status === 'success' ? pricingConfig.data.nightCharge : undefined;
    const nightChargeMinor = nightChargeMinorFor(tempBill.subtotal.amountMinor, tempBill.itemCount, nightInfo);
    return computeBill({
      items: subtotalItems,
      deliveryFee: restaurant?.deliveryFee ?? zeroMoney(),
      minimumOrder: restaurant?.minimumOrder ?? zeroMoney(),
      offer: restaurant?.offer,
      nightChargeMinor,
    });
  }, [items, restaurant, pricingConfig]);

  return { restaurant, items, bill };
}
