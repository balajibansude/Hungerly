import { UpdateBranchSchema } from '@hungerly/api-client';

import { zodFieldErrors } from './validation';

describe('zodFieldErrors', () => {
  it('returns nothing for valid input', () => {
    expect(zodFieldErrors(UpdateBranchSchema.safeParse({ name: 'Masala Junction' }))).toEqual({});
  });

  it('keys messages by dotted path, first message only', () => {
    const errors = zodFieldErrors(
      UpdateBranchSchema.safeParse({
        name: 'M',
        address: { line1: '12 MG Road', line2: null, locality: 'Indiranagar', city: 'Bengaluru', state: 'Karnataka', postalCode: '012' },
      }),
    );
    expect(Object.keys(errors).sort()).toEqual(['address.postalCode', 'name']);
    expect(errors['address.postalCode']).toBe('Enter a 6-digit PIN code');
  });
});
