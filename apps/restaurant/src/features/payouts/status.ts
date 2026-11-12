import type { PayoutAccountStatus, PayoutStatus } from '@hungerly/api-client';
import type { BadgeTone } from '@hungerly/ui';

export const payoutStatusMeta: Record<PayoutStatus, { label: string; tone: BadgeTone; description: string }> = {
  requested: { label: 'Requested', tone: 'info', description: 'Saved and reserved from your balance. Sending to the bank partner.' },
  queued: { label: 'Queued', tone: 'info', description: 'Accepted by the payout partner and waiting to be sent.' },
  pending_approval: { label: 'Awaiting approval', tone: 'info', description: 'Waiting for approval at the payout partner.' },
  processing: { label: 'Processing', tone: 'warning', description: 'On its way to your bank.' },
  processed: { label: 'Paid', tone: 'success', description: 'Sent to your bank account.' },
  failed: { label: 'Failed', tone: 'error', description: 'The transfer failed. The money was returned to your balance.' },
  reversed: { label: 'Reversed', tone: 'error', description: 'The bank returned the transfer. The money was returned to your balance.' },
  cancelled: { label: 'Cancelled', tone: 'neutral', description: 'Cancelled before sending. The money was returned to your balance.' },
  rejected: { label: 'Rejected', tone: 'error', description: 'Rejected by the payout partner. The money was returned to your balance.' },
};

/** Statuses where the reserved amount went back to the wallet. */
export function isReturnedToBalance(status: PayoutStatus): boolean {
  return status === 'failed' || status === 'reversed' || status === 'cancelled' || status === 'rejected';
}

export function isFinalPayout(status: PayoutStatus): boolean {
  return status === 'processed' || isReturnedToBalance(status);
}

/** Ordered steps for the detail timeline; the current one is highlighted. */
export const PAYOUT_STEPS: { key: 'requested' | 'sent' | 'processing' | 'done'; label: string }[] = [
  { key: 'requested', label: 'Requested' },
  { key: 'sent', label: 'Accepted by payout partner' },
  { key: 'processing', label: 'Processing at bank' },
  { key: 'done', label: 'Paid to your bank' },
];

export function payoutStepIndex(status: PayoutStatus): number {
  switch (status) {
    case 'requested':
      return 0;
    case 'queued':
    case 'pending_approval':
      return 1;
    case 'processing':
      return 2;
    case 'processed':
      return 3;
    default:
      return -1;
  }
}

export const payoutAccountStatusMeta: Record<PayoutAccountStatus, { label: string; tone: BadgeTone }> = {
  pending_verification: { label: 'Waiting for verification', tone: 'warning' },
  verification_in_progress: { label: 'Verifying with bank', tone: 'info' },
  verified: { label: 'Verified', tone: 'success' },
  failed: { label: 'Verification failed', tone: 'error' },
  disabled: { label: 'Disabled', tone: 'neutral' },
};

export const maskAccount = (last4: string): string => `•••• ${last4}`;
