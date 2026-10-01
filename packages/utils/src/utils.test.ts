import { formatCount, formatDistance, formatMinutesRange, formatRating } from './format';
import { addMoney, formatMoney, money, multiplyMoney, sumMoney } from './money';
import { formatE164India, isValidIndianMobile, toE164India } from './phone';

describe('money', () => {
  it('formats whole rupees without decimals', () => {
    expect(formatMoney(money(24900))).toBe('₹249');
  });

  it('formats paise with two decimals', () => {
    expect(formatMoney(money(24950))).toBe('₹249.50');
    expect(formatMoney(money(5))).toBe('₹0.05');
  });

  it('uses Indian digit grouping', () => {
    expect(formatMoney(money(12499900))).toBe('₹1,24,999');
    expect(formatMoney(money(10000000000))).toBe('₹10,00,00,000');
  });

  it('formats negative amounts', () => {
    expect(formatMoney(money(-5000))).toBe('−₹50');
  });

  it('adds, multiplies and sums integer minor units', () => {
    expect(addMoney(money(100), money(250))).toEqual(money(350));
    expect(multiplyMoney(money(24900), 3)).toEqual(money(74700));
    expect(sumMoney([money(1), money(2), money(3)])).toEqual(money(6));
    expect(sumMoney([])).toEqual(money(0));
  });

  it('rejects non-integer amounts', () => {
    expect(() => money(10.5)).toThrow();
    expect(() => multiplyMoney(money(100), 1.5)).toThrow();
  });
});

describe('format', () => {
  it('formats distance', () => {
    expect(formatDistance(843)).toBe('840 m');
    expect(formatDistance(2400)).toBe('2.4 km');
    expect(formatDistance(12600)).toBe('13 km');
  });

  it('formats minute ranges', () => {
    expect(formatMinutesRange({ min: 25, max: 35 })).toBe('25–35 min');
    expect(formatMinutesRange({ min: 20, max: 20 })).toBe('20 min');
  });

  it('formats ratings and counts', () => {
    expect(formatRating(4.26)).toBe('4.3');
    expect(formatCount(980)).toBe('980');
    expect(formatCount(1240)).toBe('1.2k');
    expect(formatCount(3000)).toBe('3k');
    expect(formatCount(15400)).toBe('15k');
  });
});

describe('phone', () => {
  it('accepts valid Indian mobiles in common formats', () => {
    expect(isValidIndianMobile('9876543210')).toBe(true);
    expect(isValidIndianMobile('+91 98765 43210')).toBe(true);
    expect(isValidIndianMobile('09876543210')).toBe(true);
  });

  it('rejects invalid numbers', () => {
    expect(isValidIndianMobile('5876543210')).toBe(false);
    expect(isValidIndianMobile('98765')).toBe(false);
    expect(isValidIndianMobile('')).toBe(false);
  });

  it('converts to and formats E.164', () => {
    expect(toE164India('98765 43210')).toBe('+919876543210');
    expect(formatE164India('+919876543210')).toBe('+91 98765 43210');
    expect(() => toE164India('123')).toThrow();
  });
});
