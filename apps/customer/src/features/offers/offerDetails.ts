import type { DiscountRule, Offer } from '@hungerly/types';
import type { PromoBannerTone } from '@hungerly/ui';
import { formatMoney } from '@hungerly/utils';

import type { OfferListing } from '@/services';

export type OfferStatus = 'active' | 'upcoming' | 'expired';

/** Offers without a validity window are treated as active: the server is the authority. */
export function offerStatus(offer: Pick<Offer, 'startsAt' | 'endsAt'>, now: Date): OfferStatus {
  const time = now.getTime();
  if (offer.endsAt && Date.parse(offer.endsAt) <= time) return 'expired';
  if (offer.startsAt && Date.parse(offer.startsAt) > time) return 'upcoming';
  return 'active';
}

/** "50% off, up to ₹120" or "Flat ₹75 off". */
export function discountSummary(rule: DiscountRule): string {
  if (rule.kind === 'flat') return `Flat ${formatMoney(rule.amount)} off`;
  const percent = rule.percentBps / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}% off, up to ${formatMoney(rule.maxDiscount)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Eligibility and terms, built only from fields the offer actually has. Nothing is
 * added for missing data (e.g. no validity line when the window is unknown).
 */
export function offerTerms({ offer, restaurant }: OfferListing): string[] {
  const terms = [discountSummary(offer.rule)];
  if (offer.rule.minimumOrder.amountMinor > 0) {
    terms.push(`Minimum order ${formatMoney(offer.rule.minimumOrder)}`);
  }
  terms.push(restaurant ? `Only on orders from ${restaurant.name}` : 'Valid at all restaurants');
  if (offer.firstOrderOnly) terms.push('Valid on your first Swaadone order only');
  if (offer.startsAt) terms.push(`Starts ${formatDate(offer.startsAt)}`);
  if (offer.endsAt) terms.push(`Valid until ${formatDate(offer.endsAt)}`);
  terms.push('The final discount is confirmed at checkout.');
  return terms;
}

/** Offers that can be used now, for counts in the Account tab. */
export function countActiveOffers(listings: OfferListing[], now: Date): number {
  return listings.filter(({ offer }) => offerStatus(offer, now) === 'active').length;
}

/** Active offers first, then upcoming, then expired; original order within each group. */
export function sortOffers(listings: OfferListing[], now: Date): OfferListing[] {
  const rank: Record<OfferStatus, number> = { active: 0, upcoming: 1, expired: 2 };
  return listings
    .map((listing, index) => ({ listing, index, rank: rank[offerStatus(listing.offer, now)] }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ listing }) => listing);
}

export interface OfferBannerContent {
  /** "50%" or "₹75": straight from the discount rule. */
  headline: string;
  kicker: string;
  title: string;
  subtitle: string;
  /** Promo code, when the offer has one. */
  footnote?: string;
  accessibilityLabel: string;
}

function percentText(percentBps: number): string {
  const percent = percentBps / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
}

/**
 * Banner copy built only from the offer's own fields: the discount comes from its rule,
 * validity is mentioned only when `endsAt` exists, and nothing claims "today only".
 */
export function offerBannerContent({ offer, restaurant }: OfferListing): OfferBannerContent {
  const headline =
    offer.rule.kind === 'percent'
      ? percentText(offer.rule.percentBps)
      : formatMoney(offer.rule.amount);
  const title = restaurant ? `At ${restaurant.name}` : 'On all restaurants';
  const validity = offer.endsAt ? ` · Valid until ${formatDate(offer.endsAt)}` : '';
  const subtitle = `${offer.description}${validity}`;
  const footnote = offer.code ? `Code ${offer.code}` : undefined;
  return {
    headline,
    kicker: 'OFF',
    title,
    subtitle,
    footnote,
    accessibilityLabel: [offer.label, title, subtitle, footnote].filter(Boolean).join('. '),
  };
}

/** Banners cycle green → orange → pink → blue. */
const BANNER_TONES: readonly PromoBannerTone[] = ['green', 'orange', 'pink', 'blue'];

export function bannerToneAt(index: number): PromoBannerTone {
  return BANNER_TONES[index % BANNER_TONES.length] ?? 'green';
}
