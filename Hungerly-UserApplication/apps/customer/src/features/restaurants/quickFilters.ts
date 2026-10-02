import type { IconName } from '@hungerly/ui';

import type { RestaurantQuery } from '@/services';

export type QuickFilterKey = 'pureVeg' | 'topRated' | 'fast' | 'offers';

/** Filters offered as one-tap chips. Values are the query they add. */
export const quickFilters: {
  key: QuickFilterKey;
  label: string;
  icon: IconName;
  query: RestaurantQuery;
}[] = [
  { key: 'pureVeg', label: 'Pure veg', icon: 'leaf-outline', query: { pureVeg: true } },
  { key: 'topRated', label: 'Rated 4.5+', icon: 'star-outline', query: { minRating: 4.5 } },
  { key: 'fast', label: 'Under 30 min', icon: 'flash-outline', query: { maxDeliveryMinutes: 30 } },
  { key: 'offers', label: 'Offers', icon: 'pricetag-outline', query: { hasOffer: true } },
];

export function queryFromFilters(active: QuickFilterKey[]): RestaurantQuery {
  return quickFilters
    .filter((filter) => active.includes(filter.key))
    .reduce<RestaurantQuery>((query, filter) => ({ ...query, ...filter.query }), {});
}

export function isQuickFilterKey(value: string): value is QuickFilterKey {
  return quickFilters.some((filter) => filter.key === value);
}
