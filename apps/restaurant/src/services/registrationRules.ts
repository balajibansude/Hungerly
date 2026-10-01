import type { DayOfWeek, Money, OpeningHoursSlot } from '@hungerly/types';
import {
  formatMoney,
  isValidEmail,
  isValidIndianMobile,
  isValidIndianPincode,
  money,
  validateWeeklyHours,
} from '@hungerly/utils';

import type { RestaurantRegistration } from './contracts';

/**
 * Registration rules on domain values — one source of truth for the onboarding form
 * (user feedback) and the onboarding service (final safety boundary, like the server).
 * Each rule returns a human message, or `null` when the value is valid.
 */

export type RegistrationSection = 'restaurant' | 'owner' | 'address' | 'contact' | 'operations';

export interface RegistrationIssue {
  section: RegistrationSection;
  field: string;
  message: string;
  /** For opening-hours issues: the day the message is about. */
  dayOfWeek?: DayOfWeek;
}

export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const NAME_LENGTH = { min: 2, max: 80 } as const;

/** `restaurants.avg_prep_minutes` CHECK 5..120 (DATABASE_SCHEMA §4.3). */
const AVG_PREP_MINUTES_RANGE = { min: 5, max: 120 } as const;

/** Sanity bound against typos (e.g. an extra zero); not a business rule. */
const MAX_MINIMUM_ORDER = money(1_00_000_00);

function requiredText(label: string, value: string, max = 120): string | null {
  const trimmed = value.trim();
  if (!trimmed) return `Enter the ${label}`;
  if (trimmed.length > max) return `Keep the ${label} under ${max} characters`;
  return null;
}

function nameRule(label: string, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return `Enter the ${label}`;
  if (trimmed.length < NAME_LENGTH.min) return `The ${label} looks too short`;
  if (trimmed.length > NAME_LENGTH.max) {
    return `Keep the ${label} under ${NAME_LENGTH.max} characters`;
  }
  return null;
}

export const rules = {
  restaurantName: (value: string) => nameRule('restaurant name', value),
  cuisines: (value: readonly string[]) =>
    value.length === 0 ? 'Choose at least one cuisine' : null,
  foodType: (value: string | null) =>
    value === 'veg_only' || value === 'mixed' ? null : 'Choose veg only or mixed',
  fullName: (value: string) => nameRule('full name', value),
  role: (value: string | null) =>
    value === 'owner' || value === 'manager' ? null : 'Choose owner or manager',
  addressLine: (value: string) => requiredText('address', value),
  locality: (value: string) => requiredText('area or locality', value, 80),
  city: (value: string) => requiredText('city', value, 60),
  state: (value: string) => requiredText('state', value, 60),
  postalCode: (value: string) =>
    isValidIndianPincode(value) ? null : 'Enter a valid 6-digit PIN code',
  phoneE164: (value: string) =>
    isValidIndianMobile(value) ? null : 'Enter a valid 10-digit mobile number',
  /** Optional (`restaurants.email` is nullable), but must be valid when given. */
  email: (value: string | null) =>
    value === null || isValidEmail(value) ? null : 'Enter a valid email address',
  hours: (value: OpeningHoursSlot[]): { message: string; dayOfWeek?: DayOfWeek } | null => {
    const issue = validateWeeklyHours(value);
    if (!issue) return null;
    switch (issue.code) {
      case 'no_open_days':
        return { message: 'Open on at least one day' };
      case 'invalid_time':
        return { message: 'Choose a valid time', dayOfWeek: issue.dayOfWeek };
      case 'same_time':
        return {
          message: 'Opening and closing times can’t be the same',
          dayOfWeek: issue.dayOfWeek,
        };
      case 'overlap':
        return {
          message:
            issue.dayOfWeek === issue.withDayOfWeek
              ? `${DAY_NAMES[issue.dayOfWeek]}’s hours overlap`
              : `${DAY_NAMES[issue.dayOfWeek]}’s hours overlap with ${DAY_NAMES[issue.withDayOfWeek]}’s`,
          dayOfWeek: issue.dayOfWeek,
        };
    }
  },
  avgPrepMinutes: (value: number | null) =>
    value !== null &&
    Number.isInteger(value) &&
    value >= AVG_PREP_MINUTES_RANGE.min &&
    value <= AVG_PREP_MINUTES_RANGE.max
      ? null
      : 'Choose an average preparation time',
  minimumOrder: (value: Money) => {
    if (!Number.isInteger(value.amountMinor) || value.amountMinor < 0) {
      return 'Enter a minimum order of ₹0 or more';
    }
    if (value.amountMinor > MAX_MINIMUM_ORDER.amountMinor) {
      return `Enter a minimum order up to ${formatMoney(MAX_MINIMUM_ORDER)}`;
    }
    return null;
  },
};

/** Every problem with a complete registration, in step order. Empty when valid. */
export function validateRegistration(registration: RestaurantRegistration): RegistrationIssue[] {
  const issues: RegistrationIssue[] = [];
  const check = (section: RegistrationSection, field: string, message: string | null) => {
    if (message) issues.push({ section, field, message });
  };
  const { address } = registration;

  check('restaurant', 'name', rules.restaurantName(registration.name));
  check('restaurant', 'cuisines', rules.cuisines(registration.cuisines));
  check('restaurant', 'foodType', rules.foodType(registration.foodType));
  check('owner', 'fullName', rules.fullName(registration.registrant.fullName));
  check('owner', 'role', rules.role(registration.registrant.role));
  check('address', 'line1', rules.addressLine(address.line1));
  check('address', 'locality', rules.locality(address.locality));
  check('address', 'city', rules.city(address.city));
  check('address', 'state', rules.state(address.state));
  check('address', 'postalCode', rules.postalCode(address.postalCode));
  check('contact', 'phone', rules.phoneE164(registration.phoneE164));
  check('contact', 'email', rules.email(registration.email));
  const hours = rules.hours(registration.hours);
  if (hours) issues.push({ section: 'operations', field: 'hours', ...hours });
  check('operations', 'avgPrepMinutes', rules.avgPrepMinutes(registration.avgPrepMinutes));
  check('operations', 'minimumOrder', rules.minimumOrder(registration.minimumOrder));
  return issues;
}
