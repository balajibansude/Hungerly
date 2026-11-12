import { blockedMessage, dishBlocker, opensAtLabel, sortOpenFirst } from './availability';
import { filterByPreference, matchesPreference } from './preference';

describe('food preference', () => {
  it('Mixed shows every food type', () => {
    for (const type of ['veg', 'non_veg', 'egg', 'jain'] as const) {
      expect(matchesPreference(type, 'mixed')).toBe(true);
    }
  });

  it('Veg shows vegetarian and Jain dishes, never non-veg or egg', () => {
    expect(matchesPreference('veg', 'veg')).toBe(true);
    expect(matchesPreference('jain', 'veg')).toBe(true);
    expect(matchesPreference('non_veg', 'veg')).toBe(false);
    expect(matchesPreference('egg', 'veg')).toBe(false);
  });

  it('Jain shows only dishes explicitly marked Jain, not ordinary veg', () => {
    expect(matchesPreference('jain', 'jain')).toBe(true);
    expect(matchesPreference('veg', 'jain')).toBe(false);
    expect(matchesPreference('non_veg', 'jain')).toBe(false);
  });

  it('filters lists by the food type of each item', () => {
    const items = [
      { id: 'a', type: 'veg' as const },
      { id: 'b', type: 'non_veg' as const },
      { id: 'c', type: 'jain' as const },
    ];
    expect(filterByPreference(items, 'veg', (i) => i.type).map((i) => i.id)).toEqual(['a', 'c']);
    expect(filterByPreference(items, 'jain', (i) => i.type).map((i) => i.id)).toEqual(['c']);
    expect(filterByPreference(items, 'mixed', (i) => i.type)).toHaveLength(3);
  });
});

describe('availability', () => {
  it('blocks dishes from closed restaurants before checking the dish itself', () => {
    expect(dishBlocker({ isAvailable: true }, { isOpen: false })).toBe('restaurant_closed');
    expect(dishBlocker({ isAvailable: false }, { isOpen: false })).toBe('restaurant_closed');
    expect(dishBlocker({ isAvailable: false }, { isOpen: true })).toBe('dish_unavailable');
    expect(dishBlocker({ isAvailable: true }, { isOpen: true })).toBeNull();
  });

  it('formats the opening time only when it is valid', () => {
    expect(opensAtLabel('11:00')).toBe('Opens at 11:00 AM');
    expect(opensAtLabel('18:30')).toBe('Opens at 6:30 PM');
    expect(opensAtLabel(undefined)).toBeNull();
    expect(opensAtLabel('25:00')).toBeNull();
  });

  it('explains closures, with the opening time when known', () => {
    expect(blockedMessage('restaurant_closed', { isOpen: false, opensAt: '11:00' })).toBe(
      'This restaurant is currently closed. Opens at 11:00 AM.',
    );
    expect(blockedMessage('restaurant_closed', { isOpen: false })).toBe(
      'This restaurant is currently closed.',
    );
  });

  it('keeps closed restaurants below open ones without reordering within groups', () => {
    const items = [
      { id: 1, open: false },
      { id: 2, open: true },
      { id: 3, open: false },
      { id: 4, open: true },
    ];
    expect(sortOpenFirst(items, (i) => i.open).map((i) => i.id)).toEqual([2, 4, 1, 3]);
  });
});
