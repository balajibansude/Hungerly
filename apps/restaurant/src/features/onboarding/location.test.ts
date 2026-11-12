import { UpdateBranchSchema } from '@hungerly/api-client';

import { addressSearchText, isValidPoint, mapPinLocation, streetRegion } from './location';

describe('mapPinLocation', () => {
  it('builds the branch API location body from the selected pin, marked as a map pin', () => {
    const body = mapPinLocation({ latitude: 18.5362, longitude: 73.8931 });
    expect(body).toEqual({ lat: 18.5362, lng: 73.8931, source: 'map_pin' });
    // The PATCH /partner/branches/:id contract accepts it as-is.
    expect(UpdateBranchSchema.safeParse({ location: body }).success).toBe(true);
  });

  it.each([
    ['no pin yet', { latitude: null, longitude: null }],
    ['only a latitude', { latitude: 18.5, longitude: null }],
    ['NaN', { latitude: Number.NaN, longitude: 73.9 }],
    ['out-of-range latitude', { latitude: 91, longitude: 73.9 }],
    ['out-of-range longitude', { latitude: 18.5, longitude: -181 }],
  ])('returns null (step cannot continue) for %s', (_label, point) => {
    expect(mapPinLocation(point)).toBeNull();
  });
});

describe('isValidPoint', () => {
  it('accepts boundary coordinates', () => {
    expect(isValidPoint({ latitude: -90, longitude: 180 })).toBe(true);
    expect(isValidPoint({ latitude: 0, longitude: 0 })).toBe(true);
  });
});

describe('streetRegion', () => {
  it('centres a street-level view on the point', () => {
    expect(streetRegion({ latitude: 12.97, longitude: 77.59 })).toEqual({
      latitude: 12.97,
      longitude: 77.59,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    });
  });
});

describe('addressSearchText', () => {
  it('joins the typed address parts, skipping blanks', () => {
    expect(
      addressSearchText({ addressLine1: ' 12 MG Road ', locality: '', city: 'Pune', state: 'Maharashtra', pinCode: '411001' }),
    ).toBe('12 MG Road, Pune, Maharashtra, 411001');
  });

  it('is empty when nothing is typed yet', () => {
    expect(addressSearchText({ addressLine1: '', locality: ' ', city: '', state: '', pinCode: '' })).toBe('');
  });
});
