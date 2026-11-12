import type { Address } from '@hungerly/types';

import { deliveryAddressChoice } from './deliveryAddress';

const home: Address = {
  id: 'a-home',
  label: 'home',
  line1: 'Flat 402, Amar Residency',
  locality: 'Koregaon Park',
  city: 'Pune',
  postalCode: '411001',
  location: { lat: 18.5, lng: 73.9 },
};
const work: Address = { ...home, id: 'a-work', label: 'work' };

describe('deliveryAddressChoice', () => {
  it('returns the selected address when it is complete', () => {
    expect(deliveryAddressChoice({ addresses: [home, work], selectedId: 'a-work' })).toEqual({
      kind: 'ready',
      address: work,
    });
  });

  it('reports no address when nothing is saved or loaded', () => {
    expect(deliveryAddressChoice(null)).toEqual({ kind: 'none' });
    expect(deliveryAddressChoice(undefined)).toEqual({ kind: 'none' });
    expect(deliveryAddressChoice({ addresses: [], selectedId: 'a-home' })).toEqual({
      kind: 'none',
    });
  });

  it('reports no address when the selection points at a removed address', () => {
    expect(deliveryAddressChoice({ addresses: [home], selectedId: 'a-gone' })).toEqual({
      kind: 'none',
    });
  });

  it('flags a selected address that is missing required details', () => {
    const broken = { ...home, postalCode: '12' };
    expect(deliveryAddressChoice({ addresses: [broken], selectedId: 'a-home' })).toEqual({
      kind: 'incomplete',
      address: broken,
    });
  });
});
