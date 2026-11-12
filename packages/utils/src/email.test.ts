import { isValidEmail, normalizeEmail } from './email';

describe('email', () => {
  it('normalizes case and surrounding spaces', () => {
    expect(normalizeEmail('  Owner@MasalaJunction.Example ')).toBe('owner@masalajunction.example');
  });

  it('accepts ordinary addresses', () => {
    expect(isValidEmail('owner@masalajunction.example')).toBe(true);
    expect(isValidEmail(' a.b+orders@kitchen.co.in ')).toBe(true);
  });

  it('rejects incomplete or malformed addresses', () => {
    for (const value of ['', 'owner', 'owner@', '@kitchen.in', 'owner@kitchen', 'a b@kitchen.in']) {
      expect(isValidEmail(value)).toBe(false);
    }
  });

  it('rejects addresses longer than 254 characters', () => {
    expect(isValidEmail(`${'a'.repeat(250)}@x.in`)).toBe(false);
  });
});
