import { ServiceError, useQuery } from '@hungerly/app-core';

import { activeMembership, useSessionStore } from '@/features/auth/session';
import { useServices } from '@/services';

/** Loads the profile of the restaurant the app is working on (loading / error / data). */
export function useActiveRestaurant() {
  const { restaurants } = useServices();
  const restaurantId = useSessionStore((s) => activeMembership(s.session)?.restaurantId ?? null);

  return useQuery(`restaurant:${restaurantId ?? 'none'}`, () => {
    if (!restaurantId) {
      return Promise.reject(new ServiceError('not_found', 'No restaurant is linked to you yet.'));
    }
    return restaurants.get(restaurantId);
  });
}
