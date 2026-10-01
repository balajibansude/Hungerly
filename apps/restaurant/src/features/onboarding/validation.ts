import type { OpeningHoursSlot } from '@hungerly/types';
import { isValidIndianMobile, normalizeEmail, parseRupees, toE164India } from '@hungerly/utils';

import type { RestaurantRegistration } from '@/services';
import { rules, type RegistrationSection } from '@/services/registrationRules';

import type { DayHoursDraft, RegistrationDraft } from './draft';

/** Field key → message. Opening-hours issues for one day use the key `hours.<dayOfWeek>`. */
export type FieldErrors = Record<string, string>;

const SECTIONS: RegistrationSection[] = ['restaurant', 'owner', 'address', 'contact', 'operations'];

/** Open days become slots; closed days have none (`restaurant_hours` rows). */
export function hoursFromDraft(days: DayHoursDraft[]): OpeningHoursSlot[] {
  return days
    .filter((day) => day.isOpen)
    .map(({ dayOfWeek, opensAt, closesAt }) => ({ dayOfWeek, opensAt, closesAt }));
}

function collect(entries: [string, string | null][]): FieldErrors {
  const errors: FieldErrors = {};
  for (const [field, message] of entries) {
    if (message) errors[field] = message;
  }
  return errors;
}

/** Validation errors for one section of the draft (empty when the section is valid). */
export function sectionErrors(draft: RegistrationDraft, section: RegistrationSection): FieldErrors {
  switch (section) {
    case 'restaurant': {
      const { name, cuisines, foodType } = draft.restaurant;
      return collect([
        ['name', rules.restaurantName(name)],
        ['cuisines', rules.cuisines(cuisines)],
        ['foodType', rules.foodType(foodType)],
      ]);
    }
    case 'owner': {
      const { fullName, role } = draft.owner;
      return collect([
        ['fullName', rules.fullName(fullName)],
        ['role', rules.role(role)],
      ]);
    }
    case 'address': {
      const { line1, locality, city, state, postalCode } = draft.address;
      return collect([
        ['line1', rules.addressLine(line1)],
        ['locality', rules.locality(locality)],
        ['city', rules.city(city)],
        ['state', rules.state(state)],
        ['postalCode', rules.postalCode(postalCode)],
      ]);
    }
    case 'contact': {
      const { phone, email } = draft.contact;
      return collect([
        ['phone', rules.phoneE164(phone)],
        ['email', rules.email(email.trim() ? email : null)],
      ]);
    }
    case 'operations': {
      const { hours, avgPrepMinutes, minimumOrder } = draft.operations;
      const errors: FieldErrors = {};
      const hoursIssue = rules.hours(hoursFromDraft(hours));
      if (hoursIssue) {
        errors[hoursIssue.dayOfWeek === undefined ? 'hours' : `hours.${hoursIssue.dayOfWeek}`] =
          hoursIssue.message;
      }
      const prep = rules.avgPrepMinutes(avgPrepMinutes);
      if (prep) errors.avgPrepMinutes = prep;
      if (!minimumOrder.trim()) {
        errors.minimumOrder = 'Enter a minimum order amount (₹0 for none)';
      } else {
        const amount = parseRupees(minimumOrder);
        const message = amount
          ? rules.minimumOrder(amount)
          : 'Enter an amount in rupees, like 149 or 149.50';
        if (message) errors.minimumOrder = message;
      }
      return errors;
    }
  }
}

function isSectionValid(draft: RegistrationDraft, section: RegistrationSection): boolean {
  return Object.keys(sectionErrors(draft, section)).length === 0;
}

/** The first section (in step order) that is not valid, or `null` if the draft is complete. */
export function firstInvalidSection(draft: RegistrationDraft): RegistrationSection | null {
  return SECTIONS.find((section) => !isSectionValid(draft, section)) ?? null;
}

export type ParsedDraft =
  | { ok: true; registration: RestaurantRegistration }
  | { ok: false; section: RegistrationSection; errors: FieldErrors };

/** Full-draft validation before submitting: a complete registration, or the first problem. */
export function parseDraft(draft: RegistrationDraft): ParsedDraft {
  const section = firstInvalidSection(draft);
  if (section) return { ok: false, section, errors: sectionErrors(draft, section) };

  const { restaurant, owner, address, contact, operations } = draft;
  const minimumOrder = parseRupees(operations.minimumOrder);
  const invalid = (s: RegistrationSection): ParsedDraft => ({
    ok: false,
    section: s,
    errors: sectionErrors(draft, s),
  });
  // Already guaranteed by the section checks above; these narrow the types without casts.
  if (!restaurant.foodType) return invalid('restaurant');
  if (!owner.role) return invalid('owner');
  if (!isValidIndianMobile(contact.phone)) return invalid('contact');
  if (!minimumOrder || operations.avgPrepMinutes === null) return invalid('operations');

  return {
    ok: true,
    registration: {
      name: restaurant.name.trim(),
      cuisines: [...restaurant.cuisines],
      foodType: restaurant.foodType,
      registrant: { fullName: owner.fullName.trim(), role: owner.role },
      address: {
        line1: address.line1.trim(),
        locality: address.locality.trim(),
        city: address.city.trim(),
        state: address.state.trim(),
        postalCode: address.postalCode.replace(/\s/g, ''),
      },
      phoneE164: toE164India(contact.phone),
      email: contact.email.trim() ? normalizeEmail(contact.email) : null,
      hours: hoursFromDraft(operations.hours),
      avgPrepMinutes: operations.avgPrepMinutes,
      minimumOrder,
    },
  };
}
