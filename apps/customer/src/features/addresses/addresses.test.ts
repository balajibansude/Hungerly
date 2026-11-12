import { addressLines, formatAddress } from './format';
import { emptyAddressDraft, validateAddress, type AddressDraft } from './validation';

const draft = (overrides: Partial<AddressDraft> = {}): AddressDraft => ({
  label: 'home',
  line1: 'Flat 402, Amar Residency',
  line2: 'Lane 6',
  landmark: 'Near Osho Garden',
  locality: 'Koregaon Park',
  city: 'Pune',
  postalCode: '411001',
  ...overrides,
});

describe('addressLines / formatAddress', () => {
  it('lists the parts in order with locality, city and PIN together', () => {
    expect(addressLines(draft())).toEqual([
      'Flat 402, Amar Residency',
      'Lane 6',
      'Near Osho Garden',
      'Koregaon Park, Pune 411001',
    ]);
  });

  it('skips empty optional parts', () => {
    const lines = addressLines({ ...draft(), line2: undefined, landmark: '  ' });
    expect(lines).toEqual(['Flat 402, Amar Residency', 'Koregaon Park, Pune 411001']);
    expect(formatAddress({ ...draft(), line2: undefined, landmark: undefined })).toBe(
      'Flat 402, Amar Residency, Koregaon Park, Pune 411001',
    );
  });
});

describe('validateAddress', () => {
  it('accepts a complete address and returns it cleaned', () => {
    const result = validateAddress(
      draft({
        line1: '  Flat   402,  Amar Residency ',
        line2: ' ',
        landmark: '',
        postalCode: '411 001',
      }),
    );
    expect(result).toEqual({
      valid: true,
      value: {
        label: 'home',
        line1: 'Flat 402, Amar Residency',
        locality: 'Koregaon Park',
        city: 'Pune',
        postalCode: '411001',
      },
    });
  });

  it('requires line 1, locality, city and PIN code', () => {
    const result = validateAddress(emptyAddressDraft);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(Object.keys(result.errors).sort()).toEqual(['city', 'line1', 'locality', 'postalCode']);
  });

  it.each([
    ['011001', false],
    ['41100', false],
    ['4110011', false],
    ['41100a', false],
    ['411001', true],
  ])('checks the PIN code %s', (postalCode, ok) => {
    expect(validateAddress(draft({ postalCode })).valid).toBe(ok);
  });

  it('checks city names', () => {
    expect(validateAddress(draft({ city: 'Navi Mumbai' })).valid).toBe(true);
    expect(validateAddress(draft({ city: 'Pune 1' })).valid).toBe(false);
    expect(validateAddress(draft({ city: 'P' })).valid).toBe(false);
  });

  it('limits lengths', () => {
    const result = validateAddress(draft({ line1: 'x'.repeat(121), landmark: 'y'.repeat(81) }));
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.line1).toBeDefined();
    expect(result.errors.landmark).toBeDefined();
  });

  it('refuses an unknown label', () => {
    const result = validateAddress(draft({ label: 'office' as AddressDraft['label'] }));
    expect(result.valid).toBe(false);
  });
});
