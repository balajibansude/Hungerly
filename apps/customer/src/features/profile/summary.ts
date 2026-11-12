/**
 * Text for the Account tab's summary grid and row subtitles. Values are only shown when
 * they come from a real source; otherwise the UI says so instead of showing a made-up 0.
 */
export type SummarySource =
  | { kind: 'loading' }
  | { kind: 'error' }
  /** The feature has no backend yet (e.g. wallet). */
  | { kind: 'unavailable' }
  /** Account data that guests do not have. */
  | { kind: 'signed_out' }
  | { kind: 'count'; count: number; hasMore?: boolean };

/** Value shown in a summary cell: a number, "…" while loading, "—" when there is none. */
export function summaryValue(source: SummarySource): string {
  switch (source.kind) {
    case 'loading':
      return '…';
    case 'count':
      return `${source.count}${source.hasMore ? '+' : ''}`;
    default:
      return '—';
  }
}

/** Screen-reader text for a summary cell, e.g. "Orders: 2" or "Wallet: not available yet". */
export function summaryAccessibilityLabel(label: string, source: SummarySource): string {
  switch (source.kind) {
    case 'loading':
      return `${label}: loading`;
    case 'error':
      return `${label}: couldn't load`;
    case 'unavailable':
      return `${label}: not available yet`;
    case 'signed_out':
      return `${label}: log in to see`;
    case 'count':
      return `${label}: ${summaryValue(source)}`;
  }
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Row subtitle for a counted list, e.g. "2 past orders". `empty` is used for zero,
 * `fallback` while the count is unknown.
 */
export function countSubtitle(
  source: SummarySource,
  noun: { singular: string; plural?: string; empty: string; fallback: string },
): string {
  if (source.kind !== 'count') return noun.fallback;
  if (source.count === 0) return noun.empty;
  return `${plural(source.count, noun.singular, noun.plural)}${source.hasMore ? '+' : ''}`;
}
