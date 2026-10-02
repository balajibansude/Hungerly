import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ExternalLink, MapPin, ShieldAlert, User } from 'lucide-react';
import { useState } from 'react';

import { RevealValue, useReveal } from '../components/Reveal';
import { Badge, Button, Drawer, Empty, ErrorAlert, PartnerBadge, Skeleton, useToast } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { ago, dateTime, initials, rupees, titleCase, VEHICLE } from '../lib/format';
import { usePanels } from '../lib/panels';
import { can, useUser } from '../lib/session';
import type { PartnerDetail, PartnerReveal, PartnerRow } from '../lib/types';
import { MiniStat, ReasonModal } from './CustomerPanel';
import type { PanelNav } from './PanelHost';

type Action = 'approve' | 'reject' | 'suspend' | 'reinstate';

export function RiderPanel({ id, onClose, onBack }: { id: string } & PanelNav) {
  const qc = useQueryClient();
  const toast = useToast();
  const user = useUser();
  const { open } = usePanels();
  const [confirm, setConfirm] = useState<Action | null>(null);
  const { data: r, error } = useQuery({ queryKey: ['rider', id], queryFn: () => api<PartnerDetail>(`/admin/delivery-partners/${id}`), refetchInterval: 15_000 });
  const pii = useReveal<PartnerReveal>(`/admin/delivery-partners/${id}/reveal`);
  const canReveal = can(user, 'reveal_contact');

  const decide = useMutation({
    mutationFn: ({ action, reason }: { action: Action; reason?: string }) =>
      api<PartnerRow>(`/admin/delivery-partners/${id}/decision`, { method: 'POST', body: { action, reason: reason || undefined } }),
    onSuccess: (_, v) => {
      void qc.invalidateQueries({ queryKey: ['rider', id] });
      void qc.invalidateQueries({ queryKey: ['riders'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      setConfirm(null);
      toast({ approve: 'Rider approved — they can go online now', reject: 'Application rejected', suspend: 'Rider suspended', reinstate: 'Rider reinstated' }[v.action]);
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'Action failed', 'error'),
  });

  const copy = confirm && {
    approve: { title: `Approve ${r?.name ?? 'rider'}?`, body: 'They can go online and receive offers immediately.', cta: 'Approve', danger: false, optional: true },
    reject: { title: 'Reject application?', body: 'The rider sees this reason in the app and can fix their details and re-apply.', cta: 'Reject', danger: true, optional: false },
    suspend: { title: `Suspend ${r?.name ?? 'rider'}?`, body: 'They go offline immediately and cannot receive offers until reinstated.', cta: 'Suspend', danger: true, optional: false },
    reinstate: { title: `Reinstate ${r?.name ?? 'rider'}?`, body: 'They will be able to go online again.', cta: 'Reinstate', danger: false, optional: true },
  }[confirm];

  return (
    <Drawer
      onClose={onClose}
      onBack={onBack}
      header={
        r ? (
          <div className="row" style={{ gap: 14 }}>
            <div className="avatar lg">{initials(r.name)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <h2 className="drawer-title">{r.name ?? 'Unnamed rider'}</h2>
                <PartnerBadge status={r.status} />
                {r.status === 'active' && (r.is_online ? (r.reachable ? <Badge tone="tone-success" plain>Online</Badge> : <Badge tone="tone-accent" plain>GPS silent</Badge>) : <Badge tone="tone-neutral" plain>Offline</Badge>)}
              </div>
              <p className="muted">{r.vehicle_type ? VEHICLE[r.vehicle_type] : 'Vehicle not set'} · {r.zone ?? 'No zone'} · ★ {r.rating ? r.rating.toFixed(1) : 'new'}</p>
            </div>
          </div>
        ) : (
          <Skeleton h={52} w={260} />
        )
      }
      footer={
        r && can(user, 'act_ops') ? (
          <>
            {r.status === 'pending_review' && (
              <>
                <Button onClick={() => setConfirm('approve')}>Approve rider</Button>
                <Button variant="danger" onClick={() => setConfirm('reject')}>Reject</Button>
              </>
            )}
            {r.status === 'active' && <Button variant="danger" onClick={() => setConfirm('suspend')}>Suspend rider</Button>}
            {r.status === 'suspended' && <Button onClick={() => setConfirm('reinstate')}>Reinstate</Button>}
          </>
        ) : undefined
      }
    >
      <ErrorAlert error={error} />
      {r && (
        <>
          {r.status_reason && <div className="alert alert-warning">Reason on file: {r.status_reason}</div>}
          {r.status === 'active' && r.is_online && !r.reachable && (
            <div className="alert alert-warning">
              <ShieldAlert size={16} /> The rider's app hasn't sent a location recently, so dispatch can't reach them. They'll be switched offline automatically after 15 minutes of silence.
            </div>
          )}
          <div className="mini-stats">
            <MiniStat label="Delivered" value={String(r.stats.delivered)} />
            <MiniStat label="Earned" value={rupees(r.stats.earned)} />
            <MiniStat label="Acceptance" value={r.stats.acceptance_rate === null ? '—' : `${r.stats.acceptance_rate}%`} sub={`${r.stats.offers} offers`} />
          </div>

          <div className="section">
            <div className="section-title row between">
              <span>Contact & documents</span>
              {pii.data && <span className="reveal-note">Visible for 30 s · logged in audit</span>}
            </div>
            <dl className="kv">
              <dt>Phone</dt>
              <dd>
                <RevealValue masked={r.masked_phone} value={pii.data?.phone_e164} revealed={!!pii.data} busy={pii.busy} onReveal={pii.reveal} onHide={pii.hide} canReveal={canReveal} />
              </dd>
              <dt>Registration</dt>
              <dd className="mono">{pii.data?.documents_visible ? pii.data.vehicle_registration ?? '—' : r.vehicle_registration ?? '—'}</dd>
              <dt>Driving licence</dt>
              <dd className="mono">{pii.data?.documents_visible ? pii.data.driving_license_number ?? '—' : r.driving_license_number ?? '—'}</dd>
            </dl>
            <p className="subtle" style={{ marginTop: 10 }}>
              Documents are encrypted at rest. Full numbers are shown to super admins only{pii.data && !pii.data.documents_visible ? ' — your role sees the last 4 characters.' : '.'}
            </p>
          </div>

          <div className="section">
            <div className="section-title">Activity</div>
            <dl className="kv">
              <dt>Last online</dt>
              <dd>{ago(r.last_online_at)}</dd>
              <dt>Location</dt>
              <dd>
                {r.last_location ? (
                  <a className="inline-link" href={`https://www.google.com/maps/search/?api=1&query=${r.last_location.lat},${r.last_location.lng}`} target="_blank" rel="noreferrer noopener">
                    <MapPin size={12} /> Open live position <ExternalLink size={11} />
                  </a>
                ) : (
                  <span className="subtle">Not sharing</span>
                )}
              </dd>
              <dt>Applied</dt>
              <dd>{dateTime(r.submitted_at)}</dd>
              <dt>Approved</dt>
              <dd>{dateTime(r.approved_at)}</dd>
            </dl>
          </div>

          <button className="link-card" onClick={() => open({ kind: 'customer', id: r.user_id })}>
            <span className="link-icon tone-info"><User size={16} /></span>
            <span className="link-body">
              <span className="subtle">Account</span>
              <strong>Sign-in devices & account status</strong>
            </span>
            <ChevronRight size={16} className="link-chev" />
          </button>

          <div className="section">
            <div className="section-title">Recent deliveries</div>
            {r.recent_deliveries.length === 0 ? (
              <Empty icon={<MapPin size={22} />} title="No deliveries yet" />
            ) : (
              r.recent_deliveries.map((d) => (
                <button key={d.id} className="list-row" onClick={() => open({ kind: 'order', id: d.order_id })}>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div className="cell-main mono">{d.order_number}</div>
                    <div className="cell-sub">{d.restaurant_name} · {ago(d.at)}</div>
                  </div>
                  <Badge tone={d.status === 'delivered' ? 'tone-success' : ['rejected', 'expired', 'cancelled'].includes(d.status) ? 'tone-neutral' : 'tone-accent'}>
                    {titleCase(d.status)}
                  </Badge>
                  <span className="tabular" style={{ minWidth: 64, textAlign: 'right', fontWeight: 700 }}>{d.status === 'delivered' ? rupees(d.payout) : '—'}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
      {confirm && copy && (
        <ReasonModal
          title={copy.title}
          body={copy.body}
          cta={copy.cta}
          danger={copy.danger}
          optional={copy.optional}
          busy={decide.isPending}
          onClose={() => setConfirm(null)}
          onSubmit={(reason) => decide.mutate({ action: confirm, reason })}
        />
      )}
    </Drawer>
  );
}
