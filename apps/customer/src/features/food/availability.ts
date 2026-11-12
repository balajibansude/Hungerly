import type { Food, LocalTime, RestaurantSummary } from '@hungerly/types';
import { formatLocalTime12h } from '@hungerly/utils';

/** The restaurant availability fields every dish listing needs. */
export type Availability = Pick<RestaurantSummary, 'isOpen' | 'opensAt'>;

/** Why a dish cannot be added right now, or `null` when it can. */
export type DishBlocker = 'restaurant_closed' | 'dish_unavailable' | null;

export function dishBlocker(
  food: Pick<Food, 'isAvailable'>,
  restaurant: Availability,
): DishBlocker {
  if (!restaurant.isOpen) return 'restaurant_closed';
  if (!food.isAvailable) return 'dish_unavailable';
  return null;
}

/** "Opens at 11:00 AM", or `null` when the time is missing or malformed. */
export function opensAtLabel(opensAt: LocalTime | undefined): string | null {
  if (!opensAt) return null;
  try {
    return `Opens at ${formatLocalTime12h(opensAt).toUpperCase()}`;
  } catch {
    return null;
  }
}

/** Short explanation shown when the customer tries to add a blocked dish. */
export function blockedMessage(blocker: Exclude<DishBlocker, null>, restaurant: Availability) {
  if (blocker === 'dish_unavailable') return 'This dish is unavailable right now.';
  const opens = opensAtLabel(restaurant.opensAt);
  return `This restaurant is currently closed.${opens ? ` ${opens}.` : ''}`;
}

/** Open restaurants' items first; the original order is kept within each group. */
export function sortOpenFirst<T>(items: readonly T[], isOpen: (item: T) => boolean): T[] {
  return items
    .map((item, index) => ({ item, index, open: isOpen(item) }))
    .sort((a, b) => Number(b.open) - Number(a.open) || a.index - b.index)
    .map(({ item }) => item);
}
