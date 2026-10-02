import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Badge, Button, ErrorAlert, Modal, Switch, TableSkeleton, useToast } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { ADMIN_ROLE, ago, initials } from '../lib/format';
import { useUser } from '../lib/session';
import type { AdminRow } from '../lib/types';

const ROLES = ['operations', 'support', 'finance', 'super_admin'] as const;
const ROLE_HELP: Record<(typeof ROLES)[number], string> = {
  operations: 'Orders, rider dispatch, approvals, suspensions',
  support: 'Read orders and customers, no changes',
  finance: 'Payments and reports',
  super_admin: 'Everything, including team and audit log',
};

export function Team() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useUser();
  const [adding, setAdding] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['admins'], queryFn: () => api<AdminRow[]>('/admin/admins') });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/admin/admins/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admins'] });
      toast('Access updated · their sessions were signed out');
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'Update failed', 'error'),
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Team & access</h2>
          <p className="page-sub">Give each person the narrowest role they need. Every change is audited.</p>
        </div>
        <Button icon={<UserPlus size={16} />} onClick={() => setAdding(true)}>
          Invite admin
        </Button>
      </div>
      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Two-factor</th>
                <th>Last sign-in</th>
                <th className="right">Active</th>
              </tr>
            </thead>
            {isLoading ? (
              <TableSkeleton cols={5} rows={3} />
            ) : (
              <tbody>
                {data?.map((a) => {
                  const self = a.id === me?.id;
                  return (
                    <tr key={a.id} style={{ cursor: 'default' }}>
                      <td>
                        <div className="row" style={{ gap: 12 }}>
                          <div className="avatar sm">{initials(a.name)}</div>
                          <div>
                            <div className="cell-main">
                              {a.name} {self && <span className="subtle">(you)</span>}
                            </div>
                            <div className="cell-sub">{a.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <select
                          className="select"
                          style={{ width: 170, height: 34 }}
                          value={a.admin_role}
                          disabled={self || patch.isPending}
                          onChange={(e) => patch.mutate({ id: a.id, body: { admin_role: e.target.value } })}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ADMIN_ROLE[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {a.mfa_enrolled ? (
                          <Badge tone="tone-success">
                            <ShieldCheck size={12} /> Enrolled
                          </Badge>
                        ) : (
                          <Badge tone="tone-accent">Pending first sign-in</Badge>
                        )}
                      </td>
                      <td>{ago(a.last_login_at)}</td>
                      <td className="right">
                        <Switch label={`${a.name} active`} on={a.is_active} disabled={self || patch.isPending} onChange={(v) => patch.mutate({ id: a.id, body: { is_active: v } })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>
          <ErrorAlert error={error} />
        </div>
      </section>
      {adding && <InviteModal onClose={() => setAdding(false)} />}
    </>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ full_name: '', email: '', admin_role: 'support' as (typeof ROLES)[number], temporary_password: '' });
  const create = useMutation({
    mutationFn: () => api('/admin/admins', { method: 'POST', body: form }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admins'] });
      toast('Admin created — share the temporary password securely');
      onClose();
    },
  });

  function generate() {
    const bytes = crypto.getRandomValues(new Uint8Array(15));
    setForm((f) => ({ ...f, temporary_password: btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 18) }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <Modal title="Invite an admin" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {create.error && <ErrorAlert error={create.error} />}
        <div className="field">
          <label>Full name</label>
          <input className="input" required maxLength={120} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div className="field">
          <label>Work email</label>
          <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="field">
          <label>Role</label>
          <select className="select" value={form.admin_role} onChange={(e) => setForm({ ...form, admin_role: e.target.value as (typeof ROLES)[number] })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ADMIN_ROLE[r]} — {ROLE_HELP[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Temporary password</label>
          <div className="row">
            <input
              className="input mono"
              required
              minLength={12}
              maxLength={128}
              value={form.temporary_password}
              onChange={(e) => setForm({ ...form, temporary_password: e.target.value })}
            />
            <Button type="button" variant="ghost" onClick={generate}>
              Generate
            </Button>
          </div>
          <span className="hint">At least 12 characters. They'll set up an authenticator app on first sign-in.</span>
        </div>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Create admin
          </Button>
        </div>
      </form>
    </Modal>
  );
}
