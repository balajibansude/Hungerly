import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, ChefHat, ChevronRight, ExternalLink, MapPin, PackageCheck, Store, User, XCircle } from 'lucide-react';
import { useState } from 'react';

import { RevealValue, useReveal } from '../components/Reveal';
import { Badge, Button, Drawer, Empty, ErrorAlert, FoodMark, Modal, OrderBadge, Skeleton, useToast } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { ago, dateTime, km, ORDER_STATUS, rupees, time, titleCase, VEHICLE } from '../lib/format';
import { usePanels } from '../lib/panels';
import { can, useUser } from '../lib/session';
import type { AvailableRider, OrderDetail, OrderReveal } from '../lib/types';
import type { PanelNav } from './PanelHost';

const ACTIVE = ['accepted', 'arrived_at_restaurant', 'picked_up', 'arrived_at_customer', 'offered'];

export function OrderPanel({ id, onClose, onBack }: { id: string } & PanelNav) {
  const qc = useQueryClient();
  const toast = useToast();
  const user = useUser();
  const { open } = usePanels();
  const ops = can(user, 'act_ops');
  const [modal, setModal] = useState<'accept' | 'assign' | 'cancel' | null>(null);
  const { data: o, error } = useQuery({ queryKey: ['order', id], queryFn: () => api<OrderDetail>(`/admin/orders/${id}`), refetchInterval: 8_000 });
  const contact = useReveal<OrderReveal>(`/admin/orders/${id}/reveal`);

  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      api<OrderDetail>(`/admin/orders/${id}/${path}`, { method: 'POST', body, ifMatch: o?.version }),
    onSuccess: (data, vars) => {
      qc.setQueryData(['order', id], data);
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      setModal(null);
      toast({ accept: 'Order accepted — finding a rider', ready: 'Marked ready for pickup', cancel: 'Order cancelled', assign: 'Rider assigned' }[vars.path] ?? 'Updated');
    },
    onError: (err) => {
      toast(err instanceof ApiError ? err.message : 'Action failed', 'error');
      void qc.invalidateQueries({ queryKey: ['order', id] });
    },
  });

  const active = o?.assignments.find((a) => ACTIVE.includes(a.status));
  const canAssign = ops && o && ['placed', 'preparing', 'ready_for_pickup'].includes(o.status) && (!active || ['accepted', 'offered'].includes(active.status));
  const mapUrl = o ? `https://www.google.com/maps/search/?api=1&query=${o.delivery_location.lat},${o.delivery_location.lng}` : '#';

  return (
    <Drawer
      onClose={onClose}
      onBack={onBack}
      header={
        o ? (
          <>
            <div className="row" style={{ gap: 10 }}>
              <h2 className="drawer-title mono">{o.order_number}</h2>
              <OrderBadge status={o.status} />
            </div>
            <p className="muted" style={{ marginTop: 4 }}>
              Placed {dateTime(o.placed_at)} · {o.payment_method === 'cod' ? 'Cash on delivery' : 'Online'} · {titleCase(o.payment_status)}
            </p>
          </>
        ) : (
          <Skeleton h={44} w={260} />
        )
      }
      footer={
        o && ops && !['delivered', 'cancelled'].includes(o.status) ? (
          <>
            {o.status === 'placed' && <Button icon={<ChefHat size={16} />} onClick={() => setModal('accept')}>Accept order</Button>}
            {o.status === 'preparing' && (
              <Button icon={<PackageCheck size={16} />} loading={act.isPending} onClick={() => act.mutate({ path: 'ready' })}>Mark ready</Button>
            )}
            {canAssign && (
              <Button variant="secondary" icon={<Bike size={16} />} onClick={() => setModal('assign')}>{active ? 'Reassign rider' : 'Assign rider'}</Button>
            )}
            {o.status !== 'picked_up' && (
              <Button variant="danger" icon={<XCircle size={16} />} style={{ marginLeft: 'auto' }} onClick={() => setModal('cancel')}>Cancel</Button>
            )}
          </>
        ) : undefined
      }
    >
      <ErrorAlert error={error} />
      {!o ? (
        <>
          <Skeleton h={120} r={16} />
          <Skeleton h={200} r={16} />
        </>
      ) : (
        <>
          {o.status === 'cancelled' && (
            <div className="alert alert-error">Cancelled by {o.cancelled_by} · {o.timeline.at(-1)?.reason ?? titleCase(o.cancellation_reason ?? '')}</div>
          )}
          {o.issues.map((iss, i) => (
            <div key={i} className="alert alert-warning">
              Rider reported: {titleCase(iss.kind)}
              {iss.note ? ` — “${iss.note}”` : ''} · {iss.reported_by ?? 'rider'}, {ago(iss.at)}
            </div>
          ))}

          <div className="link-cards">
            <button className="link-card" onClick={() => open({ kind: 'customer', id: o.customer.id })}>
              <span className="link-icon tone-info"><User size={16} /></span>
              <span className="link-body">
                <span className="subtle">Customer</span>
                <strong>{o.customer.name ?? 'Customer'}</strong>
              </span>
              <ChevronRight size={16} className="link-chev" />
            </button>
            {o.restaurant && (
              <button className="link-card" onClick={() => open({ kind: 'restaurant', id: o.restaurant!.id })}>
                <span className="link-icon tone-primary"><Store size={16} /></span>
                <span className="link-body">
                  <span className="subtle">Restaurant</span>
                  <strong>{o.restaurant.name}</strong>
                </span>
                <ChevronRight size={16} className="link-chev" />
              </button>
            )}
          </div>

          <div className="section">
            <div className="section-title">Delivery</div>
            <dl className="kv">
              <dt>Customer phone</dt>
              <dd>
                <RevealValue
                  masked={o.customer.masked_phone}
                  value={contact.data?.customer_phone_e164}
                  revealed={!!contact.data}
                  busy={contact.busy}
                  onReveal={contact.reveal}
                  onHide={contact.hide}
                  canReveal={can(user, 'reveal_contact')}
                />
              </dd>
              <dt>Recipient</dt>
              <dd>
                {o.delivery_address.contact_name ?? '—'}{' '}
                {contact.data?.delivery_contact_phone_e164 && contact.data.delivery_contact_phone_e164 !== contact.data.customer_phone_e164 && (
                  <span className="mono"> · {contact.data.delivery_contact_phone_e164}</span>
                )}
              </dd>
              <dt>Address</dt>
              <dd>
                {[o.delivery_address.line1, o.delivery_address.line2, o.delivery_address.landmark, o.delivery_address.locality].filter(Boolean).join(', ')}{' '}
                <a className="inline-link" href={mapUrl} target="_blank" rel="noreferrer noopener">
                  <MapPin size={12} /> Map <ExternalLink size={11} />
                </a>
              </dd>
              {o.delivery_address.instructions && (
                <>
                  <dt>Instructions</dt>
                  <dd>“{o.delivery_address.instructions}”</dd>
                </>
              )}
              <dt>Distance</dt>
              <dd>{km(o.delivery_distance_m)} from restaurant</dd>
              <dt>Expected by</dt>
              <dd>{time(o.estimated_delivery_at)}</dd>
            </dl>
          </div>

          <div className="section">
            <div className="section-title">Rider</div>
            {o.assignments.length === 0 ? (
              <p className="muted">{o.status === 'placed' ? 'A rider is requested automatically once the order is accepted.' : 'Looking for the nearest available rider…'}</p>
            ) : (
              <div className="stack" style={{ gap: 4 }}>
                {o.assignments
                  .slice()
                  .reverse()
                  .map((a) => {
                    const faded = ['rejected', 'expired', 'cancelled'].includes(a.status);
                    return (
                      <button key={a.id} className="list-row" style={{ opacity: faded ? 0.55 : 1 }} onClick={() => open({ kind: 'rider', id: a.delivery_partner_id })}>
                        <div className="avatar sm">{a.rider_name?.[0] ?? '?'}</div>
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <div className="cell-main">{a.rider_name}</div>
                          <div className="cell-sub">
                            {a.vehicle_type ? VEHICLE[a.vehicle_type] : ''} · {a.manual ? 'assigned by admin' : 'auto-dispatch'} · {ago(a.offered_at)}
                          </div>
                        </div>
                        <Badge tone={a.status === 'delivered' ? 'tone-success' : faded ? 'tone-neutral' : 'tone-accent'}>{titleCase(a.status)}</Badge>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>

          <div className="section">
            <div className="section-title">Items</div>
            {o.items.map((it, i) => (
              <div key={i} className="line-item">
                <FoodMark type={it.food_type} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{it.quantity} × {it.name}</div>
                  {it.options.length > 0 && <div className="cell-sub">{it.options.map((x) => x.option_name).join(', ')}</div>}
                  {it.notes && <div className="cell-sub">“{it.notes}”</div>}
                </div>
                <div className="tabular" style={{ fontWeight: 600 }}>{rupees(it.line_total)}</div>
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              {(
                [
                  ['Item total', 'subtotal_minor'],
                  ['Packaging', 'packaging_fee_minor'],
                  ['Delivery fee', 'delivery_fee_minor'],
                  ['Platform fee', 'platform_fee_minor'],
                  ['Taxes', 'tax_minor'],
                  ['Rider tip', 'tip_minor'],
                ] as const
              ).map(([label, k]) =>
                o.bill[k] ? (
                  <div key={k} className="bill-row">
                    <span>{label}</span>
                    <span className="tabular">{rupees(o.bill[k] ?? 0)}</span>
                  </div>
                ) : null,
              )}
              {!!o.bill.discount_minor && (
                <div className="bill-row" style={{ color: 'var(--success)' }}>
                  <span>Discount</span>
                  <span className="tabular">−{rupees(o.bill.discount_minor)}</span>
                </div>
              )}
              <div className="bill-row total">
                <span>Total</span>
                <span className="tabular">{rupees(o.bill.total_minor ?? 0)}</span>
              </div>
            </div>
          </div>

          <div className="section">
            <div className="section-title">Timeline</div>
            <div className="timeline">
              {o.timeline.map((t, i) => (
                <div key={i} className={`tl-item${t.status === 'cancelled' ? ' bad' : ' done'}`}>
                  <strong>{ORDER_STATUS[t.status].label}</strong>
                  <span className="subtle">
                    {dateTime(t.at)} · by {titleCase(t.actor)}
                    {t.reason ? ` · ${t.reason}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {modal === 'accept' && <AcceptModal busy={act.isPending} onClose={() => setModal(null)} onSubmit={(prep) => act.mutate({ path: 'accept', body: { prep_minutes: prep } })} />}
      {modal === 'cancel' && <CancelModal busy={act.isPending} onClose={() => setModal(null)} onSubmit={(reason) => act.mutate({ path: 'cancel', body: { reason } })} />}
      {modal === 'assign' && o && (
        <AssignModal orderId={id} busy={act.isPending} onClose={() => setModal(null)} onSubmit={(rid) => act.mutate({ path: 'assign', body: { delivery_partner_id: rid } })} />
      )}
    </Drawer>
  );
}

function AcceptModal({ onClose, onSubmit, busy }: { onClose: () => void; onSubmit: (prep: number) => void; busy: boolean }) {
  const [prep, setPrep] = useState(20);
  return (
    <Modal
      title="Accept order"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Not now</Button>
          <Button loading={busy} onClick={() => onSubmit(prep)}>Accept · {prep} min</Button>
        </>
      }
    >
      <p className="muted">Confirm with the restaurant, then set how long the food needs. We'll start finding a rider straight away.</p>
      <div className="tabs" style={{ alignSelf: 'flex-start' }}>
        {[10, 15, 20, 30, 45].map((m) => (
          <button key={m} className={`tab${prep === m ? ' active' : ''}`} onClick={() => setPrep(m)}>{m} min</button>
        ))}
      </div>
    </Modal>
  );
}

function CancelModal({ onClose, onSubmit, busy }: { onClose: () => void; onSubmit: (reason: string) => void; busy: boolean }) {
  const [reason, setReason] = useState('');
  const presets = ['Restaurant unavailable', 'No rider available', 'Customer request', 'Suspected fraud'];
  return (
    <Modal
      title="Cancel this order?"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Keep order</Button>
          <Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={() => onSubmit(reason.trim())}>Cancel order</Button>
        </>
      }
    >
      <p className="muted">The customer is notified and any active rider is released. This is recorded in the audit log.</p>
      <div className="row wrap">
        {presets.map((p) => (
          <button key={p} className={`btn btn-sm ${reason === p ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setReason(p)}>{p}</button>
        ))}
      </div>
      <textarea className="textarea" placeholder="Reason (required)" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}

function AssignModal({ orderId, onClose, onSubmit, busy }: { orderId: string; onClose: () => void; onSubmit: (riderId: string) => void; busy: boolean }) {
  const [pick, setPick] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['available-riders', orderId],
    queryFn: () => api<AvailableRider[]>(`/admin/orders/${orderId}/available-riders`),
    refetchInterval: 10_000,
  });
  return (
    <Modal
      title="Assign a rider"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!pick} onClick={() => pick && onSubmit(pick)}>Assign rider</Button>
        </>
      }
    >
      <p className="muted">Online riders in this zone who are free right now, nearest to the restaurant first.</p>
      <ErrorAlert error={error} />
      {isLoading && <Skeleton h={64} r={16} />}
      {data?.length === 0 && <Empty icon={<Bike size={22} />} title="No free riders nearby">Riders appear when they're online and not on another delivery.</Empty>}
      <div className="stack" style={{ gap: 8 }}>
        {data?.map((r) => (
          <button key={r.id} className={`pick${pick === r.id ? ' selected' : ''}`} onClick={() => setPick(r.id)}>
            <div className="avatar sm">{r.name?.[0] ?? '?'}</div>
            <div style={{ flex: 1 }}>
              <div className="cell-main">{r.name}</div>
              <div className="cell-sub">{r.vehicle_type ? VEHICLE[r.vehicle_type] : 'Vehicle'} · ★ {r.rating.toFixed(1)}</div>
            </div>
            <div className="right">
              <div className="cell-main tabular">{km(r.distance_m)}</div>
              <div className="cell-sub" style={{ color: r.location_fresh ? undefined : 'var(--warning)' }}>{r.location_fresh ? 'from restaurant' : 'GPS not updating'}</div>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
