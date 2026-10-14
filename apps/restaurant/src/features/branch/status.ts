import type { BadgeTone } from '@hungerly/ui';
import type { BranchStatus } from '@hungerly/api-client';

/** One wording for branch lifecycle states everywhere in the app. */
export const branchStatusMeta: Record<BranchStatus, { label: string; tone: BadgeTone; hint: string }> = {
  draft: { label: 'Setup in progress', tone: 'warning', hint: 'Finish setup and submit this branch for review.' },
  pending_review: { label: 'In review', tone: 'info', hint: 'Swaadone is reviewing your licence and details.' },
  active: { label: 'Approved', tone: 'success', hint: 'This branch can take orders when it is online and open.' },
  suspended: { label: 'Suspended', tone: 'error', hint: 'Orders are blocked. Contact Swaadone support.' },
  rejected: { label: 'Changes needed', tone: 'error', hint: 'Fix the review notes and submit again.' },
  closed: { label: 'Closed', tone: 'neutral', hint: 'This branch is permanently closed.' },
};
