import type { ProviderPayoutStatus } from './provider';

/**
 * Payout status machine. Our statuses follow RazorpayX's, except `requested` (saved and
 * money reserved, not yet accepted by the provider) and `pending_approval` (RazorpayX
 * `pending`: waiting in the merchant's approval workflow).
 *
 * Transitions are monotonic: a webhook or poll that arrives late can never move a payout
 * backwards (e.g. `processing` after `processed`). The only move out of a final state is
 * `processed → reversed` (the bank returned the money).
 */

export type PayoutStatus =
  | 'requested'
  | 'queued'
  | 'pending_approval'
  | 'processing'
  | 'processed'
  | 'failed'
  | 'reversed'
  | 'cancelled'
  | 'rejected';

export const FINAL_PAYOUT_STATUSES: readonly PayoutStatus[] = [
  'processed',
  'failed',
  'reversed',
  'cancelled',
  'rejected',
];

/** Statuses that return the reserved money to the wallet (a `payout_reversal` credit). */
export const REVERSING_PAYOUT_STATUSES: readonly PayoutStatus[] = [
  'failed',
  'reversed',
  'cancelled',
  'rejected',
];

const RANK: Record<PayoutStatus, number> = {
  requested: 0,
  queued: 1,
  pending_approval: 1,
  processing: 2,
  processed: 3,
  failed: 3,
  cancelled: 3,
  rejected: 3,
  reversed: 4,
};

export function isFinalPayoutStatus(status: PayoutStatus): boolean {
  return FINAL_PAYOUT_STATUSES.includes(status);
}

export function canMovePayout(from: PayoutStatus, to: PayoutStatus): boolean {
  if (from === to) return false;
  if (isFinalPayoutStatus(from)) return from === 'processed' && to === 'reversed';
  return RANK[to] >= RANK[from];
}

export function fromProviderStatus(status: ProviderPayoutStatus): PayoutStatus {
  return status === 'pending' ? 'pending_approval' : status;
}
