import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Bike, Search } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { Badge, Button, Empty, ErrorAlert, PartnerBadge, TableSkeleton, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { ago, initials, VEHICLE } from '../lib/format';
import { useOpenPanel, usePanels } from '../lib/panels';
import type { Dashboard, Page, PartnerRow } from '../lib/types';

type Filter = 'pending_review' | 'online' | 'active' | 'onboarding' | 'suspended' | 'rejected' | 'all';

export function Riders() {
  const [params, setParams] = useSearchParams();
  const filter = (params.get('status') as Filter) || 'active';
  const [q, setQ] = useState('');
  const openPanel = useOpenPanel();
  const { stack } = usePanels();
  const selected = stack[0]?.kind === 'rider' ? stack[0].id : null;
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/admin/dashboard/live') });

  const list = useInfiniteQuery({
    queryKey: ['riders', filter, q],
    queryFn: ({ pageParam }) =>
      api<Page<PartnerRow>>('/admin/delivery-partners', {
        query: { status: filter === 'all' ? undefined : filter, q: q.trim().length >= 2 ? q.trim() : undefined, cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    refetchInterval: filter === 'online' || filter === 'pending_review' ? 10_000 : false,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Riders</h2>
          <p className="page-sub">Review applications and manage your delivery fleet. Click a rider for contact, documents and deliveries.</p>
        </div>
      </div>
      <section className="card">
        <div className="toolbar">
          <Tabs
            value={filter}
            onChange={(v) => setParams({ status: v })}
            items={[
              { value: 'active', label: 'Active' },
              { value: 'online', label: 'Online now', count: dash.data?.riders.online },
              { value: 'pending_review', label: 'Pending review', count: dash.data?.riders.pending_review },
              { value: 'onboarding', label: 'Onboarding' },
              { value: 'suspended', label: 'Suspended' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'all', label: 'All' },
            ]}
          />
          <label className="search">
            <Search size={16} />
            <input className="input" placeholder="Name or 10-digit phone" maxLength={60} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Rider</th>
                <th>Status</th>
                <th className="hide-sm">Vehicle</th>
                <th className="hide-md">Zone</th>
                <th className="hide-sm">Rating</th>
                <th className="right">{filter === 'pending_review' ? 'Applied' : 'Joined'}</th>
              </tr>
            </thead>
            {list.isLoading ? (
              <TableSkeleton cols={6} />
            ) : (
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.id}
                    className={selected === r.id ? 'selected' : ''}
                    style={{ animationDelay: `${Math.min(i, 10) * 18}ms` }}
                    onClick={() => openPanel({ kind: 'rider', id: r.id })}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && openPanel({ kind: 'rider', id: r.id })}
                  >
                    <td>
                      <div className="row" style={{ gap: 12 }}>
                        <div className="avatar sm">{initials(r.name)}</div>
                        <div>
                          <div className="cell-main">{r.name ?? 'Unnamed rider'}</div>
                          <div className="cell-sub mono">{r.masked_phone}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="row wrap">
                        <PartnerBadge status={r.status} />
                        {r.is_online && r.status === 'active' && (
                          <Badge tone="tone-success" plain>
                            Online
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="hide-sm">{r.vehicle_type ? VEHICLE[r.vehicle_type] : <span className="subtle">—</span>}</td>
                    <td className="hide-md">{r.zone ?? <span className="subtle">—</span>}</td>
                    <td className="tabular hide-sm">{r.rating ? `★ ${r.rating.toFixed(1)}` : <span className="subtle">New</span>}</td>
                    <td className="right">{ago(filter === 'pending_review' ? r.submitted_at : r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
          {!list.isLoading && rows.length === 0 && (
            <Empty icon={<Bike size={22} />} title={filter === 'pending_review' ? 'No applications waiting' : 'No riders here'}>
              {filter === 'pending_review' ? 'New rider applications from the partner app show up here.' : 'Try another filter.'}
            </Empty>
          )}
          <ErrorAlert error={list.error} />
        </div>
        {list.hasNextPage && (
          <div className="table-foot">
            <Button variant="ghost" size="sm" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
