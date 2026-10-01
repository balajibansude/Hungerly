import { ServiceError } from '@hungerly/app-core';
import type {
  Id,
  PartnerRestaurant,
  PartnerSession,
  RestaurantMembership,
  StaffUser,
} from '@hungerly/types';
import { normalizeEmail } from '@hungerly/utils';

import { DEMO_OWNER_PHONE_E164, demoOwner, MASALA_JUNCTION_ID, masalaJunction } from '../../mock';
import type { LoginIdentifier, Services } from '../contracts';

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
  usersByIdentity: Map<string, StaffUser>;
  membershipsByUser: Map<Id, RestaurantMembership[]>;
  restaurants: Map<Id, PartnerRestaurant>;
  challenges: Map<string, LoginIdentifier>;
  session: PartnerSession | null;
}

function createState(): MockState {
  return {
    usersByIdentity: new Map([[`phone:${DEMO_PHONE_E164}`, demoOwner]]),
    membershipsByUser: new Map([
      [
        demoOwner.id,
        [{ restaurantId: MASALA_JUNCTION_ID, restaurantName: masalaJunction.name, role: 'owner' }],
      ],
    ]),
    restaurants: new Map([[MASALA_JUNCTION_ID, masalaJunction]]),
    challenges: new Map(),
    session: null,
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
    const existing = state.usersByIdentity.get(key);
    if (existing) return existing;
    const user: StaffUser = {
      id: `usr-${nextId++}`,
      fullName: null,
      phoneE164: identifier.channel === 'phone' ? identifier.phoneE164 : null,
      email: identifier.channel === 'email' ? normalizeEmail(identifier.email) : null,
    };
    state.usersByIdentity.set(key, user);
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
