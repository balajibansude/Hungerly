import { countSubtitle, plural, summaryAccessibilityLabel, summaryValue } from './summary';

describe('summaryValue', () => {
  it('shows real counts only', () => {
    expect(summaryValue({ kind: 'count', count: 2 })).toBe('2');
    expect(summaryValue({ kind: 'count', count: 0 })).toBe('0');
    expect(summaryValue({ kind: 'count', count: 20, hasMore: true })).toBe('20+');
  });

  it('never invents a number for missing data', () => {
    expect(summaryValue({ kind: 'unavailable' })).toBe('—');
    expect(summaryValue({ kind: 'signed_out' })).toBe('—');
    expect(summaryValue({ kind: 'error' })).toBe('—');
    expect(summaryValue({ kind: 'loading' })).toBe('…');
  });
});

describe('summaryAccessibilityLabel', () => {
  it('explains why a value is missing', () => {
    expect(summaryAccessibilityLabel('Wallet', { kind: 'unavailable' })).toBe(
      'Wallet: not available yet',
    );
    expect(summaryAccessibilityLabel('Orders', { kind: 'signed_out' })).toBe(
      'Orders: log in to see',
    );
    expect(summaryAccessibilityLabel('Saved', { kind: 'count', count: 3 })).toBe('Saved: 3');
  });
});

describe('countSubtitle', () => {
  const orders = { singular: 'past order', empty: 'No past orders yet', fallback: 'View orders' };

  it('pluralises real counts', () => {
    expect(countSubtitle({ kind: 'count', count: 1 }, orders)).toBe('1 past order');
    expect(countSubtitle({ kind: 'count', count: 2 }, orders)).toBe('2 past orders');
    expect(countSubtitle({ kind: 'count', count: 0 }, orders)).toBe('No past orders yet');
  });

  it('falls back while the count is unknown', () => {
    expect(countSubtitle({ kind: 'loading' }, orders)).toBe('View orders');
    expect(countSubtitle({ kind: 'signed_out' }, orders)).toBe('View orders');
  });

  it('supports irregular plurals', () => {
    expect(plural(2, 'address', 'addresses')).toBe('2 addresses');
  });
});
