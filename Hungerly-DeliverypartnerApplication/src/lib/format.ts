import type { Money, VehicleType } from './types';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

export function rupees(m: Money | number | null | undefined, exact = false): string {
  const minor = typeof m === 'number' ? m : (m?.amount_minor ?? 0);
  return (exact ? inrExact : inr).format(minor / 100);
}

export function km(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

export function time(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short' });
}

export function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? 'Partner';
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export const VEHICLES: { value: VehicleType; label: string; icon: 'bicycle' | 'bicycle-outline' | 'speedometer-outline' | 'flash-outline' }[] = [
  { value: 'motorcycle', label: 'Motorcycle', icon: 'speedometer-outline' },
  { value: 'scooter', label: 'Scooter', icon: 'bicycle-outline' },
  { value: 'ev_scooter', label: 'EV scooter', icon: 'flash-outline' },
  { value: 'bicycle', label: 'Bicycle', icon: 'bicycle' },
];

export function vehicleLabel(v: VehicleType | null | undefined): string {
  return VEHICLES.find((x) => x.value === v)?.label ?? 'Vehicle';
}

/** Local IST date as YYYY-MM-DD. */
export function isoDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
