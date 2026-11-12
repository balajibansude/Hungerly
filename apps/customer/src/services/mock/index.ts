import { ServiceError } from '@hungerly/app-core';
import type {
  Address,
  Id,
  Money,
  Offer,
  OrderSummary,
  Page,
  RestaurantSummary,
  Session,
  User,
} from '@hungerly/types';

import {
  allFoods,
  categories,
  homeCategories,
  menus,
  offers,
  placeholderLocation,
  restaurants,
  sampleAddresses,
} from '../../mock';
import { validateAddress } from '../../features/addresses/validation';
import { lineTotal } from '../../features/cart/pricing';
import type {
  FoodWithRestaurant,
  InstructionSet,
  OfferListing,
  OrderInstructions,
  RestaurantQuery,
  Services,
} from '../contracts';

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

/** Lowest price among the restaurant's available dishes, from its real (mock) menu. */
function startingPriceOf(restaurantId: string): Money | undefined {
  const prices = allFoods
    .filter((food) => food.restaurantId === restaurantId && food.isAvailable)
    .map((food) => food.price);
  return prices.reduce<Money | undefined>(
    (lowest, price) => (!lowest || price.amountMinor < lowest.amountMinor ? price : lowest),
    undefined,
  );
}

function toSummary(restaurant: (typeof restaurants)[number]): RestaurantSummary {
  const {
    description: _d,
    locality: _l,
    deliveryFee: _f,
    minimumOrder: _m,
    ...summary
  } = restaurant;
  const startingPrice = startingPriceOf(restaurant.id);
  return startingPrice ? { ...summary, startingPrice } : summary;
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

/** Restaurant ids that have at least one jain-marked item (derived from allFoods mock data). */
const JAIN_RESTAURANT_IDS: Set<string> = new Set(
  allFoods.filter((f) => f.foodType === 'jain').map((f) => f.restaurantId),
);

function toSummaryWithJain(restaurant: (typeof restaurants)[number]): RestaurantSummary {
  const summary = toSummary(restaurant);
  return { ...summary, hasJainItems: JAIN_RESTAURANT_IDS.has(restaurant.id) };
}

export function filterRestaurants(query: RestaurantQuery = {}): RestaurantSummary[] {
  const cuisine = query.cuisine?.toLowerCase();
  return restaurants
    .map(toSummaryWithJain)
    .filter((r) => !cuisine || r.cuisines.some((c) => c.toLowerCase() === cuisine))
    .filter((r) => !query.pureVeg || r.isPureVeg)
    .filter((r) => !query.nonVeg || !r.isPureVeg)
    .filter((r) => !query.jain || r.hasJainItems === true)
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

/** IST offset in minutes (UTC+5:30, no daylight saving). */
const IST_OFFSET_MINUTES = 330;

function currentIstMinutes(): number {
  const now = new Date();
  const ist = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function parseHHMM(value: string): number {
  const [h = 0, m = 0] = value.split(':').map(Number);
  return h * 60 + m;
}

function isInsideNightWindow(minutes: number, startMinutes: number, endMinutes: number): boolean {
  // Window crosses midnight when start > end (e.g. 22:00–06:00).
  if (startMinutes > endMinutes) {
    return minutes >= startMinutes || minutes < endMinutes;
  }
  return minutes >= startMinutes && minutes < endMinutes;
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

  // Saved addresses for this app session: Home (selected) and Work to start with.
  let addresses: Address[] = sampleAddresses.map((a) => ({ ...a }));
  let selectedAddressId = addresses[0]!.id;
  let addressCounter = 0;
  const findAddress = (id: Id) => {
    const address = addresses.find((a) => a.id === id);
    if (!address) throw new ServiceError('not_found', 'This address no longer exists.');
    return address;
  };
  const challenges = new Map<string, string>();
  let currentUser: User | null = null;
  const placedOrders: OrderSummary[] = [];
  /** Instructions saved per order (replaced on each save), as the backend would store them. */
  const instructionsByOrder = new Map<Id, OrderInstructions>();
  const NOTE_MAX_LENGTH = 200;
  const validInstructionSet = (set: InstructionSet) =>
    set.note.length <= NOTE_MAX_LENGTH &&
    (set.voiceNote === null || set.voiceNote.durationSeconds > 0);
  const favoritesByUser = new Map<Id, Set<Id>>();

  const favoritesOfCurrentUser = () => {
    if (!currentUser) throw new ServiceError('validation', 'Please log in to manage favourites.');
    let ids = favoritesByUser.get(currentUser.id);
    if (!ids) {
      ids = new Set();
      favoritesByUser.set(currentUser.id, ids);
    }
    return ids;
  };

  const findRestaurant = (id: string) => {
    const restaurant = restaurants.find((r) => r.id === id);
    if (!restaurant) throw new ServiceError('not_found', 'This restaurant is no longer available.');
    return restaurant;
  };

  const withRestaurant = (food: (typeof allFoods)[number]): FoodWithRestaurant => ({
    food,
    restaurant: findRestaurant(food.restaurantId),
  });

  const listingFor = (offer: Offer): OfferListing => {
    const restaurant = offer.restaurantId ? findRestaurant(offer.restaurantId) : undefined;
    return restaurant
      ? { offer, restaurant: { id: restaurant.id, name: restaurant.name, image: restaurant.image } }
      : { offer };
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
          // A successful OTP check is what verifies the number (users.phone_verified_at).
          const phoneVerifiedAt = new Date().toISOString();
          currentUser =
            currentUser?.phoneE164 === phone
              ? { ...currentUser, phoneVerifiedAt }
              : {
                  id: `u-${phone.slice(-4)}`,
                  phoneE164: phone,
                  phoneVerifiedAt,
                  fullName: null,
                  email: null,
                };
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
      // There is no backend to erase data, so the prototype refuses instead of pretending.
      requestAccountDeletion: () =>
        wait(() => {
          throw new ServiceError(
            'unknown',
            'Account deletion isn’t connected in this prototype yet, so nothing was deleted. It will be available once the Swaadone backend is live.',
          );
        }),
    },

    catalog: {
      getHomeFeed: () =>
        wait(() => {
          return {
            categories: homeCategories,
            promotions: [offers.welcome, offers.tandoorFlat, offers.dosaTwenty].map(listingFor),
            popularFoods: allFoods
              .filter((f) => f.isBestseller && f.image && f.isAvailable)
              .slice(0, 8)
              .map(withRestaurant),
            nearby: filterRestaurants({ sort: 'distance' }).slice(0, 5),
          };
        }),
      listCuisines: () => wait(() => categories),
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
            foods: allFoods.filter((f) => f.name.toLowerCase().includes(term)).map(withRestaurant),
          };
        }),
      listDeals: () =>
        wait(() =>
          allFoods
            .filter(
              (f) =>
                f.isAvailable &&
                f.originalPrice !== undefined &&
                f.originalPrice.amountMinor > f.price.amountMinor,
            )
            .map(withRestaurant),
        ),
      getPricingConfig: () =>
        wait(() => {
          const NIGHT_START = '22:00';
          const NIGHT_END = '06:00';
          const startMinutes = parseHHMM(NIGHT_START);
          const endMinutes = parseHHMM(NIGHT_END);
          const nowMinutes = currentIstMinutes();
          return {
            nightCharge: {
              enabled: false, // disabled until configured by admin
              isNightNow: isInsideNightWindow(nowMinutes, startMinutes, endMinutes),
              chargeType: 'fixed' as const,
              amountMinor: 2000, // ₹20 default — admin must confirm before launch
              percentBps: null,
              nightStart: NIGHT_START,
              nightEnd: NIGHT_END,
            },
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
      getDeliveryAddress: () => wait(() => findAddress(selectedAddressId)),
      listAddresses: () =>
        wait(() => ({ addresses: [...addresses], selectedId: selectedAddressId })),
      saveAddress: ({ id, location, ...fields }) =>
        wait((): Address => {
          const result = validateAddress(fields);
          if (!result.valid) {
            throw new ServiceError('validation', Object.values(result.errors)[0]!);
          }
          if (id) {
            const existing = findAddress(id);
            // An edit replaces every field: cleared optional fields are removed.
            const updated: Address = {
              id,
              location: location ?? existing.location,
              ...result.value,
            };
            addresses = addresses.map((a) => (a.id === id ? updated : a));
            return updated;
          }
          addressCounter += 1;
          const created: Address = {
            id: `a-${Date.now().toString(36)}-${addressCounter}`,
            location: location ?? placeholderLocation,
            ...result.value,
          };
          addresses = [...addresses, created];
          return created;
        }),
      deleteAddress: (id) =>
        wait(() => {
          findAddress(id);
          if (addresses.length === 1) {
            throw new ServiceError('validation', 'Add another address before removing this one.');
          }
          addresses = addresses.filter((a) => a.id !== id);
          // Removing the delivery address hands delivery to the first remaining one.
          if (selectedAddressId === id) selectedAddressId = addresses[0]!.id;
        }),
      setDeliveryAddress: (id) =>
        wait(() => {
          const address = findAddress(id);
          selectedAddressId = id;
          return address;
        }),
    },

    orders: {
      listOrders: () => wait(() => ({ items: [...placedOrders].reverse(), nextCursor: null })),
      placeOrder: (input) =>
        wait(() => {
          const restaurant = findRestaurant(input.restaurantId);
          if (!restaurant.isOpen) {
            throw new ServiceError('validation', `${restaurant.name} is closed right now.`);
          }
          if (
            input.items.length === 0 ||
            input.items.some((i) => i.restaurantId !== restaurant.id)
          ) {
            throw new ServiceError('validation', 'Your cart is empty or has changed.');
          }
          if (input.paymentMethod !== 'cod') {
            throw new ServiceError('validation', 'Online payment is not available yet.');
          }
          // Snapshot the address so later edits or removal don't change this order.
          const {
            id: _addressId,
            location,
            ...addressFields
          } = findAddress(input.deliveryAddressId);
          const order: OrderSummary = {
            id: `ord-${Date.now().toString(36)}-${placedOrders.length + 1}`,
            orderNumber: `SW${String(1001 + placedOrders.length)}`,
            restaurantId: restaurant.id,
            restaurantName: restaurant.name,
            status: 'placed',
            lines: input.items.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              lineTotal: lineTotal(item),
            })),
            total: input.total,
            placedAt: new Date().toISOString(),
            deliveryAddress: { ...addressFields, location: { ...location } },
          };
          placedOrders.push(order);
          return order;
        }),
      saveInstructions: (orderId, instructions) =>
        wait(() => {
          if (!placedOrders.some((o) => o.id === orderId)) {
            throw new ServiceError('not_found', 'This order could not be found.');
          }
          if (
            !validInstructionSet(instructions.restaurant) ||
            !validInstructionSet(instructions.delivery)
          ) {
            throw new ServiceError('validation', 'These instructions could not be saved.');
          }
          instructionsByOrder.set(orderId, {
            restaurant: {
              ...instructions.restaurant,
              options: [...instructions.restaurant.options],
            },
            delivery: { ...instructions.delivery, options: [...instructions.delivery.options] },
          });
        }),
    },

    offers: {
      listAvailable: () => wait(() => Object.values<Offer>(offers).map(listingFor)),
    },

    favorites: {
      list: () =>
        wait(() => {
          const ids = favoritesOfCurrentUser();
          return filterRestaurants().filter((r) => ids.has(r.id));
        }),
      add: (restaurantId) =>
        wait(() => {
          findRestaurant(restaurantId);
          favoritesOfCurrentUser().add(restaurantId);
        }),
      remove: (restaurantId) =>
        wait(() => {
          favoritesOfCurrentUser().delete(restaurantId);
        }),
    },
  };
}
