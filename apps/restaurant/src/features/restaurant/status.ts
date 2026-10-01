import type { PartnerRestaurant, StaffRole } from '@hungerly/types';
import type { BadgeTone } from '@hungerly/ui';
import { orderIntakeBlocker } from '@hungerly/utils';

export interface IntakeStatus {
  label: string;
  detail: string;
  tone: BadgeTone;
}

const lifecycleLabels: Record<PartnerRestaurant['status'], string> = {
  draft: 'Registration not submitted',
  pending_review: 'In review',
  active: 'Active',
  suspended: 'Suspended',
  rejected: 'Needs changes',
  closed: 'Closed permanently',
};

/** Whether orders can come in right now, in staff-facing words (DATABASE_SCHEMA §4.3 rule). */
export function intakeStatusFor(
  restaurant: Pick<PartnerRestaurant, 'status' | 'isAcceptingOrders' | 'hours'>,
  now: Date,
): IntakeStatus {
  switch (orderIntakeBlocker(restaurant, now)) {
    case null:
      return { label: 'Accepting orders', detail: 'Open now and online', tone: 'success' };
    case 'offline':
      return {
        label: 'Offline',
        detail: 'Switched off — customers can’t order',
        tone: 'neutral',
      };
    case 'outside_hours':
      return {
        label: 'Closed now',
        detail: 'Outside opening hours',
        tone: 'warning',
      };
    case 'not_active':
      return {
        label: lifecycleLabels[restaurant.status],
        detail: 'Hungerly must approve the restaurant before it can take orders',
        tone: 'error',
      };
  }
}

const roleLabels: Record<StaffRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
};

export function roleLabel(role: StaffRole): string {
  return roleLabels[role];
}
