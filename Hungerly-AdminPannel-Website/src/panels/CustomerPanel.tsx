import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, ChevronRight, ExternalLink, Home, LogOut, MapPin, Smartphone } from 'lucide-react';
import { useState } from 'react';

import { RevealValue, useReveal } from '../components/Reveal';
import { Badge, Button, Drawer, Empty, ErrorAlert, Modal, OrderBadge, Skeleton, useToast } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { ago, dateTime, initials, rupees, shortDate, titleCase } from '../lib/format';
import { usePanels } from '../lib/panels';
import { can, useUser } from '../lib/session';
import type { CustomerDetail, UserReveal } from '../lib/types';
import type { PanelNav } from './PanelHost';

export function CustomerPanel({ id, onClose, onBack }: { id: string } & PanelNav) {
  const qc = useQueryClient();
  const toast = useToast();
  const user = useUser();
  const { open } = usePanels();
  const [tab, setTab] = useState<'overview' | 'orders' | 'devices'>('overview');
  const [statusModal, setStatusModal] = useState(false);
  const { data: c, error } = useQuery({ queryKey: ['customer', id], queryFn: () => api<CustomerDetail>(`/admin/users/${id}`) });
  const pii = useReveal<UserReveal>(`/admin/users/${id}/reveal`);
  const canReveal = can(user, 'reveal_contact');
  const ops = can(user, 'act_ops');
  const isAdmin = c?.roles.includes('admin');

  const signOutAll = useMutation({
    mutationFn: () => api<{ sessions_revoked: number }>(`/admin/users/${id}/sessions/revoke`, { method: 'POST' }),
    onSuccess: (r) => {
      toast(`Signed out of ${r.sessions_revoked} device(s)`);
      void qc.invalidateQueries({ queryKey: ['customer', id] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  const setStatus = useMutation({
    mutationFn: (reason: string) =>
      api<{ sessions_revoked: number }>(`/admin/users/${id}/status`, { method: 'POST', body: { status: c?.status === 'active' ? 'suspended' : 'active', reason } }),
    onSuccess: () => {
      toast(c?.status === 'active' ? 'Account suspended and signed out everywhere' : 'Account reinstated');
      setStatusModal(false);
      void qc.invalidateQueries({ queryKey: ['customer', id] });
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  const addresses = pii.data?.addresses ?? c?.addresses ?? [];

  return (
    <Drawer
      onClose={onClose}
      onBack={onBack}
      header={
        c ? (
          <div className="row" style={{ gap: 14 }}>
            <div className="avatar lg">{initials(c.name)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}>
                <h2 className="drawer-title">{c.name ?? 'No name yet'}</h2>
                <Badge tone={c.status === 'active' ? 'tone-success' : 'tone-error'}>{titleCase(c.status)}</Badge>
              </div>
              <p className="muted">
                {c.roles.map(titleCase).join(' · ')} · joined {shortDate(c.created_at)}
              </p>
            </div>
          </div>
        ) : (
          <Skeleton h={52} w={260} />
        )
      }
      footer={
        c && ops && !isAdmin ? (
          <>
            <Button variant="ghost" icon={<LogOut size={16} />} loading={signOutAll.isPending} disabled={!c.sessions.length} onClick={() => signOutAll.mutate()}>
              Sign out everywhere
            </Button>
            <Button variant={c.status === 'active' ? 'danger' : 'primary'} style={{ marginLeft: 'auto' }} onClick={() => setStatusModal(true)}>
              {c.status === 'active' ? 'Suspend account' : 'Reinstate account'}
            </Button>
          </>
        ) : undefined
      }
    >
      <ErrorAlert error={error} />
      {!c ? (
        <Skeleton h={220} r={16} />
      ) : (
        <>
          <div className="section">
            <div className="section-title row between">
              <span>Contact</span>
              {pii.data && <span className="reveal-note">Visible for 30 s · logged in audit</span>}
            </div>
            <dl className="kv">
              <dt>Phone</dt>
              <dd>
                <RevealValue masked={c.masked_phone} value={pii.data?.phone_e164} revealed={!!pii.data} busy={pii.busy} onReveal={pii.reveal} onHide={pii.hide} canReveal={canReveal} />
                {c.phone_verified && <Badge tone="tone-success" plain>Verified</Badge>}
              </dd>
              <dt>Email</dt>
              <dd>
                {c.has_email ? (
                  <RevealValue masked={c.masked_email} value={pii.data?.email} revealed={!!pii.data} busy={pii.busy} onReveal={pii.reveal} onHide={pii.hide} canReveal={canReveal} />
                ) : (
                  <span className="subtle">Not added</span>
                )}
              </dd>
              <dt>Last active</dt>
              <dd>{ago(c.last_login_at)}</dd>
            </dl>
          </div>

          <div className="mini-stats">
            <MiniStat label="Orders" value={String(c.stats.orders)} sub={`${c.stats.delivered} delivered · ${c.stats.cancelled} cancelled`} />
            <MiniStat label="Lifetime spend" value={rupees(c.stats.total_spent)} sub={`avg ${rupees(c.stats.average_order)}`} />
            <MiniStat label="Favourite" value={c.stats.favourite_restaurant ?? '—'} sub={c.stats.last_order_at ? `last order ${ago(c.stats.last_order_at)}` : 'no orders yet'} small />
          </div>

          {c.delivery_partner && (
            <button className="link-card" onClick={() => open({ kind: 'rider', id: c.delivery_partner!.id })}>
              <span className="link-icon tone-accent"><Bike size={16} /></span>
              <span className="link-body">
                <span className="subtle">Also a delivery partner</span>
                <strong>View rider profile · {titleCase(c.delivery_partner.status)}</strong>
              </span>
              <ChevronRight size={16} className="link-chev" />
            </button>
          )}

          <div className="tabs">
            {(['overview', 'orders', 'devices'] as const).map((t) => (
              <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                {t === 'overview' ? `Addresses (${c.addresses.length})` : t === 'orders' ? `Orders (${c.stats.orders})` : `Devices (${c.sessions.length})`}
              </button>
            ))}
          </div>

          {tab === 'overview' &&
            (addresses.length === 0 ? (
              <Empty icon={<Home size={22} />} title="No saved addresses" />
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {addresses.map((a) => (
                  <div key={a.id} className="section">
                    <div className="row between">
                      <Badge tone="tone-neutral" plain>{titleCase(a.label)}</Badge>
                      <a
                        className="inline-link"
                        href={`https://www.google.com/maps/search/?api=1&query=${a.location.lat},${a.location.lng}`}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <MapPin size={12} /> Map <ExternalLink size={11} />
                      </a>
                    </div>
                    <div style={{ marginTop: 8, fontWeight: 600 }}>
                      {[a.line1, a.line2, a.landmark && (/^near\b/i.test(a.landmark) ? a.landmark : `near ${a.landmark}`)].filter(Boolean).join(', ')}
                    </div>
                    <div className="subtle">{a.locality}, {a.city} {a.postal_code}</div>
                    {a.instructions && <div className="subtle" style={{ marginTop: 4 }}>“{a.instructions}”</div>}
                  </div>
                ))}
                {!pii.data && canReveal && (
                  <Button variant="ghost" size="sm" loading={pii.busy} onClick={pii.reveal}>Show full addresses</Button>
                )}
              </div>
            ))}

          {tab === 'orders' &&
            (c.recent_orders.length === 0 ? (
              <Empty icon={<Home size={22} />} title="No orders yet" />
            ) : (
              <div className="stack" style={{ gap: 4 }}>
                {c.recent_orders.map((o) => (
                  <button key={o.id} className="list-row" onClick={() => open({ kind: 'order', id: o.id })}>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div className="cell-main mono">{o.order_number}</div>
                      <div className="cell-sub">{o.restaurant_name} · {dateTime(o.placed_at)}</div>
                    </div>
                    <OrderBadge status={o.status} />
                    <span className="tabular" style={{ fontWeight: 700, minWidth: 80, textAlign: 'right' }}>{rupees(o.total)}</span>
                  </button>
                ))}
              </div>
            ))}

          {tab === 'devices' &&
            (c.sessions.length === 0 ? (
              <Empty icon={<Smartphone size={22} />} title="Not signed in anywhere" />
            ) : (
              <div className="stack" style={{ gap: 4 }}>
                {c.sessions.map((s) => (
                  <div key={s.id} className="list-row" style={{ cursor: 'default' }}>
                    <span className="link-icon tone-neutral"><Smartphone size={16} /></span>
                    <div style={{ flex: 1 }}>
                      <div className="cell-main">{s.device_name ?? `${titleCase(s.client_app)} app`}</div>
                      <div className="cell-sub">Signed in {shortDate(s.created_at)} · active {ago(s.last_used_at)}</div>
                    </div>
                    <Badge tone="tone-neutral" plain>{titleCase(s.client_app)}</Badge>
                  </div>
                ))}
              </div>
            ))}
        </>
      )}
      {statusModal && c && (
        <ReasonModal
          title={c.status === 'active' ? `Suspend ${c.name ?? 'this account'}?` : `Reinstate ${c.name ?? 'this account'}?`}
          body={c.status === 'active' ? 'They are signed out of every device immediately and cannot sign back in.' : 'They will be able to sign in again.'}
          cta={c.status === 'active' ? 'Suspend account' : 'Reinstate'}
          danger={c.status === 'active'}
          busy={setStatus.isPending}
          onClose={() => setStatusModal(false)}
          onSubmit={(r) => setStatus.mutate(r)}
        />
      )}
    </Drawer>
  );
}

export function MiniStat({ label, value, sub, small }: { label: string; value: string; sub?: string; small?: boolean }) {
  return (
    <div className="mini-stat">
      <span className="subtle">{label}</span>
      <strong className={small ? 'mini-small' : 'tabular'} title={value}>{value}</strong>
      {sub && <span className="subtle">{sub}</span>}
    </div>
  );
}

export function ReasonModal({
  title,
  body,
  cta,
  danger,
  busy,
  onClose,
  onSubmit,
  optional,
}: {
  title: string;
  body: string;
  cta: string;
  danger?: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  optional?: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} disabled={!optional && reason.trim().length < 3} onClick={() => onSubmit(reason.trim())}>
            {cta}
          </Button>
        </>
      }
    >
      <p className="muted">{body} This is recorded in the audit log.</p>
      <textarea className="textarea" placeholder={optional ? 'Note (optional)' : 'Reason (required)'} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}
