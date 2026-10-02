import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Store } from 'lucide-react';
import { useState } from 'react';

import { Badge, Empty, ErrorAlert, Switch, TableSkeleton, Tabs, useToast } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { titleCase } from '../lib/format';
import { useOpenPanel } from '../lib/panels';
import { can, useUser } from '../lib/session';
import type { RestaurantRow } from '../lib/types';

type Filter = 'all' | 'active' | 'suspended' | 'pending_review';

export function Restaurants() {
  const qc = useQueryClient();
  const toast = useToast();
  const ops = can(useUser(), 'act_ops');
  const openPanel = useOpenPanel();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const query = q.trim().length >= 2 ? q.trim() : undefined;
  const { data, isLoading, error } = useQuery({
    queryKey: ['restaurants', filter, query],
    queryFn: () => api<RestaurantRow[]>('/admin/restaurants', { query: { status: filter === 'all' ? undefined : filter, q: query } }),
    refetchInterval: 20_000,
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/admin/restaurants/${id}`, { method: 'PATCH', body }),
    onMutate: async ({ id, body }) => {
      // Optimistic toggle: the switch responds instantly and rolls back on error.
      const key = ['restaurants', filter, query];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<RestaurantRow[]>(key);
      qc.setQueryData<RestaurantRow[]>(key, (rows) => rows?.map((r) => (r.id === id ? { ...r, ...body } : r)));
      return { prev, key };
    },
    onError: (err, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
      toast(err instanceof ApiError ? err.message : 'Update failed', 'error');
    },
    onSuccess: (_d, v) => toast(v.body.is_accepting_orders === false ? 'Restaurant paused' : 'Restaurant updated'),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['restaurants'] }),
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Restaurants</h2>
          <p className="page-sub">Pause kitchens that are overwhelmed and keep listings healthy. Click a restaurant for its menu and orders.</p>
        </div>
      </div>
      <section className="card">
        <div className="toolbar">
          <Tabs
            value={filter}
            onChange={setFilter}
            items={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'pending_review', label: 'Pending review' },
              { value: 'suspended', label: 'Suspended' },
            ]}
          />
          <label className="search">
            <Search size={16} />
            <input className="input" placeholder="Search restaurants" maxLength={60} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Restaurant</th>
                <th className="hide-sm">Status</th>
                <th className="hide-md">Rating</th>
                <th className="hide-sm">Live orders</th>
                <th className="hide-md">Commission</th>
                <th className="right">Accepting orders</th>
              </tr>
            </thead>
            {isLoading ? (
              <TableSkeleton cols={6} />
            ) : (
              <tbody>
                {data?.map((r, i) => (
                  <tr
                    key={r.id}
                    style={{ animationDelay: `${Math.min(i, 10) * 18}ms` }}
                    onClick={() => openPanel({ kind: 'restaurant', id: r.id })}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && openPanel({ kind: 'restaurant', id: r.id })}
                  >
                    <td>
                      <div className="row" style={{ gap: 12 }}>
                        {r.image_url ? <img className="thumb" src={r.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="thumb" />}
                        <div>
                          <div className="cell-main">{r.name}</div>
                          <div className="cell-sub">
                            {r.cuisines.slice(0, 3).join(' · ')} — {r.locality}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hide-sm">
                      <Badge tone={r.status === 'active' ? 'tone-success' : r.status === 'suspended' ? 'tone-error' : 'tone-accent'}>{titleCase(r.status)}</Badge>
                    </td>
                    <td className="tabular hide-md">★ {r.rating.toFixed(1)}</td>
                    <td className="tabular hide-sm">{r.live_orders || <span className="subtle">0</span>}</td>
                    <td className="tabular hide-md">{(r.commission_bps / 100).toFixed(1)}%</td>
                    <td className="right" onClick={(e) => e.stopPropagation()}>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 12 }}>
                        <span className="subtle">{r.is_accepting_orders ? 'Open' : 'Paused'}</span>
                        <Switch
                          label={`Accepting orders at ${r.name}`}
                          on={r.is_accepting_orders}
                          disabled={!ops || r.status !== 'active'}
                          onChange={(v) => patch.mutate({ id: r.id, body: { is_accepting_orders: v } })}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
          {!isLoading && data?.length === 0 && <Empty icon={<Store size={22} />} title="No restaurants match" />}
          <ErrorAlert error={error} />
        </div>
      </section>
    </>
  );
}
