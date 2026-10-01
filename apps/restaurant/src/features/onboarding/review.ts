import {
  formatE164India,
  formatLocalTime12h,
  formatMoney,
  crossesMidnight,
  isValidIndianMobile,
  parseRupees,
  toE164India,
} from '@hungerly/utils';

import { DAY_NAMES, type RegistrationSection } from '@/services/registrationRules';

import type { DayHoursDraft, RegistrationDraft } from './draft';
import { foodTypeLabel, roleOptionLabel } from './options';
import { stepForSection } from './steps';

export interface ReviewRow {
  label: string;
  value: string;
}

export interface ReviewSection {
  section: RegistrationSection;
  title: string;
  /** Where the section's Edit action goes. */
  editHref: ReturnType<typeof stepForSection>['href'];
  rows: ReviewRow[];
}

const NOT_PROVIDED = 'Not provided';

function orNotProvided(value: string): string {
  return value.trim() || NOT_PROVIDED;
}

export function formatDayHours(day: DayHoursDraft): string {
  if (!day.isOpen) return 'Closed';
  const range = `${formatLocalTime12h(day.opensAt)} – ${formatLocalTime12h(day.closesAt)}`;
  return crossesMidnight(day) ? `${range} (next day)` : range;
}

/**
 * The read-only Review step, as data: every collected value grouped by section with its
 * Edit destination. Pure, so the screen only renders it.
 */
export function reviewSections(draft: RegistrationDraft): ReviewSection[] {
  const { restaurant, owner, address, contact, operations } = draft;
  const minimumOrder = parseRupees(operations.minimumOrder);
  const section = (key: RegistrationSection, title: string, rows: ReviewRow[]): ReviewSection => ({
    section: key,
    title,
    editHref: stepForSection(key).href,
    rows,
  });

  return [
    section('restaurant', 'Restaurant', [
      { label: 'Name', value: orNotProvided(restaurant.name) },
      {
        label: 'Cuisines',
        value: restaurant.cuisines.length ? restaurant.cuisines.join(', ') : NOT_PROVIDED,
      },
      { label: 'Food type', value: foodTypeLabel(restaurant.foodType) },
    ]),
    section('owner', 'Owner or manager', [
      { label: 'Full name', value: orNotProvided(owner.fullName) },
      { label: 'Role', value: roleOptionLabel(owner.role) },
    ]),
    section('address', 'Address', [
      { label: 'Address', value: orNotProvided(address.line1) },
      { label: 'Area / locality', value: orNotProvided(address.locality) },
      { label: 'City', value: orNotProvided(address.city) },
      { label: 'State', value: orNotProvided(address.state) },
      { label: 'PIN code', value: orNotProvided(address.postalCode) },
    ]),
    section('contact', 'Contact', [
      {
        label: 'Phone',
        value: isValidIndianMobile(contact.phone)
          ? formatE164India(toE164India(contact.phone))
          : orNotProvided(contact.phone),
      },
      { label: 'Email', value: orNotProvided(contact.email) },
    ]),
    section('operations', 'Operations', [
      ...operations.hours.map((day) => ({
        label: DAY_NAMES[day.dayOfWeek],
        value: formatDayHours(day),
      })),
      {
        label: 'Average preparation',
        value:
          operations.avgPrepMinutes === null ? NOT_PROVIDED : `${operations.avgPrepMinutes} min`,
      },
      {
        label: 'Minimum order',
        value: minimumOrder ? formatMoney(minimumOrder) : orNotProvided(operations.minimumOrder),
      },
    ]),
  ];
}
