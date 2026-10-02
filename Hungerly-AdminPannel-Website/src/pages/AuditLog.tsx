import { useInfiniteQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { useState } from 'react';

import { Badge, Button, Empty, ErrorAlert, TableSkeleton, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { dateTime, titleCase } from '../lib/format';
import type { AuditRow, Page } from '../lib/types';

type Filter = '' | 'auth' | 'order' | 'delivery_partner' | 'user' | 'admin' | 'restaurant';

function tone(action: string): string {
  if (action.includes('failed') || action.includes('reuse') || action.includes('suspend') || action.includes('cancel') || action.includes('reject')) return 'tone-error';
  if (action.startsWith('auth.')) return 'tone-info';
  if (action.includes('approve') || action.includes('reinstate')) return 'tone-success';
  return 'tone-neutral';
}

export function AuditLog() {
  const [action, setAction] = useState<Filter>('');
  const list = useInfiniteQuery({
    queryKey: ['audit', action],
    queryFn: ({ pageParam }) => api<Page<AuditRow>>('/admin/audit-logs', { query: { action: action || undefined, cursor: pageParam, limit: 50 } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    refetchInterval: 30_000,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Audit log</h2>
          <p className="page-sub">Append-only record of sign-ins and every administrative action. Entries cannot be edited or deleted.</p>
        </div>
      </div>
      <section className="card">
        <div className="toolbar">
          <Tabs
            value={action}
            onChange={setAction}
            items={[
              { value: '', label: 'Everything' },
              { value: 'auth', label: 'Sign-ins' },
              { value: 'order', label: 'Orders' },
              { value: 'delivery_partner', label: 'Riders' },
              { value: 'user', label: 'Accounts' },
              { value: 'admin', label: 'Team' },
              { value: 'restaurant', label: 'Restaurants' },
            ]}
          />
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Details</th>
                <th>IP</th>
              </tr>
            </thead>
            {list.isLoading ? (
              <TableSkeleton cols={5} />
            ) : (
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} style={{ cursor: 'default' }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{dateTime(a.created_at)}</td>
                    <td>
                      <Badge tone={tone(a.action)} plain>
                        {a.action}
                      </Badge>
                    </td>
                    <td>
                      <div className="cell-main">{a.actor}</div>
                      {a.actor_role && <div className="cell-sub">{titleCase(a.actor_role)}</div>}
                    </td>
                    <td>
                      <div className="cell-sub">
                        {a.entity_type}
                        {a.entity_id ? ` · ${a.entity_id.slice(0, 8)}` : ''}
                      </div>
                      {a.changes && <pre className="json">{JSON.stringify(a.changes)}</pre>}
                    </td>
                    <td className="mono">{a.ip_address ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
          {!list.isLoading && rows.length === 0 && <Empty icon={<ScrollText size={22} />} title="Nothing logged yet" />}
          <ErrorAlert error={list.error} />
        </div>
        {list.hasNextPage && (
          <div className="table-foot">
            <Button variant="ghost" size="sm" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              Load older entries
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
