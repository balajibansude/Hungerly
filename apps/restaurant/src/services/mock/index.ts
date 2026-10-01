import { ServiceError } from '@hungerly/app-core';
import type {
  Id,
  PartnerRestaurant,
  PartnerSession,
  RestaurantMembership,
  StaffUser,
} from '@hungerly/types';
import { money, normalizeEmail, normalizePincode } from '@hungerly/utils';

import { DEMO_OWNER_PHONE_E164, demoOwner, MASALA_JUNCTION_ID, masalaJunction } from '../../mock';
import type { LoginIdentifier, RestaurantRegistration, Services } from '../contracts';
import { validateRegistration } from '../registrationRules';

/**
 * PROTOTYPE ONLY. In-memory implementations of the service contracts, used until the
 * backend exists. Nothing here performs real authentication, messaging or networking.
 * All services share one in-memory state, like one backend would.
 */
export interface MockOptions {
  /** Simulated network latency so loading states are visible. Use 0 in tests. */
  latencyMs?: number;
}

/** The only code the prototype accepts. Shown on the verify screen as a hint. */
export const PROTOTYPE_OTP = '123456';

/** Signs in as the owner of the demo restaurant, Masala Junction. */
export const DEMO_PHONE_E164 = DEMO_OWNER_PHONE_E164;

/** One identity per phone number or (normalised) email address. */
function identityKey(identifier: LoginIdentifier): string {
  return identifier.channel === 'phone'
    ? `phone:${identifier.phoneE164}`
    : `email:${normalizeEmail(identifier.email)}`;
}

interface MockState {
  users: Map<Id, StaffUser>;
  userIdByIdentity: Map<string, Id>;
  membershipsByUser: Map<Id, RestaurantMembership[]>;
  restaurants: Map<Id, PartnerRestaurant>;
  challenges: Map<string, LoginIdentifier>;
  /** Completed registrations by `${userId}:${idempotencyKey}` → restaurant id. */
  registrations: Map<string, Id>;
  session: PartnerSession | null;
}

function createState(): MockState {
  return {
    users: new Map([[demoOwner.id, demoOwner]]),
    userIdByIdentity: new Map([[`phone:${DEMO_PHONE_E164}`, demoOwner.id]]),
    membershipsByUser: new Map([
      [
        demoOwner.id,
        [{ restaurantId: MASALA_JUNCTION_ID, restaurantName: masalaJunction.name, role: 'owner' }],
      ],
    ]),
    restaurants: new Map([[MASALA_JUNCTION_ID, masalaJunction]]),
    challenges: new Map(),
    registrations: new Map(),
    session: null,
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The restaurant a registration creates: submitted for review, offline until approved. */
function restaurantFrom(id: Id, registration: RestaurantRegistration): PartnerRestaurant {
  const { address } = registration;
  const name = registration.name.trim();
  return {
    id,
    slug: `${slugify(name) || 'restaurant'}-${id}`,
    name,
    description: '',
    phoneE164: registration.phoneE164,
    email: registration.email === null ? null : normalizeEmail(registration.email),
    address: {
      line1: address.line1.trim(),
      ...(address.line2?.trim() ? { line2: address.line2.trim() } : {}),
      locality: address.locality.trim(),
      city: address.city.trim(),
      state: address.state.trim(),
      postalCode: normalizePincode(address.postalCode),
    },
    cuisines: [...registration.cuisines],
    foodType: registration.foodType,
    // BLUEPRINT §26: a submitted registration waits for admin review before going live.
    status: 'pending_review',
    isAcceptingOrders: false,
    avgPrepMinutes: registration.avgPrepMinutes,
    minimumOrder: registration.minimumOrder,
    packagingFee: money(0),
    hours: registration.hours.map((slot) => ({ ...slot })),
    rating: { average: 0, count: 0 },
  };
}

export function createMockServices({ latencyMs = 350 }: MockOptions = {}): Services {
  const state = createState();
  let nextId = 1;

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

  /** Finds the user for an identity, creating a new one (no restaurants yet) on first login. */
  const userFor = (identifier: LoginIdentifier): StaffUser => {
    const key = identityKey(identifier);
    const existingId = state.userIdByIdentity.get(key);
    const existing = existingId ? state.users.get(existingId) : undefined;
    if (existing) return existing;
    const user: StaffUser = {
      id: `usr-${nextId++}`,
      fullName: null,
      phoneE164: identifier.channel === 'phone' ? identifier.phoneE164 : null,
      email: identifier.channel === 'email' ? normalizeEmail(identifier.email) : null,
    };
    state.users.set(user.id, user);
    state.userIdByIdentity.set(key, user.id);
    return user;
  };

  const sessionFor = (user: StaffUser): PartnerSession => ({
    user,
    memberships: state.membershipsByUser.get(user.id) ?? [],
  });

  return {
    auth: {
      restoreSession: () => wait(() => state.session),
      requestOtp: (identifier) =>
        wait(() => {
          const requestId = `otp-${nextId++}`;
          state.challenges.set(requestId, identifier);
          return { requestId, expiresInSeconds: 300, resendAfterSeconds: 30 };
        }),
      verifyOtp: (requestId, code) =>
        wait(() => {
          const identifier = state.challenges.get(requestId);
          if (!identifier) {
            throw new ServiceError('auth.otp_expired', 'This code has expired. Request a new one.');
          }
          if (code !== PROTOTYPE_OTP) {
            throw new ServiceError(
              'auth.otp_invalid',
              'That code is not correct. Please try again.',
            );
          }
          state.challenges.delete(requestId);
          state.session = sessionFor(userFor(identifier));
          return state.session;
        }),
      signOut: () =>
        wait(() => {
          state.session = null;
        }),
    },

    onboarding: {
      completeRegistration: (registration, idempotencyKey) =>
        wait(() => {
          const session = state.session;
          if (!session) throw new ServiceError('validation', 'Please log in again.');

          // A retry of a registration that already succeeded returns the same restaurant.
          const registrationKey = `${session.user.id}:${idempotencyKey}`;
          const existingId = state.registrations.get(registrationKey);
          const existing = existingId ? state.restaurants.get(existingId) : undefined;
          if (existing) return { restaurant: existing, session };

          const [issue] = validateRegistration(registration);
          if (issue) throw new ServiceError('validation', issue.message);

          const restaurant = restaurantFrom(`rst-${nextId++}`, registration);
          state.restaurants.set(restaurant.id, restaurant);

          const membership: RestaurantMembership = {
            restaurantId: restaurant.id,
            restaurantName: restaurant.name,
            role: registration.registrant.role,
          };
          const memberships = [...(state.membershipsByUser.get(session.user.id) ?? []), membership];
          state.membershipsByUser.set(session.user.id, memberships);

          // The registrant's name is the only identity field registration may change.
          const user: StaffUser = {
            ...session.user,
            fullName: registration.registrant.fullName.trim(),
          };
          state.users.set(user.id, user);

          state.registrations.set(registrationKey, restaurant.id);
          state.session = sessionFor(user);
          return { restaurant, session: state.session };
        }),
    },

    restaurants: {
      get: (id) =>
        wait(() => {
          const isMember = state.session?.memberships.some((m) => m.restaurantId === id);
          const restaurant = state.restaurants.get(id);
          // Like the API, a restaurant you do not work at is indistinguishable from a missing one.
          if (!isMember || !restaurant) {
            throw new ServiceError('not_found', 'This restaurant is not available to you.');
          }
          return restaurant;
        }),
    },
  };
}
