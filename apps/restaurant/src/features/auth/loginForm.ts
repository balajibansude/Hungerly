import {
  formatE164India,
  isValidEmail,
  isValidIndianMobile,
  normalizeEmail,
  toE164India,
} from '@hungerly/utils';

import type { OtpRequest } from '@hungerly/api-client';

/** How an owner identifies themselves: phone (primary) or email. */
export type LoginIdentifier = OtpRequest;

export type LoginChannel = LoginIdentifier['channel'];

/** Turns what the user typed into an identifier, or `null` if it is not valid yet. */
export function parseLoginInput(channel: LoginChannel, input: string): LoginIdentifier | null {
  if (channel === 'phone') {
    return isValidIndianMobile(input) ? { channel, phoneE164: toE164India(input) } : null;
  }
  return isValidEmail(input) ? { channel, email: normalizeEmail(input) } : null;
}

export function loginInputError(channel: LoginChannel): string {
  return channel === 'phone'
    ? 'Enter a valid 10-digit mobile number'
    : 'Enter a valid email address, like name@restaurant.com';
}

/** The value passed between screens (route params are strings). */
export function destinationOf(identifier: LoginIdentifier): string {
  return identifier.channel === 'phone' ? identifier.phoneE164 : identifier.email;
}

/** Rebuilds an identifier from route params; `null` if they are missing or tampered with. */
export function identifierFromParams(
  channel: string | undefined,
  destination: string | undefined,
): LoginIdentifier | null {
  if (!destination || (channel !== 'phone' && channel !== 'email')) return null;
  return parseLoginInput(channel, destination);
}

/** "by SMS to +91 98765 43210" / "by email to name@restaurant.com". */
export function describeDestination(identifier: LoginIdentifier): string {
  return identifier.channel === 'phone'
    ? `by SMS to ${formatE164India(identifier.phoneE164)}`
    : `by email to ${identifier.email}`;
}
