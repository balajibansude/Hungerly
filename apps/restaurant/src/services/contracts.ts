import type {
  Id,
  PartnerRestaurant,
  PartnerSession,
  RestaurantAddress,
  StaffRole,
} from '@hungerly/types';

/**
 * Service contracts: the only way UI code talks to data.
 *
 *   UI (screens, hooks) → Service interfaces (this file) → implementation
 *                                                           ├─ mock (now)
 *                                                           └─ API client → backend (later)
 *
 * Contracts use domain types from @hungerly/types, never wire formats, so the backend
 * technology can change without touching screens. Implementations throw `ServiceError`
 * (@hungerly/app-core) for expected failures.
 *
 * Covers authentication, registration and the restaurant profile. Orders, menu,
 * notifications and insights services are added with their phases.
 */

/** How restaurant staff identify themselves: phone (primary) or email (R1). */
export type LoginIdentifier =
  { channel: 'phone'; phoneE164: string } | { channel: 'email'; email: string };

export interface OtpChallenge {
  requestId: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

export interface AuthService {
  /** Restores a previous session, or returns null if the user must sign in. */
  restoreSession(): Promise<PartnerSession | null>;
  /** Sends a one-time code by SMS or email. */
  requestOtp(identifier: LoginIdentifier): Promise<OtpChallenge>;
  /** Signs in. A first-time identity gets a session without restaurant memberships. */
  verifyOtp(requestId: string, code: string): Promise<PartnerSession>;
  signOut(): Promise<void>;
}

export interface RestaurantService {
  /** The restaurant profile, as its staff see it (`GET /partner/restaurants/{id}`). */
  get(id: Id): Promise<PartnerRestaurant>;
}

/** The role the person registering takes at the new restaurant. */
export type RegistrantRole = Extract<StaffRole, 'owner' | 'manager'>;

/**
 * Everything needed to register a restaurant (R3). Field names match `PartnerRestaurant`
 * so the server can store it as-is. The map location and KYC documents are collected in
 * later phases, so `address.location` is not part of registration yet.
 */
export interface RestaurantRegistration {
  name: PartnerRestaurant['name'];
  cuisines: PartnerRestaurant['cuisines'];
  foodType: PartnerRestaurant['foodType'];
  /** The signed-in person: their name on the account and their role at the restaurant. */
  registrant: { fullName: string; role: RegistrantRole };
  address: Omit<RestaurantAddress, 'location'>;
  phoneE164: PartnerRestaurant['phoneE164'];
  email: PartnerRestaurant['email'];
  hours: PartnerRestaurant['hours'];
  avgPrepMinutes: PartnerRestaurant['avgPrepMinutes'];
  minimumOrder: PartnerRestaurant['minimumOrder'];
}

export interface RegistrationResult {
  restaurant: PartnerRestaurant;
  /** The caller's session, now including a membership for the new restaurant. */
  session: PartnerSession;
}

export interface OnboardingService {
  /**
   * Creates the restaurant (submitted for review), makes the caller a member and returns
   * the updated session. Retrying with the same `idempotencyKey` returns the original
   * result instead of creating a second restaurant. Throws `validation` for invalid input.
   */
  completeRegistration(
    registration: RestaurantRegistration,
    idempotencyKey: string,
  ): Promise<RegistrationResult>;
}

export interface Services {
  auth: AuthService;
  onboarding: OnboardingService;
  restaurants: RestaurantService;
}
