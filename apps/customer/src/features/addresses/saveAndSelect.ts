import type { Address, Id } from '@hungerly/types';

import type { AddressInput, LocationService } from '@/services';

/**
 * Saves the address form. When the form was opened from checkout (`selectAfterSave`), a
 * newly added address also becomes the delivery address, so the customer doesn't have to
 * pick it again. Edits never change the selection.
 *
 * Selecting is best effort: the address is already saved, so a failure there must not look
 * like the save failed (retrying would add a duplicate). `selected` reports what happened.
 */
export async function saveAddressAndMaybeSelect(deps: {
  location: Pick<LocationService, 'saveAddress' | 'setDeliveryAddress'>;
  input: AddressInput & { id?: Id };
  selectAfterSave: boolean;
}): Promise<{ address: Address; selected: boolean }> {
  const address = await deps.location.saveAddress(deps.input);
  if (!deps.selectAfterSave || deps.input.id) return { address, selected: false };
  try {
    await deps.location.setDeliveryAddress(address.id);
    return { address, selected: true };
  } catch {
    return { address, selected: false };
  }
}
