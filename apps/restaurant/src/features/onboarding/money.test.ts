import { paiseToRupeesText, rupeesToPaise } from './money';

describe('rupeesToPaise', () => {
  it.each([
    ['49', 4900],
    ['49.5', 4950],
    ['49.50', 4950],
    ['1,200', 120000],
    ['₹ 30', 3000],
    ['0', 0],
  ])('%s → %d paise', (input, expected) => {
    expect(rupeesToPaise(input)).toBe(expected);
  });

  it.each(['', 'abc', '-5', '1.234', '1.2.3'])('rejects %p', (input) => {
    expect(rupeesToPaise(input)).toBeNull();
  });
});

describe('paiseToRupeesText', () => {
  it('drops zero paise and pads the rest', () => {
    expect(paiseToRupeesText(5000)).toBe('50');
    expect(paiseToRupeesText(4950)).toBe('49.50');
    expect(paiseToRupeesText(4905)).toBe('49.05');
  });

  it('round-trips', () => {
    for (const value of [0, 1, 99, 100, 12345]) {
      expect(rupeesToPaise(paiseToRupeesText(value))).toBe(value);
    }
  });
});
