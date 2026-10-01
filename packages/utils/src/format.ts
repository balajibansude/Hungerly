import type { PriceLevel, Range } from '@hungerly/types';

/** 850 → "850 m", 2400 → "2.4 km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** { min: 25, max: 35 } → "25–35 min". */
export function formatMinutesRange(range: Range): string {
  return range.min === range.max ? `${range.min} min` : `${range.min}–${range.max} min`;
}

export function formatPriceLevel(level: PriceLevel): string {
  return '₹'.repeat(level);
}

/** 4.26 → "4.3". Ratings are always shown with one decimal. */
export function formatRating(average: number): string {
  return average.toFixed(1);
}

/** 1240 → "1.2k", 980 → "980". */
export function formatCount(count: number): string {
  if (count < 1000) return String(count);
  const thousands = count / 1000;
  return `${thousands < 10 ? thousands.toFixed(1).replace(/\.0$/, '') : Math.round(thousands)}k`;
}
