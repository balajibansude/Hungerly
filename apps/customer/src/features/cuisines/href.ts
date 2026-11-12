import type { Category } from '@hungerly/types';

/**
 * The restaurant listing filtered to one cuisine. Shared by the Home rail and the All
 * Cuisines screen so a cuisine filters the same way wherever it is picked.
 */
export function cuisineHref(category: Pick<Category, 'name'>) {
  return { pathname: '/restaurants', params: { cuisine: category.name } } as const;
}
