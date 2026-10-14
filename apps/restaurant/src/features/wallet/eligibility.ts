import type { Href } from 'expo-router';

export type BlockerCode =
  | 'provider_unconfigured'
  | 'branch_not_active'
  | 'no_payout_account'
  | 'payout_account_unverified'
  | 'below_minimum';

/**
 * The next step for each reason a withdrawal is blocked. The reason text itself comes from
 * the server; this only adds where the owner can fix it (or null when only Swaadone can).
 */
export function blockerAction(code: BlockerCode, branchId: string | null): { label: string; href: Href } | null {
  switch (code) {
    case 'no_payout_account':
      return { label: 'Add bank account', href: '/wallet/payout-account' };
    case 'payout_account_unverified':
      return { label: 'Check verification', href: '/wallet/payout-account' };
    case 'branch_not_active':
      return branchId ? { label: 'View branch status', href: { pathname: '/branches/[id]', params: { id: branchId } } } : null;
    case 'below_minimum':
    case 'provider_unconfigured':
      return null;
  }
}
