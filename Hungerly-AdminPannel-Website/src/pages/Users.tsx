import { useInfiniteQuery } from '@tanstack/react-query';
import { Search, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';

import { RevealValue, useReveal } from '../components/Reveal';
import { Badge, Button, Empty, ErrorAlert, TableSkeleton, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { ago, initials, rupees, titleCase } from '../lib/format';
import { useOpenPanel, usePanels } from '../lib/panels';
import { can, useUser } from '../lib/session';
import type { Page, UserReveal, UserRow } from '../lib/types';

export function UsersPage() {
  const user = useUser();
  const openPanel = useOpenPanel();
  const { stack } = usePanels();
  const selected = stack[0]?.kind === 'customer' ? stack[0].id : null;
  const [role, setRole] = useState<'customer' | 'delivery_partner' | 'all'>('customer');
  const [q, setQ] = useState('');
  const query = q.trim().length >= 2 ? q.trim() : undefined;

  const list = useInfiniteQuery({
    queryKey: ['users', role, query],
    queryFn: ({ pageParam }) => api<Page<UserRow>>('/admin/users', { query: { role: role === 'all' ? undefined : role, q: query, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Customers</h2>
          <p className="page-sub">Search by name, full 10-digit phone or email. Contact details are masked — use the eye to view; every view is audited.</p>
        </div>
      </div>
      <section className="card">
        <div className="toolbar">
          <Tabs
            value={role}
            onChange={setRole}
            items={[
              { value: 'customer', label: 'Customers' },
              { value: 'delivery_partner', label: 'Riders' },
              { value: 'all', label: 'Everyone' },
            ]}
          />
          <label className="search">
            <Search size={16} />
            <input className="input" placeholder="Name, 10-digit phone or email" maxLength={60} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Contact</th>
                <th className="hide-sm">Status</th>
                <th className="right hide-sm">Orders</th>
                <th className="right hide-md">Spent</th>
                <th className="right hide-md">Last active</th>
              </tr>
            </thead>
            {list.isLoading ? (
              <TableSkeleton cols={6} />
            ) : (
              <tbody>
                {rows.map((u, i) => (
                  <tr
                    key={u.id}
                    className={selected === u.id ? 'selected' : ''}
                    style={{ animationDelay: `${Math.min(i, 10) * 18}ms` }}
                    onClick={() => openPanel({ kind: 'customer', id: u.id })}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && openPanel({ kind: 'customer', id: u.id })}
                  >
                    <td>
                      <div className="row" style={{ gap: 12 }}>
                        <div className="avatar sm">{initials(u.name)}</div>
                        <div>
                          <div className="cell-main">{u.name ?? 'No name yet'}</div>
                          <div className="row wrap" style={{ gap: 4, marginTop: 2 }}>
                            {u.roles.map((r) =>
                              r === 'admin' ? (
                                <Badge key={r} tone="tone-secondary" plain>
                                  <ShieldCheck size={11} /> Admin
                                </Badge>
                              ) : (
                                <span key={r} className="cell-sub">
                                  {titleCase(r)}
                                </span>
                              ),
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <ContactCell row={u} canReveal={can(user, 'reveal_contact') && (!u.roles.includes('admin') || can(user, 'super'))} />
                    </td>
                    <td className="hide-sm">
                      <Badge tone={u.status === 'active' ? 'tone-success' : 'tone-error'}>{titleCase(u.status)}</Badge>
                    </td>
                    <td className="right tabular hide-sm">{u.orders}</td>
                    <td className="right tabular hide-md">{u.total_spent.amount_minor ? rupees(u.total_spent) : <span className="subtle">—</span>}</td>
                    <td className="right hide-md">{ago(u.last_login_at)}</td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
          {!list.isLoading && rows.length === 0 && (
            <Empty icon={<Users size={22} />} title="No accounts found">
              Search needs at least 2 characters. Phone numbers are matched in full (10 digits).
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

function ContactCell({ row, canReveal }: { row: UserRow; canReveal: boolean }) {
  const r = useReveal<UserReveal>(`/admin/users/${row.id}/reveal`);
  return (
    <div className="contact-cell">
      <RevealValue masked={row.masked_phone} value={r.data?.phone_e164} revealed={!!r.data} busy={r.busy} onReveal={r.reveal} onHide={r.hide} canReveal={canReveal} />
      {row.masked_email && (
        <RevealValue masked={row.masked_email} value={r.data?.email} revealed={!!r.data} busy={r.busy} onReveal={r.reveal} onHide={r.hide} canReveal={false} />
      )}
    </div>
  );
}
