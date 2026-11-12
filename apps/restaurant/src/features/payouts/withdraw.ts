import type { ApiError } from '@hungerly/api-client';
import { formatMoney } from '@hungerly/utils';

import { rupeesToPaise } from '@/features/wallet/format';

export type AmountCheck = { ok: true; amountMinor: number } | { ok: false; message: string };

/**
 * Client-side check of a withdrawal amount, for instant feedback only. The server checks
 * the same rules again (and the balance at that moment) before reserving any money.
 */
export function checkWithdrawAmount(input: string, limits: { availableMinor: number; minimumMinor: number }): AmountCheck {
  if (input.trim() === '') return { ok: false, message: 'Enter an amount.' };
  const amountMinor = rupeesToPaise(input);
  if (amountMinor === null) return { ok: false, message: 'Enter an amount in rupees, like 1500 or 1500.50.' };
  if (amountMinor < limits.minimumMinor) {
    return { ok: false, message: `The minimum withdrawal is ${formatMoney({ amountMinor: limits.minimumMinor, currency: 'INR' })}.` };
  }
  if (amountMinor > limits.availableMinor) {
    return { ok: false, message: `You can withdraw up to ${formatMoney({ amountMinor: limits.availableMinor, currency: 'INR' })}.` };
  }
  return { ok: true, amountMinor };
}

/** Owner-facing message for a failed withdrawal request. */
export function withdrawErrorMessage(error: Pick<ApiError, 'code' | 'message'>): string {
  switch (error.code) {
    case 'payout.provider_unconfigured':
      return 'Withdrawals are not available yet: the payout partner is not configured on the server.';
    case 'payout.account_unverified':
      return 'Your bank account is not verified yet. Withdrawals open once it is verified.';
    case 'payout.below_minimum':
      return error.message || 'This is below the minimum withdrawal.';
    case 'payout.insufficient_balance':
      return 'Your available balance changed and is now lower than this amount. Refresh and try again.';
    case 'payout.not_eligible':
      return error.message || 'This branch cannot withdraw right now.';
    case 'payout.provider_error':
      return 'The payout partner could not take the request. Nothing was sent; try again shortly.';
    case 'idempotency_conflict':
      return 'This withdrawal was already submitted with a different amount. Start a new withdrawal.';
    case 'network':
      return 'No connection. Your request may not have reached us; tap Withdraw again to retry safely.';
    default:
      return error.message || 'The withdrawal could not be requested. Please try again.';
  }
}
