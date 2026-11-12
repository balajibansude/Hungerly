import { isServiceError } from '@hungerly/app-core';

import { createMockServices, filterRestaurants, PROTOTYPE_OTP } from './index';

const services = createMockServices({ latencyMs: 0 });

describe('mock restaurant filtering', () => {
  it('always lists closed restaurants last', () => {
    const list = filterRestaurants({ sort: 'distance' });
    const firstClosed = list.findIndex((r) => !r.isOpen);
    expect(firstClosed).toBeGreaterThan(-1);
    expect(list.slice(firstClosed).every((r) => !r.isOpen)).toBe(true);
  });

  it('applies combined filters', () => {
    const list = filterRestaurants({ pureVeg: true, minRating: 4.5 });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((r) => r.isPureVeg && r.rating.average >= 4.5)).toBe(true);
  });

  it('filters by cuisine case-insensitively', () => {
    expect(filterRestaurants({ cuisine: 'pizza' }).map((r) => r.id)).toEqual(['r-forno-nonna']);
  });
});

describe('mock services', () => {
  it('paginates restaurant lists with a cursor', async () => {
    const first = await services.restaurants.list({ limit: 4 });
    expect(first.items).toHaveLength(4);
    expect(first.nextCursor).toBe('4');
    const second = await services.restaurants.list({
      limit: 4,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  });

  it('has a menu for every restaurant and resolves every food', async () => {
    const { items } = await services.restaurants.list({ limit: 100 });
    for (const restaurant of items) {
      const menu = await services.restaurants.getMenu(restaurant.id);
      expect(menu.categories.length).toBeGreaterThan(0);
      for (const food of menu.categories.flatMap((c) => c.foods)) {
        const result = await services.foods.get(food.id);
        expect(result.restaurant.id).toBe(restaurant.id);
      }
    }
  });

  it('signs up on first OTP login and rejects wrong codes', async () => {
    const challenge = await services.auth.requestOtp('+919876543210');
    await expect(services.auth.verifyOtp(challenge.requestId, '000000')).rejects.toMatchObject({
      code: 'auth.otp_invalid',
    });
    const session = await services.auth.verifyOtp(challenge.requestId, PROTOTYPE_OTP);
    expect(session.isNewUser).toBe(true);

    const again = await services.auth.requestOtp('+919876543210');
    expect((await services.auth.verifyOtp(again.requestId, PROTOTYPE_OTP)).isNewUser).toBe(false);
  });

  it('throws typed not_found errors', async () => {
    const error = await services.restaurants.get('missing').catch((e: unknown) => e);
    expect(isServiceError(error) && error.code).toBe('not_found');
  });
});

describe('home feed', () => {
  it('no longer includes the removed "Loved in your area" list', async () => {
    const feed = await services.catalog.getHomeFeed();
    expect(feed).not.toHaveProperty('featured');
  });

  it('lists nearby kitchens closest first, open before closed', async () => {
    const { nearby } = await services.catalog.getHomeFeed();
    expect(nearby.length).toBeGreaterThan(0);
    const open = nearby.filter((r) => r.isOpen);
    const distances = open.map((r) => r.distanceMeters);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    const firstClosed = nearby.findIndex((r) => !r.isOpen);
    if (firstClosed > -1) expect(nearby.slice(firstClosed).every((r) => !r.isOpen)).toBe(true);
  });

  it('derives "from" prices from each menu, never inventing one', async () => {
    const { items } = await services.restaurants.list({ limit: 100 });
    for (const restaurant of items) {
      const menu = await services.restaurants.getMenu(restaurant.id);
      const prices = menu.categories
        .flatMap((c) => c.foods)
        .filter((f) => f.isAvailable)
        .map((f) => f.price.amountMinor);
      expect(restaurant.startingPrice?.amountMinor).toBe(
        prices.length > 0 ? Math.min(...prices) : undefined,
      );
    }
  });

  it('has no fabricated logos: every restaurant uses the monogram fallback', async () => {
    const { items } = await services.restaurants.list({ limit: 100 });
    expect(items.every((r) => r.logo === undefined)).toBe(true);
  });
});

describe('cuisines', () => {
  it('lists every cuisine once, each with at least one restaurant', async () => {
    const cuisines = await services.catalog.listCuisines();
    const names = cuisines.map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const cuisine of cuisines) {
      expect(filterRestaurants({ cuisine: cuisine.name }).length).toBeGreaterThan(0);
    }
  });

  it('covers every cuisine a restaurant is tagged with', async () => {
    const cuisines = new Set((await services.catalog.listCuisines()).map((c) => c.name));
    const tags = filterRestaurants().flatMap((r) => r.cuisines);
    expect(tags.filter((tag) => !cuisines.has(tag))).toEqual([]);
  });

  it('shows the Home rail cuisines first in the full list', async () => {
    const [feed, cuisines] = await Promise.all([
      services.catalog.getHomeFeed(),
      services.catalog.listCuisines(),
    ]);
    expect(cuisines.slice(0, feed.categories.length)).toEqual(feed.categories);
  });
});

describe('favourites', () => {
  const signIn = async (svc: ReturnType<typeof createMockServices>, phone: string) => {
    const challenge = await svc.auth.requestOtp(phone);
    return svc.auth.verifyOtp(challenge.requestId, PROTOTYPE_OTP);
  };

  it('requires a signed-in customer', async () => {
    const svc = createMockServices({ latencyMs: 0 });
    await expect(svc.favorites.list()).rejects.toMatchObject({ code: 'validation' });
  });

  it('adds idempotently, removes, and keeps lists per customer', async () => {
    const svc = createMockServices({ latencyMs: 0 });
    await signIn(svc, '+919800000001');
    await svc.favorites.add('r-dosa-republic');
    await svc.favorites.add('r-dosa-republic');
    expect((await svc.favorites.list()).map((r) => r.id)).toEqual(['r-dosa-republic']);

    await svc.auth.signOut();
    await signIn(svc, '+919800000002');
    expect(await svc.favorites.list()).toEqual([]);

    await svc.auth.signOut();
    await signIn(svc, '+919800000001');
    await svc.favorites.remove('r-dosa-republic');
    expect(await svc.favorites.list()).toEqual([]);
  });

  it('marks the phone number verified after a successful OTP check', async () => {
    const svc = createMockServices({ latencyMs: 0 });
    const session = await signIn(svc, '+919800000003');
    expect(session.user.phoneVerifiedAt).toEqual(expect.any(String));
  });
});

describe('offers', () => {
  it('lists every fixture offer with its restaurant, and platform offers without one', async () => {
    const listings = await services.offers.listAvailable();
    expect(listings.length).toBeGreaterThan(0);
    for (const { offer, restaurant } of listings) {
      expect(restaurant?.id).toBe(offer.restaurantId);
      if (restaurant) {
        expect((await services.restaurants.get(restaurant.id)).name).toBe(restaurant.name);
      }
    }
    expect(listings.some((l) => l.restaurant === undefined)).toBe(true);
  });
});

describe('account deletion', () => {
  it('never reports success without a backend, and keeps the account', async () => {
    const svc = createMockServices({ latencyMs: 0 });
    const challenge = await svc.auth.requestOtp('+919800000009');
    await svc.auth.verifyOtp(challenge.requestId, PROTOTYPE_OTP);

    const error = await svc.auth.requestAccountDeletion().catch((e: unknown) => e);
    expect(isServiceError(error)).toBe(true);
    expect(await svc.auth.restoreSession()).not.toBeNull();
  });
});

describe('dish listings', () => {
  it('lists dish deals only where the original price is above the current price', async () => {
    const deals = await services.catalog.listDeals();
    expect(deals.length).toBeGreaterThan(0);
    for (const { food, restaurant } of deals) {
      expect(food.originalPrice!.amountMinor).toBeGreaterThan(food.price.amountMinor);
      expect(restaurant.id).toBe(food.restaurantId);
    }
  });

  it('gives Home dishes their restaurant, including its open state', async () => {
    const feed = await services.catalog.getHomeFeed();
    for (const { food, restaurant } of feed.popularFoods) {
      expect(restaurant.id).toBe(food.restaurantId);
      expect(typeof restaurant.isOpen).toBe('boolean');
    }
    expect(feed.promotions.every((listing) => listing.offer.id)).toBe(true);
  });

  it('marks dishes as Jain only where the restaurant describes them as Jain', async () => {
    const results = await services.catalog.search('jain');
    expect(results.foods.length).toBeGreaterThan(0);
    for (const { food } of results.foods) {
      expect(food.foodType).toBe('jain');
      expect(food.description.toLowerCase()).toMatch(/onion|garlic/);
    }
  });

  it('gives an opening time only to closed restaurants', () => {
    for (const restaurant of filterRestaurants()) {
      if (restaurant.isOpen) expect(restaurant.opensAt).toBeUndefined();
    }
    expect(filterRestaurants().some((r) => !r.isOpen && r.opensAt)).toBe(true);
  });
});

describe('mock addresses', () => {
  const fresh = () => createMockServices({ latencyMs: 0 }).location;
  const input = {
    label: 'other' as const,
    line1: '12, Sunshine Villa',
    locality: 'Baner',
    city: 'Pune',
    postalCode: '411045',
  };

  it('starts with Home (selected) and Work, and delivers to Home', async () => {
    const location = fresh();
    const { addresses, selectedId } = await location.listAddresses();
    expect(addresses.map((a) => a.label)).toEqual(['home', 'work']);
    expect(selectedId).toBe('a-home');
    expect((await location.getDeliveryAddress()).id).toBe('a-home');
  });

  it('adds an address with a placeholder location and cleaned fields', async () => {
    const location = fresh();
    const created = await location.saveAddress({
      ...input,
      line2: '  ',
      landmark: ' Near Balewadi Stadium ',
    });
    expect(created.id).toBeTruthy();
    expect(created.location).toEqual({ lat: 18.5204, lng: 73.8567 });
    expect(created.line2).toBeUndefined();
    expect(created.landmark).toBe('Near Balewadi Stadium');
    expect((await location.listAddresses()).addresses).toHaveLength(3);
  });

  it('edits an address in place, keeping its id and location', async () => {
    const location = fresh();
    const edited = await location.saveAddress({
      ...input,
      id: 'a-work',
      label: 'work',
      landmark: undefined,
    });
    expect(edited.id).toBe('a-work');
    expect(edited.line1).toBe('12, Sunshine Villa');
    expect(edited.landmark).toBeUndefined();
    expect(edited.location).toEqual({ lat: 18.5513, lng: 73.8889 });
    const { addresses } = await location.listAddresses();
    expect(addresses.map((a) => a.id)).toEqual(['a-home', 'a-work']);
  });

  it('refuses invalid fields with the first validation message', async () => {
    const error = await fresh()
      .saveAddress({ ...input, postalCode: '12' })
      .catch((e: unknown) => e);
    expect(isServiceError(error) && error.code).toBe('validation');
    expect(isServiceError(error) && error.message).toBe('Enter a valid 6-digit PIN code.');
  });

  it('changes the delivery address', async () => {
    const location = fresh();
    await location.setDeliveryAddress('a-work');
    expect((await location.getDeliveryAddress()).id).toBe('a-work');
    expect((await location.listAddresses()).selectedId).toBe('a-work');
  });

  it('moves delivery to the first remaining address when the selected one is deleted', async () => {
    const location = fresh();
    await location.setDeliveryAddress('a-work');
    await location.deleteAddress('a-work');
    const { addresses, selectedId } = await location.listAddresses();
    expect(addresses.map((a) => a.id)).toEqual(['a-home']);
    expect(selectedId).toBe('a-home');
  });

  it('never deletes the last address', async () => {
    const location = fresh();
    await location.deleteAddress('a-work');
    const error = await location.deleteAddress('a-home').catch((e: unknown) => e);
    expect(isServiceError(error) && error.code).toBe('validation');
    expect((await location.listAddresses()).addresses).toHaveLength(1);
  });

  it('reports unknown addresses as not found', async () => {
    const location = fresh();
    const error = await location.setDeliveryAddress('a-missing').catch((e: unknown) => e);
    expect(isServiceError(error) && error.code).toBe('not_found');
  });
});
