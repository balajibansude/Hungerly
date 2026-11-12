import { isValidIndianPincode, normalizePincode } from './address';
import { money, parseRupees } from './money';

describe('Indian PIN codes', () => {
  it('accepts six digits not starting with zero', () => {
    expect(isValidIndianPincode('411001')).toBe(true);
    expect(isValidIndianPincode(' 411 001 ')).toBe(true);
    expect(normalizePincode('411 001')).toBe('411001');
  });

  it('rejects other lengths, a leading zero and letters', () => {
    for (const value of ['', '41100', '4110011', '011001', '41100A']) {
      expect(isValidIndianPincode(value)).toBe(false);
    }
  });
});

describe('rupee input', () => {
  it('parses whole and decimal rupees into paise without floats', () => {
    expect(parseRupees('149')).toEqual(money(14900));
    expect(parseRupees('149.5')).toEqual(money(14950));
    expect(parseRupees('0.29')).toEqual(money(29));
    expect(parseRupees('₹1,499.00')).toEqual(money(149900));
    expect(parseRupees('0')).toEqual(money(0));
  });

  it('rejects negative, malformed and over-precise amounts', () => {
    for (const value of ['', '-10', 'abc', '1.234', '1.', '.5', '1e3']) {
      expect(parseRupees(value)).toBeNull();
    }
  });
});
