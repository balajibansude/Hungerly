import { useSyncExternalStore } from 'react';

import { getUser, subscribe, type AdminUser } from './api';

export function useUser(): AdminUser | null {
  return useSyncExternalStore(subscribe, getUser);
}

export type Capability =
  | 'view_ops' // orders, riders, restaurants, customers (read)
  | 'act_ops' // accept/assign/cancel, approve riders, suspend accounts
  | 'reveal_contact' // unmask phone / email / address (audited)
  | 'view_finance'
  | 'super';

/** Mirrors the server's role checks so the UI only offers what will work. The server re-checks everything. */
const MATRIX: Record<NonNullable<AdminUser['admin_role']>, Capability[]> = {
  super_admin: ['view_ops', 'act_ops', 'reveal_contact', 'view_finance', 'super'],
  operations: ['view_ops', 'act_ops', 'reveal_contact'],
  support: ['view_ops', 'reveal_contact'],
  finance: ['view_finance'],
};

export function can(user: AdminUser | null, cap: Capability | 'operations' | 'super_admin' | 'finance'): boolean {
  if (!user?.admin_role) return false;
  const mapped: Capability = cap === 'operations' ? 'act_ops' : cap === 'super_admin' ? 'super' : cap === 'finance' ? 'view_finance' : cap;
  return MATRIX[user.admin_role].includes(mapped);
}
