import { isServiceError } from '../errors';
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
