import type { Id, PartnerRestaurant, PartnerSession } from '@hungerly/types';

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
 * Phase 2 covers authentication and the restaurant profile. Orders, menu, notifications
 * and insights services are added with their phases.
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

export interface Services {
  auth: AuthService;
  restaurants: RestaurantService;
}
