import type { CurrencyCode, Money } from '@hungerly/types';

const CURRENCY_SYMBOL: Record<CurrencyCode, string> = { INR: '₹' };
const MINOR_UNITS_PER_MAJOR = 100;

export function money(amountMinor: number, currency: CurrencyCode = 'INR'): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`Money must be an integer number of minor units, got ${amountMinor}`);
  }
  return { amountMinor, currency };
}

export function zeroMoney(currency: CurrencyCode = 'INR'): Money {
  return money(0, currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function multiplyMoney(a: Money, factor: number): Money {
  if (!Number.isInteger(factor)) {
    throw new Error(`Money can only be multiplied by an integer, got ${factor}`);
  }
  return money(a.amountMinor * factor, a.currency);
}

export function sumMoney(values: Money[], currency: CurrencyCode = 'INR'): Money {
  return values.reduce(addMoney, zeroMoney(currency));
}

/**
 * Formats money for display, e.g. 24900 → "₹249" and 24950 → "₹249.50".
 * Uses Indian digit grouping (₹1,24,999).
 */
export function formatMoney(value: Money): string {
  const negative = value.amountMinor < 0;
  const absolute = Math.abs(value.amountMinor);
  const major = Math.floor(absolute / MINOR_UNITS_PER_MAJOR);
  const minor = absolute % MINOR_UNITS_PER_MAJOR;
  const grouped = groupIndian(major);
  const fraction = minor === 0 ? '' : `.${String(minor).padStart(2, '0')}`;
  return `${negative ? '−' : ''}${CURRENCY_SYMBOL[value.currency]}${grouped}${fraction}`;
}

function groupIndian(value: number): string {
  const digits = String(value);
  if (digits.length <= 3) return digits;
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${lastThree}`;
}

const RUPEES_INPUT = /^\d+(\.\d{1,2})?$/;

/**
 * Parses what a person types as a rupee amount ("149", "149.5", "1,499.00") into money
 * in paise. Returns `null` for anything that is not a non-negative amount with at most
 * two decimals. Uses string arithmetic, never floats.
 */
export function parseRupees(input: string, currency: CurrencyCode = 'INR'): Money | null {
  const cleaned = input.trim().replace(/[₹,\s]/g, '');
  if (!RUPEES_INPUT.test(cleaned)) return null;
  const [whole = '0', fraction = ''] = cleaned.split('.');
  const amountMinor = Number(whole) * MINOR_UNITS_PER_MAJOR + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amountMinor) ? money(amountMinor, currency) : null;
}
