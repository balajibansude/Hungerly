/**
 * Indian postal address helpers for forms. Client-side UX validation only; the backend
 * validates authoritatively (docs/SECURITY.md → Input validation).
 */

/** Six digits, not starting with 0 (India Post PIN code). */
const INDIAN_PINCODE = /^[1-9]\d{5}$/;

export function normalizePincode(input: string): string {
  return input.replace(/\s/g, '');
}

export function isValidIndianPincode(input: string): boolean {
  return INDIAN_PINCODE.test(normalizePincode(input));
}
