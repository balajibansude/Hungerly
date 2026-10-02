import { useInfiniteQuery } from '@tanstack/react-query';
import { ClipboardList, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

import { Badge, Button, Empty, ErrorAlert, OrderBadge, TableSkeleton, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { ago, rupees, time } from '../lib/format';
import { useOpenPanel, usePanels } from '../lib/panels';
import type { OrderRow, Page } from '../lib/types';

type Filter = 'live' | 'placed' | 'preparing' | 'ready_for_pickup' | 'picked_up' | 'delivered' | 'cancelled' | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'placed', label: 'New' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready_for_pickup', label: 'Ready' },
  { value: 'picked_up', label: 'On the way' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

export function Orders() {
  const [params, setParams] = useSearchParams();
  const filter = (params.get('status') as Filter) || 'live';
  const [q, setQ] = useState('');
  const openPanel = useOpenPanel();
  const { stack } = usePanels();
  const selected = stack[0]?.kind === 'order' ? stack[0].id : null;

  // Deep link: /orders?order=<id> opens that order.
  useEffect(() => {
    const id = params.get('order');
    if (id) openPanel({ kind: 'order', id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = useInfiniteQuery({
    queryKey: ['orders', filter, q],
    queryFn: ({ pageParam }) =>
      api<Page<OrderRow>>('/admin/orders', {
        query: { status: filter === 'all' ? undefined : filter, q: q.trim() || undefined, cursor: pageParam, limit: 25 },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    refetchInterval: ['live', 'placed', 'preparing', 'ready_for_pickup', 'picked_up'].includes(filter) ? 10_000 : false,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Orders</h2>
          <p className="page-sub">Accept on behalf of restaurants, dispatch riders and resolve issues. Click any order for full details.</p>
        </div>
      </div>

      <section className="card">
        <div className="toolbar">
          <Tabs value={filter} onChange={(v) => setParams(v === 'live' ? {} : { status: v })} items={FILTERS} />
          <label className="search">
            <Search size={16} />
            <input
              className="input"
              placeholder="Search order number"
              value={q}
              maxLength={20}
              onChange={(e) => setQ(e.target.value.replace(/[^A-Za-z0-9-]/g, ''))}
            />
          </label>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Restaurant</th>
                <th className="hide-md">Customer</th>
                <th>Status</th>
                <th className="hide-md">Rider</th>
                <th className="right">Total</th>
                <th className="right hide-sm">Placed</th>
              </tr>
            </thead>
            {list.isLoading ? (
              <TableSkeleton cols={7} />
            ) : (
              <tbody>
                {rows.map((o, i) => (
                  <tr
                    key={o.id}
                    className={selected === o.id ? 'selected' : ''}
                    style={{ animationDelay: `${Math.min(i, 10) * 18}ms` }}
                    onClick={() => openPanel({ kind: 'order', id: o.id })}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && openPanel({ kind: 'order', id: o.id })}
                  >
                    <td>
                      <div className="cell-main mono">{o.order_number}</div>
                      <div className="cell-sub">
                        {o.item_count} items · {o.locality}
                      </div>
                    </td>
                    <td className="cell-main">{o.restaurant_name}</td>
                    <td className="hide-md">{o.customer_name}</td>
                    <td>
                      <div className="row wrap">
                        <OrderBadge status={o.status} />
                        {o.is_delayed && (
                          <Badge tone="tone-error" plain>
                            Late
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="hide-md">{o.rider_name ?? <span className="subtle">—</span>}</td>
                    <td className="right tabular">
                      <div className="cell-main">{rupees(o.total)}</div>
                      <div className="cell-sub">{o.payment_method === 'cod' ? 'Cash' : 'Online'}</div>
                    </td>
                    <td className="right hide-sm">
                      <div>{time(o.placed_at)}</div>
                      <div className="cell-sub">{ago(o.placed_at)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
          {!list.isLoading && rows.length === 0 && (
            <Empty icon={<ClipboardList size={22} />} title="No orders here">
              {filter === 'live' ? 'New orders will appear the moment customers place them.' : 'Try another filter.'}
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
