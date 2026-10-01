import { ServiceError } from '@hungerly/app-core';
import type {
  Id,
  OrderRejectReason,
  OrderStatus,
  PartnerOrder,
  PartnerRestaurant,
  PartnerSession,
  RestaurantMembership,
  StaffUser,
} from '@hungerly/types';
import {
  canTransition,
  isValidPrepMinutes,
  money,
  normalizeEmail,
  normalizePincode,
  PREP_MINUTES_RANGE,
} from '@hungerly/utils';

import {
  DEMO_OWNER_PHONE_E164,
  demoOwner,
  MASALA_JUNCTION_ID,
  masalaJunction,
  masalaJunctionOrders,
} from '../../mock';
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
  /** Clock for seeded order times and order actions. Tests pass a fixed time. */
  now?: () => Date;
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
  orders: Map<Id, PartnerOrder>;
  session: PartnerSession | null;
}

function createState(now: Date): MockState {
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
    // Only the approved demo restaurant has orders; new registrations are still in review.
    orders: new Map(masalaJunctionOrders(now).map((order) => [order.id, order])),
    session: null,
  };
}

const REJECT_REASONS: readonly OrderRejectReason[] = [
  'item_out_of_stock',
  'too_busy',
  'closing',
  'other',
];

/** Why the restaurant cannot act on an order in this status (`order.invalid_transition`). */
function invalidTransitionMessage(status: OrderStatus): string {
  switch (status) {
    case 'placed':
      return 'Accept this order before marking it ready.';
    case 'preparing':
      return 'This order was already accepted.';
    case 'ready_for_pickup':
      return 'This order is already ready for pickup.';
    case 'picked_up':
    case 'delivered':
      return 'This order has already left the kitchen.';
    case 'cancelled':
      return 'This order was already cancelled.';
    case 'pending_payment':
      return 'This order is still waiting for payment.';
  }
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

export function createMockServices({
  latencyMs = 350,
  now = () => new Date(),
}: MockOptions = {}): Services {
  const state = createState(now());
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

  /** Like the API: an order at a restaurant you do not work at does not exist for you. */
  const findOrder = (restaurantId: Id, orderId: Id): PartnerOrder => {
    const isMember = state.session?.memberships.some((m) => m.restaurantId === restaurantId);
    const order = state.orders.get(orderId);
    if (!isMember || !order || order.restaurantId !== restaurantId) {
      throw new ServiceError('not_found', 'This order is no longer available.');
    }
    return order;
  };

  /**
   * Applies one restaurant transition through the shared state machine: rejects moves it
   * does not allow, then stale versions (If-Match), and records the change in the timeline.
   */
  const transition = (
    order: PartnerOrder,
    to: OrderStatus,
    expectedVersion: number,
    changes: Partial<PartnerOrder>,
  ): PartnerOrder => {
    if (!canTransition(order.status, to, 'restaurant')) {
      throw new ServiceError('order.invalid_transition', invalidTransitionMessage(order.status));
    }
    if (order.version !== expectedVersion) {
      throw new ServiceError(
        'order.version_conflict',
        'This order changed since you opened it. Showing the latest.',
      );
    }
    const at = now().toISOString();
    const updated: PartnerOrder = {
      ...order,
      ...changes,
      status: to,
      timeline: [
        ...order.timeline,
        { fromStatus: order.status, toStatus: to, actor: 'restaurant', at },
      ],
      version: order.version + 1,
    };
    state.orders.set(updated.id, updated);
    return updated;
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

    orders: {
      list: (restaurantId) =>
        wait(() => {
          const isMember = state.session?.memberships.some((m) => m.restaurantId === restaurantId);
          if (!isMember)
            throw new ServiceError('not_found', 'This restaurant is not available to you.');
          return [...state.orders.values()]
            .filter((order) => order.restaurantId === restaurantId)
            .sort((a, b) => b.placedAt.localeCompare(a.placedAt));
        }),
      get: (restaurantId, orderId) => wait(() => findOrder(restaurantId, orderId)),
      accept: (restaurantId, orderId, { prepMinutes, expectedVersion }) =>
        wait(() => {
          if (!isValidPrepMinutes(prepMinutes)) {
            throw new ServiceError(
              'validation',
              `Choose a preparation time between ${PREP_MINUTES_RANGE.min} and ${PREP_MINUTES_RANGE.max} minutes.`,
            );
          }
          const order = findOrder(restaurantId, orderId);
          const acceptedAt = now();
          return transition(order, 'preparing', expectedVersion, {
            acceptedAt: acceptedAt.toISOString(),
            prepMinutes,
            estimatedReadyAt: new Date(acceptedAt.getTime() + prepMinutes * 60_000).toISOString(),
          });
        }),
      reject: (restaurantId, orderId, { reason, expectedVersion }) =>
        wait(() => {
          if (!REJECT_REASONS.includes(reason)) {
            throw new ServiceError('validation', 'Choose why you are rejecting this order.');
          }
          const order = findOrder(restaurantId, orderId);
          return transition(order, 'cancelled', expectedVersion, {
            cancelledAt: now().toISOString(),
            cancelledBy: 'restaurant',
            cancellationReason: reason,
            // API §4.17: rejecting a paid order starts a refund; unpaid COD needs none.
            paymentStatus: order.paymentStatus === 'paid' ? 'refund_pending' : 'not_applicable',
          });
        }),
      markReady: (restaurantId, orderId, { expectedVersion }) =>
        wait(() =>
          transition(findOrder(restaurantId, orderId), 'ready_for_pickup', expectedVersion, {
            readyAt: now().toISOString(),
          }),
        ),
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
