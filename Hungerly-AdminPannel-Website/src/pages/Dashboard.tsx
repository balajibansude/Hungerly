import { useQuery } from '@tanstack/react-query';
import { AlarmClock, ArrowDownRight, ArrowUpRight, Bike, CircleAlert, ClipboardList, IndianRupee, PackageCheck, Store, UserCheck } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';

import { Empty, OrderBadge, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { ago, rupees, shortDate, VEHICLE } from '../lib/format';
import { useOpenPanel } from '../lib/panels';
import { can, useUser } from '../lib/session';
import type { Dashboard as D, DayPoint, LiveRider, OrderRow, Page } from '../lib/types';

const PIPELINE = [
  { key: 'placed', label: 'New', color: 'var(--info)' },
  { key: 'preparing', label: 'Preparing', color: 'var(--accent)' },
  { key: 'ready_for_pickup', label: 'Ready', color: 'var(--primary)' },
  { key: 'picked_up', label: 'On the way', color: 'var(--secondary-muted)' },
] as const;

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function trend(now: number, before: number): { pct: number; up: boolean } | null {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return { pct: Math.abs(pct), up: pct >= 0 };
}

export function Dashboard() {
  const user = useUser();
  const nav = useNavigate();
  const openPanel = useOpenPanel();
  const ops = can(user, 'view_ops');
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api<D>('/admin/dashboard/live'), refetchInterval: 10_000 });
  const series = useQuery({ queryKey: ['timeseries'], queryFn: () => api<DayPoint[]>('/admin/dashboard/timeseries', { query: { days: 14 } }), refetchInterval: 60_000 });
  const riders = useQuery({ queryKey: ['live-riders'], queryFn: () => api<LiveRider[]>('/admin/riders/live'), refetchInterval: 15_000, enabled: ops });
  const live = useQuery({
    queryKey: ['orders', 'live-feed'],
    queryFn: () => api<Page<OrderRow>>('/admin/orders', { query: { status: 'live', limit: 6 } }),
    refetchInterval: 10_000,
    enabled: ops,
  });

  const d = dash.data;
  const liveTotal = d ? Object.values(d.live_orders).reduce((a, b) => a + b, 0) : 0;
  const ordersTrend = d ? trend(d.today.orders, d.yesterday.orders) : null;
  const gmvTrend = d ? trend(d.today.gmv.amount_minor, d.yesterday.gmv.amount_minor) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">
            {greeting()}, {user?.full_name?.split(' ')[0] ?? 'there'}
          </h2>
          <p className="page-sub">Here's what's happening across Hungerly right now.</p>
        </div>
        <span className="live-dot">Updates every 10 s</span>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <Stat label="Orders today" value={d?.today.orders} icon={<ClipboardList size={18} />} tone="tone-info" trend={ordersTrend} foot={d ? `${liveTotal} in progress` : undefined} />
        <Stat label="Delivered today" value={d?.today.delivered} icon={<PackageCheck size={18} />} tone="tone-success" foot={d ? `${d.today.cancelled} cancelled` : undefined} />
        <Stat label="Revenue today" value={d ? rupees(d.today.gmv) : undefined} icon={<IndianRupee size={18} />} tone="tone-primary" trend={gmvTrend} foot="Delivered orders (GMV)" />
        <Stat
          label="Riders online"
          value={d?.riders.online}
          icon={<Bike size={18} />}
          tone="tone-accent"
          foot={d ? `${d.riders.on_delivery} delivering · ${d.riders.idle} free${d.riders.stale ? ` · ${d.riders.stale} silent` : ''}` : undefined}
        />
      </div>

      <div className="grid grid-main">
        <div className="stack" style={{ gap: 20 }}>
          <section className="card">
            <div className="card-head">
              <h3 className="card-title">Live order pipeline</h3>
              {ops && (
                <button className="btn btn-sm btn-ghost" onClick={() => nav('/orders')}>
                  View all orders
                </button>
              )}
            </div>
            <div className="pipeline">
              {PIPELINE.map((p) => {
                const n = d?.live_orders[p.key] ?? 0;
                return (
                  <button key={p.key} className="pipe" onClick={() => ops && nav(`/orders?status=${p.key}`)}>
                    <div className="pipe-label">
                      <span className="dot" style={{ background: p.color }} />
                      {p.label}
                    </div>
                    <div className="pipe-num">{d ? n : <Skeleton h={34} w={40} />}</div>
                    <div className="pipe-bar">
                      <span style={{ width: liveTotal ? `${(n / liveTotal) * 100}%` : '0%', background: p.color }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <TrendChart points={series.data} />

          {ops && (
            <section className="card">
              <div className="card-head">
                <h3 className="card-title">Live orders</h3>
                <span className="subtle">Click to open</span>
              </div>
              <div className="feed">
                {live.data?.items.length === 0 && <Empty icon={<ClipboardList size={22} />} title="Nothing in progress">New orders appear here instantly.</Empty>}
                {!live.data && <Skeleton h={120} r={12} />}
                {live.data?.items.map((o) => (
                  <button key={o.id} className="feed-row" onClick={() => openPanel({ kind: 'order', id: o.id })}>
                    <div className="feed-main">
                      <span className="mono cell-main">{o.order_number}</span>
                      <span className="cell-sub">
                        {o.restaurant_name} → {o.locality} · {ago(o.placed_at)}
                      </span>
                    </div>
                    {o.is_delayed && <span className="badge tone-error plain">Late</span>}
                    <OrderBadge status={o.status} />
                    <span className="tabular feed-amount">{rupees(o.total)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="stack" style={{ gap: 20 }}>
          {ops && (
            <section className="card">
              <div className="card-head">
                <h3 className="card-title">Needs attention</h3>
              </div>
              <div className="attention">
                <Attention icon={<AlarmClock size={16} />} tone="tone-info" label="Waiting for restaurant > 5 min" n={d?.needs_attention.awaiting_acceptance} onClick={() => nav('/orders?status=placed')} />
                <Attention icon={<Bike size={16} />} tone="tone-accent" label="No rider assigned yet" n={d?.needs_attention.unassigned} onClick={() => nav('/orders?status=preparing')} />
                <Attention icon={<CircleAlert size={16} />} tone="tone-error" label="Running late" n={d?.needs_attention.delayed} onClick={() => nav('/orders?status=live')} />
                <Attention icon={<UserCheck size={16} />} tone="tone-primary" label="Riders awaiting approval" n={d?.riders.pending_review} onClick={() => nav('/riders?status=pending_review')} />
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-head">
              <h3 className="card-title">Top restaurants today</h3>
            </div>
            <div className="attention">
              {d?.top_restaurants.length === 0 && <Empty icon={<Store size={22} />} title="No orders yet today" />}
              {d?.top_restaurants.map((r, i) => (
                <button key={r.id} className="attention-row" onClick={() => ops && openPanel({ kind: 'restaurant', id: r.id })}>
                  <span className="rank">{i + 1}</span>
                  <span style={{ fontWeight: 600, flex: 1 }}>{r.name}</span>
                  <span className="cell-sub">
                    {r.orders} {r.orders === 1 ? 'order' : 'orders'}
                  </span>
                  <span className="tabular" style={{ fontWeight: 700, minWidth: 72, textAlign: 'right' }}>{rupees(r.gmv)}</span>
                </button>
              ))}
            </div>
          </section>

          {ops && (
            <section className="card">
              <div className="card-head">
                <h3 className="card-title">Rider fleet</h3>
                <span className="subtle">{riders.data?.filter((r) => r.reachable).length ?? 0} reachable</span>
              </div>
              <div className="attention">
                {riders.data?.length === 0 && (
                  <Empty icon={<Bike size={22} />} title="No riders online">
                    Riders appear here as soon as they go online in the partner app.
                  </Empty>
                )}
                {riders.data?.slice(0, 8).map((r) => (
                  <button key={r.id} className="attention-row" onClick={() => openPanel({ kind: 'rider', id: r.id })}>
                    <div className="avatar sm">{r.name?.[0] ?? '?'}</div>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div className="cell-main">{r.name}</div>
                      <div className="cell-sub">{r.vehicle_type ? VEHICLE[r.vehicle_type] : 'Vehicle not set'}</div>
                    </div>
                    <span className={`badge ${!r.reachable ? 'tone-neutral' : r.assignment_status ? 'tone-accent' : 'tone-success'}`}>
                      {!r.reachable ? 'GPS silent' : r.assignment_status ? 'On delivery' : 'Available'}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
  foot,
  trend: t,
}: {
  label: string;
  value: number | string | undefined;
  icon: ReactNode;
  tone: string;
  foot?: string;
  trend?: { pct: number; up: boolean } | null;
}) {
  return (
    <div className="card stat">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className={`stat-icon ${tone}`}>{icon}</span>
      </div>
      <div className="stat-value">{value ?? <Skeleton h={34} w={90} />}</div>
      <div className="stat-foot">
        {t && (
          <span className={`trend ${t.up ? 'up' : 'down'}`}>
            {t.up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {t.pct}%
          </span>
        )}
        <span>{foot ?? ' '}</span>
        {t && <span className="subtle"> vs yesterday</span>}
      </div>
    </div>
  );
}

function Attention({ icon, tone, label, n, onClick }: { icon: ReactNode; tone: string; label: string; n: number | undefined; onClick: () => void }) {
  return (
    <button className={`attention-row${n ? ' hot' : ''}`} onClick={onClick}>
      <span className={`stat-icon ${tone}`} style={{ width: 32, height: 32, borderRadius: 10 }}>
        {icon}
      </span>
      <span style={{ fontWeight: 600, flex: 1, textAlign: 'left' }}>{label}</span>
      <span className="num" style={{ color: n ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
        {n ?? '–'}
      </span>
    </button>
  );
}

function TrendChart({ points }: { points: DayPoint[] | undefined }) {
  const [metric, setMetric] = useState<'orders' | 'gmv'>('orders');
  const [hover, setHover] = useState<number | null>(null);
  const days = useMemo(() => {
    const byDate = new Map((points ?? []).map((p) => [p.date, p]));
    const out: DayPoint[] = [];
    for (let i = 13; i >= 0; i--) {
      const dt = new Date(Date.now() - i * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      out.push(byDate.get(dt) ?? { date: dt, orders: 0, gmv: { amount_minor: 0, currency: 'INR' } });
    }
    return out;
  }, [points]);
  const values = days.map((p) => (metric === 'orders' ? p.orders : p.gmv.amount_minor));
  const max = Math.max(1, ...values);
  const W = 640;
  const H = 180;
  const pad = 8;
  const x = (i: number) => pad + (i * (W - pad * 2)) / (days.length - 1);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(days.length - 1)},${H} L${x(0)},${H} Z`;
  const total = values.reduce((a, b) => a + b, 0);
  const h = hover !== null ? days[hover] : null;

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h3 className="card-title">Last 14 days</h3>
          <div className="subtle">{metric === 'orders' ? `${total} orders` : `${rupees(total)} delivered GMV`}</div>
        </div>
        <div className="tabs">
          <button className={`tab${metric === 'orders' ? ' active' : ''}`} onClick={() => setMetric('orders')}>Orders</button>
          <button className={`tab${metric === 'gmv' ? ' active' : ''}`} onClick={() => setMetric('gmv')}>Revenue</button>
        </div>
      </div>
      {!points ? (
        <div style={{ padding: 24 }}><Skeleton h={180} /></div>
      ) : (
        <div className="chart-wrap" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="chart" role="img" aria-label="Orders over the last 14 days">
            <defs>
              <linearGradient id="fillGrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#C2410C" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#C2410C" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} x1={0} x2={W} y1={H * g} y2={H * g} className="gridline" />
            ))}
            <path d={area} fill="url(#fillGrad)" />
            <path d={line} className="chart-line" />
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} className="hoverline" />}
            {values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 3} className={`chart-dot${hover === i ? ' on' : ''}`} />
            ))}
            {days.map((_, i) => (
              <rect key={i} x={x(i) - (W / days.length) / 2} y={0} width={W / days.length} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
            ))}
          </svg>
          {h && (
            <div className="chart-tip" style={{ left: `${(x(hover!) / W) * 100}%` }}>
              <strong>{shortDate(h.date)}</strong>
              <span>{h.orders} orders · {rupees(h.gmv)}</span>
            </div>
          )}
          <div className="chart-axis">
            {days.map((p, i) => (
              <span key={p.date}>{i % 2 === 1 || i === days.length - 1 ? shortDate(p.date) : ''}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
