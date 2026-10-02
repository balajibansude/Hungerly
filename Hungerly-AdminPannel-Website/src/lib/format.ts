import type { Money, OrderStatus } from './types';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const inrCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 });

export function rupees(m: Money | number | null | undefined, compact = false): string {
  const minor = typeof m === 'number' ? m : (m?.amount_minor ?? 0);
  return (compact ? inrCompact : inr).format(minor / 100);
}

const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function time(iso: string | null | undefined): string {
  return iso ? timeFmt.format(new Date(iso)) : '—';
}

export function dateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFmt.format(new Date(iso)) : '—';
}

export function shortDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return dateFmt.format(new Date(iso));
}

export function km(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: string }> = {
  pending_payment: { label: 'Awaiting payment', tone: 'tone-neutral' },
  placed: { label: 'New', tone: 'tone-info' },
  preparing: { label: 'Preparing', tone: 'tone-accent' },
  ready_for_pickup: { label: 'Ready', tone: 'tone-primary' },
  picked_up: { label: 'On the way', tone: 'tone-secondary' },
  delivered: { label: 'Delivered', tone: 'tone-success' },
  cancelled: { label: 'Cancelled', tone: 'tone-error' },
};

export const PARTNER_STATUS: Record<string, { label: string; tone: string }> = {
  onboarding: { label: 'Onboarding', tone: 'tone-neutral' },
  pending_review: { label: 'Pending review', tone: 'tone-accent' },
  active: { label: 'Active', tone: 'tone-success' },
  suspended: { label: 'Suspended', tone: 'tone-error' },
  rejected: { label: 'Rejected', tone: 'tone-error' },
  offboarded: { label: 'Offboarded', tone: 'tone-neutral' },
};

export const VEHICLE: Record<string, string> = {
  bicycle: 'Bicycle',
  motorcycle: 'Motorcycle',
  scooter: 'Scooter',
  ev_scooter: 'EV scooter',
};

export const ADMIN_ROLE: Record<string, string> = {
  super_admin: 'Super admin',
  operations: 'Operations',
  support: 'Support',
  finance: 'Finance',
};
