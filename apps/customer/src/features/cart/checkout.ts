/**
 * What happens when the customer taps Place order. Guests build carts freely; an account is
 * only needed to place the order, so this is the single point where sign-in is required.
 * Signed-in customers then need a complete delivery address.
 */
export type CheckoutStep = 'blocked' | 'login_required' | 'address_required' | 'ready';

export function checkoutStepFor({
  isSignedIn,
  belowMinimum,
  restaurantClosed = false,
  hasDeliveryAddress,
}: {
  isSignedIn: boolean;
  /** The cart has not reached the restaurant's minimum order. */
  belowMinimum: boolean;
  /** The cart's restaurant is closed: no order can be placed until it reopens. */
  restaurantClosed?: boolean;
  /** A complete delivery address is selected (only checked for signed-in customers). */
  hasDeliveryAddress: boolean;
}): CheckoutStep {
  if (belowMinimum || restaurantClosed) return 'blocked';
  if (!isSignedIn) return 'login_required';
  return hasDeliveryAddress ? 'ready' : 'address_required';
}
