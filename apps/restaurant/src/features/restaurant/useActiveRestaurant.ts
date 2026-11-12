import { BranchDetailSchema, paths, type Branch } from '@hungerly/api-client';
import { useQuery, type QueryResult } from '@hungerly/app-core';

import { api } from '@/lib/api';

import { useActiveBranch } from '@/features/branch/useActiveBranch';

/** The active branch's full details, polled on focus. Used by screens needing prep time or status. */
export function useActiveRestaurant(): QueryResult<Branch> {
  const { branchId } = useActiveBranch();
  const key = branchId ? `branch:${branchId}` : 'idle';
  return useQuery(key, () =>
    branchId
      ? api
          .request('GET', paths.partner.branch(branchId), { schema: BranchDetailSchema })
          .then((d) => d.branch)
      : new Promise<Branch>(() => undefined),
  );
}
