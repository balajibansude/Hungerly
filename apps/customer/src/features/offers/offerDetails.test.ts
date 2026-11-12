import type { Offer } from '@hungerly/types';
import { money } from '@hungerly/utils';

import type { OfferListing } from '@/services';

import {
  bannerToneAt,
  countActiveOffers,
  offerBannerContent,
  discountSummary,
  offerStatus,
  offerTerms,
  sortOffers,
} from './offerDetails';

const now = new Date('2026-10-04T12:00:00Z');

const offer = (id: string, extra: Partial<Offer> = {}): Offer => ({
  id,
  label: '20% off up to ₹80',
  description: 'On orders above ₹249',
  rule: { kind: 'percent', percentBps: 2000, maxDiscount: money(8000), minimumOrder: money(24900) },
  ...extra,
});

describe('offerStatus', () => {
  it('treats offers without a validity window as active', () => {
    expect(offerStatus(offer('a'), now)).toBe('active');
  });

  it('detects expired and upcoming offers', () => {
    expect(offerStatus(offer('a', { endsAt: '2026-10-01T00:00:00Z' }), now)).toBe('expired');
    expect(offerStatus(offer('a', { startsAt: '2026-11-01T00:00:00Z' }), now)).toBe('upcoming');
    expect(
      offerStatus(
        offer('a', { startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-31T00:00:00Z' }),
        now,
      ),
    ).toBe('active');
  });
});

describe('discountSummary', () => {
  it('describes percent and flat discounts', () => {
    expect(discountSummary(offer('a').rule)).toBe('20% off, up to ₹80');
    expect(discountSummary({ kind: 'flat', amount: money(7500), minimumOrder: money(44900) })).toBe(
      'Flat ₹75 off',
    );
  });
});

describe('offerTerms', () => {
  it('lists only the terms the offer data supports', () => {
    const terms = offerTerms({ offer: offer('a') });
    expect(terms).toContain('Minimum order ₹249');
    expect(terms).toContain('Valid at all restaurants');
    expect(terms.some((t) => t.startsWith('Valid until'))).toBe(false);
    expect(terms.some((t) => t.includes('first'))).toBe(false);
  });

  it('adds restaurant, first-order and validity restrictions when present', () => {
    const terms = offerTerms({
      offer: offer('a', { firstOrderOnly: true, endsAt: '2026-10-31T00:00:00Z' }),
      restaurant: { id: 'r-1', name: 'Tandoor & Tales' },
    });
    expect(terms).toContain('Only on orders from Tandoor & Tales');
    expect(terms).toContain('Valid on your first Swaadone order only');
    expect(terms.some((t) => t.startsWith('Valid until'))).toBe(true);
  });
});

describe('counting and ordering', () => {
  const listings: OfferListing[] = [
    { offer: offer('expired', { endsAt: '2026-09-01T00:00:00Z' }) },
    { offer: offer('active-1') },
    { offer: offer('upcoming', { startsAt: '2026-12-01T00:00:00Z' }) },
    { offer: offer('active-2') },
  ];

  it('counts only offers usable now', () => {
    expect(countActiveOffers(listings, now)).toBe(2);
    expect(countActiveOffers([], now)).toBe(0);
  });

  it('shows active offers first and expired ones last', () => {
    expect(sortOffers(listings, now).map((l) => l.offer.id)).toEqual([
      'active-1',
      'active-2',
      'upcoming',
      'expired',
    ]);
  });
});

describe('offerBannerContent', () => {
  it('takes the big number from the discount rule', () => {
    expect(offerBannerContent({ offer: offer('a') }).headline).toBe('20%');
    expect(
      offerBannerContent({
        offer: offer('b', {
          rule: { kind: 'flat', amount: money(7500), minimumOrder: money(44900) },
        }),
      }).headline,
    ).toBe('₹75');
  });

  it('mentions validity and codes only when the offer has them', () => {
    const plain = offerBannerContent({ offer: offer('a') });
    expect(plain.subtitle).toBe('On orders above ₹249');
    expect(plain.footnote).toBeUndefined();

    const rich = offerBannerContent({
      offer: offer('a', { code: 'SAVE20', endsAt: '2026-10-31T00:00:00Z' }),
      restaurant: { id: 'r', name: 'The Dosa Republic' },
    });
    expect(rich.title).toBe('At The Dosa Republic');
    expect(rich.subtitle).toContain('Valid until');
    expect(rich.footnote).toBe('Code SAVE20');
  });

  it('cycles banner colours', () => {
    expect([0, 1, 2, 3, 4].map(bannerToneAt)).toEqual(['green', 'orange', 'pink', 'blue', 'green']);
  });
});
