import type { Address } from '@hungerly/types';

import { validateAddress } from '@/features/addresses/validation';
import type { SavedAddresses } from '@/services';

export type DeliveryAddressChoice =
  | { kind: 'none' }
  /** Selected, but missing required details (e.g. saved before the current rules). */
  | { kind: 'incomplete'; address: Address }
  | { kind: 'ready'; address: Address };

/** The address checkout will deliver to, and whether it is complete enough to use. */
export function deliveryAddressChoice(
  saved: SavedAddresses | null | undefined,
): DeliveryAddressChoice {
  const address = saved?.addresses.find((a) => a.id === saved.selectedId);
  if (!address) return { kind: 'none' };
  return validateAddress({
    ...address,
    line2: address.line2 ?? '',
    landmark: address.landmark ?? '',
  }).valid
    ? { kind: 'ready', address }
    : { kind: 'incomplete', address };
}
