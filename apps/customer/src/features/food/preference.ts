import type { FoodType } from '@hungerly/types';
import { create } from 'zustand';

/**
 * The customer's food preference, shared by Home, Search, Offers and menus so every dish
 * list agrees.
 * - mixed: everything (veg, non-veg, egg and Jain dishes);
 * - veg: vegetarian dishes; Jain dishes are vegetarian, so they are included;
 * - jain: only dishes the restaurant explicitly marks as Jain. Plain veg never counts.
 */
export type FoodPreference = 'mixed' | 'veg' | 'jain';

export const foodPreferenceOptions: {
  value: FoodPreference;
  label: string;
  description: string;
}[] = [
  { value: 'veg', label: 'Veg', description: 'Only vegetarian dishes' },
  { value: 'mixed', label: 'Mixed', description: 'Veg and non-veg dishes' },
  {
    value: 'jain',
    label: 'Jain',
    description: 'Only dishes the restaurant marks as Jain',
  },
];

const allowed: Record<FoodPreference, readonly FoodType[]> = {
  mixed: ['veg', 'non_veg', 'egg', 'jain'],
  veg: ['veg', 'jain'],
  jain: ['jain'],
};

export function matchesPreference(foodType: FoodType, preference: FoodPreference): boolean {
  return allowed[preference].includes(foodType);
}

export function filterByPreference<T>(
  items: readonly T[],
  preference: FoodPreference,
  foodTypeOf: (item: T) => FoodType,
): T[] {
  return items.filter((item) => matchesPreference(foodTypeOf(item), preference));
}

export function preferenceLabel(preference: FoodPreference): string {
  return foodPreferenceOptions.find((o) => o.value === preference)?.label ?? 'Mixed';
}

interface FoodPreferenceState {
  preference: FoodPreference;
  setPreference: (preference: FoodPreference) => void;
}

/** In memory for the prototype, like the session; persists with real accounts later. */
export const useFoodPreferenceStore = create<FoodPreferenceState>()((set) => ({
  preference: 'mixed',
  setPreference: (preference) => set({ preference }),
}));
