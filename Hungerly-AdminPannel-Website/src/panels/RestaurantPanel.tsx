import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, MapPin, Phone } from 'lucide-react';
import { useState } from 'react';

import { Badge, Drawer, ErrorAlert, FoodMark, OrderBadge, Skeleton, Switch, useToast } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { ago, rupees, titleCase } from '../lib/format';
import { usePanels } from '../lib/panels';
import { can, useUser } from '../lib/session';
import type { RestaurantDetail } from '../lib/types';
import { MiniStat } from './CustomerPanel';
import type { PanelNav } from './PanelHost';

export function RestaurantPanel({ id, onClose, onBack }: { id: string } & PanelNav) {
  const qc = useQueryClient();
  const toast = useToast();
  const user = useUser();
  const { open } = usePanels();
  const [tab, setTab] = useState<'menu' | 'orders'>('menu');
  const { data: r, error } = useQuery({ queryKey: ['restaurant', id], queryFn: () => api<RestaurantDetail>(`/admin/restaurants/${id}`), refetchInterval: 20_000 });

  const toggle = useMutation({
    mutationFn: (v: boolean) => api(`/admin/restaurants/${id}`, { method: 'PATCH', body: { is_accepting_orders: v } }),
    onSuccess: (_, v) => {
      toast(v ? 'Restaurant is taking orders' : 'Restaurant paused');
      void qc.invalidateQueries({ queryKey: ['restaurant', id] });
      void qc.invalidateQueries({ queryKey: ['restaurants'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  const items = r?.menu.flatMap((c) => c.items) ?? [];
  const soldOut = items.filter((i) => !i.is_available).length;

  return (
    <Drawer
      onClose={onClose}
      onBack={onBack}
      wide
      header={
        r ? (
          <div className="row" style={{ gap: 14 }}>
            {r.image_url ? <img className="thumb lg" src={r.image_url} alt="" referrerPolicy="no-referrer" /> : <div className="thumb lg" />}
            <div style={{ minWidth: 0 }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <h2 className="drawer-title">{r.name}</h2>
                <Badge tone={r.status === 'active' ? 'tone-success' : 'tone-error'}>{titleCase(r.status)}</Badge>
                {r.is_pure_veg && <Badge tone="tone-success" plain>Pure veg</Badge>}
              </div>
              <p className="muted">{r.cuisines.join(' · ')} · ★ {r.rating.average.toFixed(1)} ({r.rating.count.toLocaleString('en-IN')})</p>
            </div>
          </div>
        ) : (
          <Skeleton h={56} w={300} />
        )
      }
    >
      <ErrorAlert error={error} />
      {r && (
        <>
          <div className="section row between">
            <div>
              <strong>{r.is_accepting_orders ? 'Taking orders' : 'Paused'}</strong>
              <div className="subtle">Pause when the kitchen is overwhelmed or closed. Customers see it as closed.</div>
            </div>
            <Switch label="Accepting orders" on={r.is_accepting_orders} disabled={!can(user, 'act_ops') || r.status !== 'active' || toggle.isPending} onChange={(v) => toggle.mutate(v)} />
          </div>

          <div className="mini-stats four">
            <MiniStat label="Orders today" value={String(r.stats.orders_today)} />
            <MiniStat label="Revenue today" value={rupees(r.stats.gmv_today)} />
            <MiniStat label="Live now" value={String(r.stats.live_orders)} />
            <MiniStat label="All time" value={String(r.stats.orders_all_time)} sub={`${r.stats.rejected_by_restaurant} rejected`} />
          </div>

          <div className="section">
            <div className="section-title">Details</div>
            <dl className="kv">
              <dt>Address</dt>
              <dd>
                {r.address}{' '}
                <a className="inline-link" href={`https://www.google.com/maps/search/?api=1&query=${r.location.lat},${r.location.lng}`} target="_blank" rel="noreferrer noopener">
                  <MapPin size={12} /> Map <ExternalLink size={11} />
                </a>
              </dd>
              <dt>Phone</dt>
              <dd>
                <a className="inline-link" href={`tel:${r.phone_e164}`}>
                  <Phone size={12} /> <span className="mono">{r.phone_e164}</span>
                </a>
              </dd>
              <dt>Prep time</dt>
              <dd>~{r.avg_prep_minutes} min</dd>
              <dt>Minimum order</dt>
              <dd>{rupees(r.min_order)} · packaging {rupees(r.packaging_fee)}</dd>
              <dt>Commission</dt>
              <dd>{(r.commission_bps / 100).toFixed(1)}%</dd>
            </dl>
          </div>

          <div className="tabs">
            <button className={`tab${tab === 'menu' ? ' active' : ''}`} onClick={() => setTab('menu')}>
              Menu ({items.length}){soldOut ? ` · ${soldOut} sold out` : ''}
            </button>
            <button className={`tab${tab === 'orders' ? ' active' : ''}`} onClick={() => setTab('orders')}>Recent orders</button>
          </div>

          {tab === 'menu' &&
            r.menu.map((c) => (
              <div key={c.id} className="section">
                <div className="section-title">{c.name}</div>
                {c.items.map((i) => (
                  <div key={i.id} className="line-item" style={{ opacity: i.is_available ? 1 : 0.5 }}>
                    <FoodMark type={i.food_type} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600 }}>{i.name}</span>{' '}
                      {i.is_bestseller && <Badge tone="tone-accent" plain>Bestseller</Badge>}{' '}
                      {!i.is_available && <Badge tone="tone-neutral" plain>Sold out</Badge>}
                    </div>
                    <span className="tabular" style={{ fontWeight: 600 }}>{rupees(i.price)}</span>
                  </div>
                ))}
              </div>
            ))}

          {tab === 'orders' && (
            <div className="stack" style={{ gap: 4 }}>
              {r.recent_orders.length === 0 && <p className="muted">No orders yet.</p>}
              {r.recent_orders.map((o) => (
                <button key={o.id} className="list-row" onClick={() => open({ kind: 'order', id: o.id })}>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div className="cell-main mono">{o.order_number}</div>
                    <div className="cell-sub">{ago(o.placed_at)}</div>
                  </div>
                  <OrderBadge status={o.status} />
                  <span className="tabular" style={{ minWidth: 80, textAlign: 'right', fontWeight: 700 }}>{rupees(o.total)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}
