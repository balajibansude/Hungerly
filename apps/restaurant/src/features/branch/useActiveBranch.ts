import type { BranchSummary } from '@hungerly/api-client';

import { activeBranch, useSessionStore } from '@/features/auth/session';

/**
 * The branch every workspace screen works on. Screens must pass `branchId` to the API;
 * the server re-checks that the signed-in owner owns it, so switching branches can never
 * show another owner's data.
 */
export function useActiveBranch(): { branch: BranchSummary | null; branchId: string | null } {
  const branch = useSessionStore((s) => activeBranch(s.session, s.activeBranchId));
  return { branch, branchId: branch?.id ?? null };
}
