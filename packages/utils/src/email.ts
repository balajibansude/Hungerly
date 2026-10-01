/**
 * Email helpers for login forms. Client-side UX validation only; the backend validates
 * and verifies ownership (docs/SECURITY.md → Input validation).
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

/** Trims and lower-cases, so one inbox is one identity. */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidEmail(input: string): boolean {
  const email = normalizeEmail(input);
  return email.length <= MAX_EMAIL_LENGTH && EMAIL.test(email);
}
