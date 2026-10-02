import { useQuery } from '@tanstack/react-query';

import { api } from './api';
import { isoDate } from './format';
import { useSession } from './session';
import type { Assignment, Earnings, Partner } from './types';

export const keys = {
  me: ['me'] as const,
  current: ['assignment', 'current'] as const,
  offers: ['offers'] as const,
  today: ['earnings', 'today'] as const,
  earnings: (from: string, to: string) => ['earnings', from, to] as const,
  history: ['history'] as const,
};

/** The rider's active delivery (null when free). Polled so admin reassignments show up quickly. */
export function useCurrentAssignment(enabled = true) {
  return useQuery({
    queryKey: keys.current,
    queryFn: () => api<Assignment | null>('/delivery/assignments/current'),
    enabled,
    refetchInterval: 6_000,
  });
}

/** Open offers. Polled every 4 s while online and free (push notifications will replace polling later). */
export function useOffers(enabled: boolean) {
  return useQuery({
    queryKey: keys.offers,
    queryFn: () => api<Assignment[]>('/delivery/offers'),
    enabled,
    refetchInterval: enabled ? 4_000 : false,
    refetchIntervalInBackground: false,
  });
}

/**
 * The rider's server-side profile. Polled so the app notices when the server switched the rider offline
 * (e.g. GPS went silent) or an admin suspended them, instead of trusting a stale local switch.
 */
export function useMe() {
  const setPartner = useSession((s) => s.setPartner);
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      const p = await api<Partner>('/delivery/me');
      setPartner(p);
      return p;
    },
    refetchInterval: 45_000,
  });
}

export function useToday() {
  const today = isoDate(new Date());
  return useQuery({
    queryKey: keys.today,
    queryFn: () => api<Earnings>('/delivery/earnings', { query: { from: today, to: today } }),
    refetchInterval: 60_000,
  });
}

export function useEarnings(from: string, to: string) {
  return useQuery({ queryKey: keys.earnings(from, to), queryFn: () => api<Earnings>('/delivery/earnings', { query: { from, to } }) });
}
