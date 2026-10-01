import type { RestaurantFoodType } from '@hungerly/types';

import type { RegistrantRole } from '@/services';

/**
 * Prototype choice lists. Cuisines are admin-curated in production (`cuisines` table);
 * this practical list stands in until that endpoint exists.
 */
export const CUISINE_OPTIONS = [
  'North Indian',
  'South Indian',
  'Chinese',
  'Fast Food',
  'Biryani',
  'Maharashtrian',
  'Street Food',
  'Desserts',
  'Beverages',
  'Other',
] as const;

export const FOOD_TYPE_OPTIONS: { value: RestaurantFoodType; label: string; hint: string }[] = [
  { value: 'veg_only', label: 'Veg only', hint: 'Every dish is vegetarian' },
  { value: 'mixed', label: 'Mixed', hint: 'Veg and non-veg dishes' },
];

export const ROLE_OPTIONS: { value: RegistrantRole; label: string; hint: string }[] = [
  { value: 'owner', label: 'Owner', hint: 'You own the restaurant' },
  { value: 'manager', label: 'Manager', hint: 'You run it for the owner' },
];

/** Average preparation time choices, in minutes (schema range 5–120). */
export const PREP_MINUTES_OPTIONS = [10, 15, 20, 25, 30, 40, 45, 60] as const;

export function foodTypeLabel(value: RestaurantFoodType | null): string {
  return FOOD_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? 'Not chosen';
}

export function roleOptionLabel(value: RegistrantRole | null): string {
  return ROLE_OPTIONS.find((option) => option.value === value)?.label ?? 'Not chosen';
}
