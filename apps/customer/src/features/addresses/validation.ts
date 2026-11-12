import type { AddressLabel } from '@hungerly/types';

import { ADDRESS_LABELS } from './format';

/** What the address form edits: every field as typed. */
export interface AddressDraft {
  label: AddressLabel;
  line1: string;
  line2: string;
  landmark: string;
  locality: string;
  city: string;
  postalCode: string;
}

export type AddressField = keyof AddressDraft;

/** Trimmed, with empty optional fields removed. */
export interface CleanAddress {
  label: AddressLabel;
  line1: string;
  line2?: string;
  landmark?: string;
  locality: string;
  city: string;
  postalCode: string;
}

export type AddressValidation =
  | { valid: true; value: CleanAddress }
  | { valid: false; errors: Partial<Record<AddressField, string>> };

export const ADDRESS_LIMITS = {
  line1: { min: 3, max: 120 },
  line2: { max: 120 },
  landmark: { max: 80 },
  locality: { min: 2, max: 60 },
  city: { min: 2, max: 40 },
} as const;

/** Indian PIN code: six digits, not starting with 0. */
const PIN_CODE = /^[1-9]\d{5}$/;
/** City names: letters, spaces, dots and hyphens (e.g. "Navi Mumbai", "St. Thomas Mount"). */
const CITY = /^[\p{L}][\p{L} .'-]*$/u;

/** Collapses repeated spaces and trims. */
const clean = (value: string | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

export const emptyAddressDraft: AddressDraft = {
  label: 'home',
  line1: '',
  line2: '',
  landmark: '',
  locality: '',
  city: '',
  postalCode: '',
};

/** Validates a draft. Messages are written for the customer, one per field. */
export function validateAddress(draft: Partial<AddressDraft>): AddressValidation {
  const v = {
    label: draft.label,
    line1: clean(draft.line1),
    line2: clean(draft.line2),
    landmark: clean(draft.landmark),
    locality: clean(draft.locality),
    city: clean(draft.city),
    postalCode: (draft.postalCode ?? '').replace(/\s+/g, ''),
  };
  const errors: Partial<Record<AddressField, string>> = {};

  if (!v.label || !ADDRESS_LABELS.includes(v.label)) errors.label = 'Choose Home, Work or Other.';

  if (!v.line1) errors.line1 = 'Enter your flat, house or building.';
  else if (v.line1.length < ADDRESS_LIMITS.line1.min) errors.line1 = 'This looks too short.';
  else if (v.line1.length > ADDRESS_LIMITS.line1.max)
    errors.line1 = `Keep it under ${ADDRESS_LIMITS.line1.max} characters.`;

  if (v.line2.length > ADDRESS_LIMITS.line2.max)
    errors.line2 = `Keep it under ${ADDRESS_LIMITS.line2.max} characters.`;
  if (v.landmark.length > ADDRESS_LIMITS.landmark.max)
    errors.landmark = `Keep it under ${ADDRESS_LIMITS.landmark.max} characters.`;

  if (!v.locality) errors.locality = 'Enter your area or locality.';
  else if (v.locality.length < ADDRESS_LIMITS.locality.min)
    errors.locality = 'This looks too short.';
  else if (v.locality.length > ADDRESS_LIMITS.locality.max)
    errors.locality = `Keep it under ${ADDRESS_LIMITS.locality.max} characters.`;

  if (!v.city) errors.city = 'Enter your city.';
  else if (v.city.length < ADDRESS_LIMITS.city.min || v.city.length > ADDRESS_LIMITS.city.max)
    errors.city = 'Enter a valid city name.';
  else if (!CITY.test(v.city)) errors.city = 'Use letters only for the city.';

  if (!v.postalCode) errors.postalCode = 'Enter your 6-digit PIN code.';
  else if (!PIN_CODE.test(v.postalCode)) errors.postalCode = 'Enter a valid 6-digit PIN code.';

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    value: {
      label: v.label!,
      line1: v.line1,
      ...(v.line2 ? { line2: v.line2 } : {}),
      ...(v.landmark ? { landmark: v.landmark } : {}),
      locality: v.locality,
      city: v.city,
      postalCode: v.postalCode,
    },
  };
}
