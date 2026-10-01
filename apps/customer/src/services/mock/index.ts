import { ServiceError } from '@hungerly/app-core';
import type { Page, RestaurantSummary, Session, User } from '@hungerly/types';

import { allFoods, categories, defaultAddress, menus, offers, restaurants } from '../../mock';
import type { RestaurantQuery, Services } from '../contracts';

/**
 * PROTOTYPE ONLY. In-memory implementations of the service contracts, used until the
 * backend exists. Nothing here performs real authentication or networking.
 */
export interface MockOptions {
  /** Simulated network latency so loading states are visible. Use 0 in tests. */
  latencyMs?: number;
}

/** The only code the prototype login accepts. Shown on the OTP screen as a hint. */
export const PROTOTYPE_OTP = '123456';

const DEFAULT_PAGE_SIZE = 20;

function toSummary(restaurant: (typeof restaurants)[number]): RestaurantSummary {
  const {
    description: _d,
    locality: _l,
    deliveryFee: _f,
    minimumOrder: _m,
    ...summary
  } = restaurant;
  return summary;
}

const sorters: Record<
  NonNullable<RestaurantQuery['sort']>,
  (a: RestaurantSummary, b: RestaurantSummary) => number
> = {
  relevance: (a, b) =>
    b.rating.average * Math.log10(b.rating.count) - a.rating.average * Math.log10(a.rating.count),
  rating: (a, b) => b.rating.average - a.rating.average,
  delivery_time: (a, b) => a.deliveryTimeMinutes.max - b.deliveryTimeMinutes.max,
  distance: (a, b) => a.distanceMeters - b.distanceMeters,
};

export function filterRestaurants(query: RestaurantQuery = {}): RestaurantSummary[] {
  const cuisine = query.cuisine?.toLowerCase();
  return restaurants
    .map(toSummary)
    .filter((r) => !cuisine || r.cuisines.some((c) => c.toLowerCase() === cuisine))
    .filter((r) => !query.pureVeg || r.isPureVeg)
    .filter((r) => query.minRating === undefined || r.rating.average >= query.minRating)
    .filter(
      (r) =>
        query.maxDeliveryMinutes === undefined ||
        r.deliveryTimeMinutes.max <= query.maxDeliveryMinutes,
    )
    .filter((r) => !query.hasOffer || r.offer !== undefined)
    .sort((a, b) => {
      // Closed restaurants always go last, like the real listing (API_BLUEPRINT §4.6).
      if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
      return sorters[query.sort ?? 'relevance'](a, b);
    });
}

function paginate<T>(items: T[], cursor: string | undefined, limit = DEFAULT_PAGE_SIZE): Page<T> {
  const start = cursor ? Number(cursor) : 0;
  const end = start + limit;
  return { items: items.slice(start, end), nextCursor: end < items.length ? String(end) : null };
}

export function createMockServices({ latencyMs = 450 }: MockOptions = {}): Services {
  const wait = <T>(value: () => T): Promise<T> =>
    new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          resolve(value());
        } catch (error) {
          reject(error);
        }
      }, latencyMs);
    });

  const knownPhones = new Set<string>();
  const challenges = new Map<string, string>();
  let currentUser: User | null = null;

  const findRestaurant = (id: string) => {
    const restaurant = restaurants.find((r) => r.id === id);
    if (!restaurant) throw new ServiceError('not_found', 'This restaurant is no longer available.');
    return restaurant;
  };

  return {
    auth: {
      restoreSession: () =>
        wait(() => (currentUser ? { user: currentUser, isNewUser: false } : null)),
      requestOtp: (phoneE164) =>
        wait(() => {
          const requestId = `otp-${Date.now()}`;
          challenges.set(requestId, phoneE164);
          return { requestId, expiresInSeconds: 300, resendAfterSeconds: 30 };
        }),
      verifyOtp: (requestId, code) =>
        wait((): Session => {
          const phone = challenges.get(requestId);
          if (!phone)
            throw new ServiceError('auth.otp_expired', 'This code has expired. Request a new one.');
          if (code !== PROTOTYPE_OTP) {
            throw new ServiceError(
              'auth.otp_invalid',
              'That code is not correct. Please try again.',
            );
          }
          challenges.delete(requestId);
          const isNewUser = !knownPhones.has(phone);
          knownPhones.add(phone);
          currentUser =
            currentUser?.phoneE164 === phone
              ? currentUser
              : { id: `u-${phone.slice(-4)}`, phoneE164: phone, fullName: null, email: null };
          return { user: currentUser, isNewUser };
        }),
      updateProfile: ({ fullName, email }) =>
        wait(() => {
          if (!currentUser) throw new ServiceError('validation', 'Please sign in again.');
          currentUser = { ...currentUser, fullName, email: email ?? null };
          return currentUser;
        }),
      signOut: () =>
        wait(() => {
          currentUser = null;
        }),
    },

    catalog: {
      getHomeFeed: () =>
        wait(() => {
          const ranked = filterRestaurants();
          return {
            categories,
            promotions: [offers.welcome, offers.tandoorFlat, offers.dosaTwenty],
            featured: ranked.filter((r) => r.rating.average >= 4.5 && r.isOpen).slice(0, 5),
            popularFoods: allFoods
              .filter((f) => f.isBestseller && f.image && f.isAvailable)
              .slice(0, 8)
              .map((food) => ({ food, restaurantName: findRestaurant(food.restaurantId).name })),
            nearby: filterRestaurants({ sort: 'distance' }).slice(0, 5),
          };
        }),
      search: (query) =>
        wait(() => {
          const term = query.trim().toLowerCase();
          if (!term) return { restaurants: [], foods: [] };
          return {
            restaurants: filterRestaurants().filter(
              (r) =>
                r.name.toLowerCase().includes(term) ||
                r.cuisines.some((c) => c.toLowerCase().includes(term)),
            ),
            foods: allFoods
              .filter((f) => f.name.toLowerCase().includes(term))
              .map((food) => ({ food, restaurantName: findRestaurant(food.restaurantId).name })),
          };
        }),
    },

    restaurants: {
      list: (query = {}) =>
        wait(() => paginate(filterRestaurants(query), query.cursor, query.limit)),
      get: (id) => wait(() => findRestaurant(id)),
      getMenu: (id) =>
        wait(() => {
          const menu = menus.find((m) => m.restaurantId === id);
          if (!menu) throw new ServiceError('not_found', 'This menu is not available right now.');
          return menu;
        }),
    },

    foods: {
      get: (foodId) =>
        wait(() => {
          const food = allFoods.find((f) => f.id === foodId);
          if (!food) throw new ServiceError('not_found', 'This dish is no longer on the menu.');
          return { food, restaurant: findRestaurant(food.restaurantId) };
        }),
    },

    location: {
      getDeliveryAddress: () => wait(() => defaultAddress),
    },

    orders: {
      listOrders: () => wait(() => ({ items: [], nextCursor: null })),
    },
  };
}
