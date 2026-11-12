import type { Address, AddressLabel } from '@hungerly/types';
import type { IconName } from '@hungerly/ui';

export const addressLabels: Record<AddressLabel, { title: string; icon: IconName }> = {
  home: { title: 'Home', icon: 'home-outline' },
  work: { title: 'Work', icon: 'briefcase-outline' },
  other: { title: 'Other', icon: 'location-outline' },
};

export const ADDRESS_LABELS: AddressLabel[] = ['home', 'work', 'other'];

type AddressText = Pick<
  Address,
  'line1' | 'line2' | 'landmark' | 'locality' | 'city' | 'postalCode'
>;

/** Display lines, skipping empty parts: line 1 · line 2 · landmark · "Locality, City PIN". */
export function addressLines(address: AddressText): string[] {
  return [
    address.line1,
    address.line2,
    address.landmark,
    `${address.locality}, ${address.city} ${address.postalCode}`,
  ]
    .map((line) => line?.trim())
    .filter((line): line is string => Boolean(line));
}

/** One-line form for compact places (e.g. a checkout card or a screen-reader label). */
export function formatAddress(address: AddressText): string {
  return addressLines(address).join(', ');
}
