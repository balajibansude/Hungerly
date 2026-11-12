import type { Food, Session } from '@hungerly/types';
import { money } from '@hungerly/utils';

import { useSessionStore } from '../auth/session';
import { checkoutStepFor } from './checkout';
import { useCartStore } from './store';

describe('checkoutStepFor', () => {
  const ok = { isSignedIn: true, belowMinimum: false, hasDeliveryAddress: true };

  it('asks guests to log in before placing an order', () => {
    expect(checkoutStepFor({ ...ok, isSignedIn: false })).toBe('login_required');
  });

  it('asks guests to log in first even without an address (they cannot have one yet)', () => {
    expect(checkoutStepFor({ ...ok, isSignedIn: false, hasDeliveryAddress: false })).toBe(
      'login_required',
    );
  });

  it('lets signed-in customers with a delivery address continue', () => {
    expect(checkoutStepFor(ok)).toBe('ready');
  });

  it('asks signed-in customers without a delivery address to add one', () => {
    expect(checkoutStepFor({ ...ok, hasDeliveryAddress: false })).toBe('address_required');
  });

  it('blocks checkout while the restaurant is closed', () => {
    expect(checkoutStepFor({ ...ok, restaurantClosed: true })).toBe('blocked');
    expect(checkoutStepFor({ ...ok, restaurantClosed: true, hasDeliveryAddress: false })).toBe(
      'blocked',
    );
  });

  it('blocks carts below the minimum order for everyone', () => {
    expect(checkoutStepFor({ ...ok, isSignedIn: false, belowMinimum: true })).toBe('blocked');
    expect(checkoutStepFor({ ...ok, belowMinimum: true })).toBe('blocked');
    expect(checkoutStepFor({ ...ok, belowMinimum: true, hasDeliveryAddress: false })).toBe(
      'blocked',
    );
  });
});

describe('guest cart through sign-in', () => {
  const food: Food = {
    id: 'f-1',
    restaurantId: 'r-1',
    categoryId: 'c-1',
    name: 'Masala dosa',
    description: '',
    price: money(12000),
    foodType: 'veg',
    isAvailable: true,
    isBestseller: false,
    optionGroups: [],
  };
  const restaurant = {
    id: 'r-1',
    name: 'The Dosa Republic',
    deliveryFee: money(2500),
    minimumOrder: money(14900),
    isOpen: true,
  };
  const session: Session = {
    user: { id: 'u-1', phoneE164: '+919876543210', fullName: null, email: null },
    isNewUser: true,
  };

  beforeEach(() => {
    useCartStore.getState().clear();
    useSessionStore.setState({ session: null, pendingSession: null });
  });

  it('keeps the same cart, without duplicating lines, after a first-time sign-in', () => {
    useCartStore.getState().addItem({ food, restaurant, options: [], quantity: 2 });
    const before = useCartStore.getState().items;

    useSessionStore.getState().beginProfileSetup(session);
    useSessionStore.getState().signIn({ ...session, isNewUser: false });

    const after = useCartStore.getState();
    expect(after.items).toEqual(before);
    expect(after.items).toHaveLength(1);
    expect(after.restaurant?.id).toBe('r-1');
  });
});
