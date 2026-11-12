import { ServiceError, type ServiceErrorCode } from '@hungerly/app-core';
import {
  CustomerProfileSchema,
  CustomerSignInResponseSchema,
  isApiError,
  OkSchema,
  OtpChallengeSchema,
  paths,
  type ApiClient,
  type ApiError,
  type CustomerProfile,
} from '@hungerly/api-client';
import type { User } from '@hungerly/types';

import { api as defaultApi, restoreTokens as defaultRestoreTokens } from '@/lib/api';
import { clearTokens, hasStoredSession, storeTokens } from '@/lib/tokens';

import type { AuthService } from '../contracts';

/**
 * Real customer authentication over the Swaadone API. Implements the same `AuthService`
 * contract as the mock, so screens and the session store do not change.
 *
 * Tokens never leave this layer: sign-in stores them, sign-out clears them, and refresh
 * is handled by the API client (`@/lib/api`).
 */

const API_TO_SERVICE_CODE: Partial<Record<ApiError['code'], ServiceErrorCode>> = {
  network: 'network',
  validation: 'validation',
  not_found: 'not_found',
  rate_limited: 'auth.otp_rate_limited',
  'auth.otp_invalid': 'auth.otp_invalid',
  'auth.otp_expired': 'auth.otp_expired',
  'auth.otp_attempts_exceeded': 'auth.otp_rate_limited',
};

/**
 * Turns an API failure into a `ServiceError` so `userMessage()` shows the server's message
 * (e.g. "That code is not right…"). Validation errors prefer the first field message.
 * Anything that is not an `ApiError` is passed through untouched.
 */
export function toServiceError(error: unknown): unknown {
  if (!isApiError(error)) return error;
  const code = API_TO_SERVICE_CODE[error.code] ?? (error.status === 0 ? 'network' : 'unknown');
  const fieldMessage =
    error.code === 'validation' ? Object.values(error.fieldErrors).flat()[0] : undefined;
  return new ServiceError(code, fieldMessage ?? error.message);
}

async function translated<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw toServiceError(error);
  }
}

/** The app's `User` has a required phone; customers sign in by phone, so it is always set. */
function toUser(profile: CustomerProfile, fallbackPhone = ''): User {
  return {
    id: profile.id,
    phoneE164: profile.phoneE164 ?? fallbackPhone,
    fullName: profile.fullName,
    email: profile.email,
  };
}

/** A server answer that means "this stored session is no longer usable". */
const isSessionRejected = (error: unknown) =>
  isApiError(error) && (error.status === 401 || error.status === 403);

export function createApiAuthService({
  api = defaultApi,
  restoreTokens = defaultRestoreTokens,
}: { api?: ApiClient; restoreTokens?: () => Promise<boolean> } = {}): AuthService {
  return {
    async requestOtp(phoneE164) {
      const challenge = await translated(() =>
        api.request('POST', paths.auth.otpRequest, {
          body: { channel: 'phone', phoneE164 },
          schema: OtpChallengeSchema,
          anonymous: true,
        }),
      );
      return {
        requestId: challenge.requestId,
        expiresInSeconds: challenge.expiresInSeconds,
        resendAfterSeconds: challenge.resendAfterSeconds,
      };
    },

    async verifyOtp(requestId, code) {
      const res = await translated(() =>
        api.request('POST', paths.customer.auth.otpVerify, {
          body: { requestId, code },
          schema: CustomerSignInResponseSchema,
          anonymous: true,
        }),
      );
      // Stored before the session is returned, so the first authenticated call works.
      await storeTokens(res.tokens);
      return { user: toUser(res.customer.user), isNewUser: res.customer.isNewUser };
    },

    async restoreSession() {
      if (!(await hasStoredSession())) return null;
      // false: no usable session (a rejected refresh already cleared the tokens).
      // Network/5xx failures throw and keep the stored token for the next launch.
      const renewed = await translated(() => restoreTokens());
      if (!renewed) return null;
      try {
        const profile = await api.request('GET', paths.customer.me, {
          schema: CustomerProfileSchema,
        });
        return { user: toUser(profile), isNewUser: !profile.fullName };
      } catch (error) {
        if (isSessionRejected(error)) {
          await clearTokens();
          return null;
        }
        throw toServiceError(error);
      }
    },

    async updateProfile({ fullName }) {
      // Only the name is sent: email is a sign-in identity and cannot be set without
      // verification (`PATCH /customer/me` refuses it).
      const profile = await translated(() =>
        api.request('PATCH', paths.customer.me, {
          body: { fullName },
          schema: CustomerProfileSchema,
        }),
      );
      return toUser(profile);
    },

    async signOut() {
      try {
        await api.request('POST', paths.customer.auth.logout, { schema: OkSchema });
      } catch {
        // Offline or already expired: the device still forgets the session below.
      } finally {
        await clearTokens();
      }
    },

    // No backend endpoint yet: refuse instead of pretending (same as the mock).
    async requestAccountDeletion() {
      throw new ServiceError(
        'unknown',
        'Account deletion isn’t connected yet, so nothing was deleted. Please contact Swaadone support.',
      );
    },
  };
}
