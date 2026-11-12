import type { ChipTint, IconName } from '@hungerly/ui';

import type { RestaurantQuery } from '@/services';

export type QuickFilterKey = 'pureVeg' | 'nonVeg' | 'jain' | 'topRated' | 'fast';

/** Filters offered as one-tap chips. Values are the query they add. */
export const quickFilters: {
  key: QuickFilterKey;
  label: string;
  icon: IconName;
  query: RestaurantQuery;
  tint: ChipTint;
}[] = [
  { key: 'pureVeg', label: 'Pure veg', icon: 'leaf-outline', query: { pureVeg: true }, tint: 'primary' },
  { key: 'nonVeg', label: 'Non-veg', icon: 'restaurant-outline', query: { nonVeg: true }, tint: 'danger' },
  { key: 'jain', label: 'Jain', icon: 'leaf-outline', query: { jain: true }, tint: 'jain' },
  { key: 'topRated', label: 'Rated 4.5+', icon: 'star-outline', query: { minRating: 4.5 }, tint: 'primary' },
  { key: 'fast', label: 'Under 30 min', icon: 'flash-outline', query: { maxDeliveryMinutes: 30 }, tint: 'primary' },
];

export function queryFromFilters(active: QuickFilterKey[]): RestaurantQuery {
  return quickFilters
    .filter((filter) => active.includes(filter.key))
    .reduce<RestaurantQuery>((query, filter) => ({ ...query, ...filter.query }), {});
}

export function isQuickFilterKey(value: string): value is QuickFilterKey {
  return quickFilters.some((filter) => filter.key === value);
}
