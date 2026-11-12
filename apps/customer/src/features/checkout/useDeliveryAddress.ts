import { useQuery } from '@hungerly/app-core';

import { useRefetchOnFocus } from '@/features/addresses/useRefetchOnFocus';
import { useSessionStore } from '@/features/auth/session';
import { useServices } from '@/services';

import { deliveryAddressChoice } from './deliveryAddress';

/**
 * The checkout delivery address for the signed-in customer. Guests have none (addresses
 * are an account feature). Reloads when the screen regains focus, so a choice made on the
 * addresses screen shows up immediately.
 */
export function useDeliveryAddress() {
  const { location } = useServices();
  const userId = useSessionStore((s) => s.session?.user.id);
  const saved = useQuery(`checkout-address:${userId ?? 'guest'}`, () =>
    userId ? location.listAddresses() : Promise.resolve(null),
  );
  useRefetchOnFocus(saved.refetch);

  return {
    status: saved.status,
    refetch: saved.refetch,
    choice: deliveryAddressChoice(saved.status === 'success' ? saved.data : null),
  };
}
