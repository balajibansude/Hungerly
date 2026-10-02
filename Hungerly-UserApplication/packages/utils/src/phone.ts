/**
 * Indian mobile number helpers for the login form.
 *
 * This is client-side UX validation only. The backend is responsible for authoritative
 * validation (see docs/SECURITY.md → Input validation).
 */

const INDIA_COUNTRY_CODE = '+91';
const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/** Strips everything except digits and drops a leading country code or trunk zero. */
export function normalizeIndianMobile(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export function isValidIndianMobile(input: string): boolean {
  return INDIAN_MOBILE.test(normalizeIndianMobile(input));
}

export function toE164India(input: string): string {
  const national = normalizeIndianMobile(input);
  if (!INDIAN_MOBILE.test(national)) {
    throw new Error('Not a valid Indian mobile number');
  }
  return `${INDIA_COUNTRY_CODE}${national}`;
}

/** "+919876543210" → "+91 98765 43210". */
export function formatE164India(e164: string): string {
  const national = e164.replace(INDIA_COUNTRY_CODE, '');
  return `${INDIA_COUNTRY_CODE} ${national.slice(0, 5)} ${national.slice(5)}`;
}
