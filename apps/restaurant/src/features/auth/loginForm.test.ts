import {
  describeDestination,
  destinationOf,
  identifierFromParams,
  loginInputError,
  parseLoginInput,
} from './loginForm';

describe('parseLoginInput', () => {
  it('accepts Indian mobile numbers in common formats', () => {
    for (const input of ['98765 43210', '+91 98765 43210', '09876543210']) {
      expect(parseLoginInput('phone', input)).toEqual({
        channel: 'phone',
        phoneE164: '+919876543210',
      });
    }
  });

  it('rejects invalid mobile numbers', () => {
    expect(parseLoginInput('phone', '12345')).toBeNull();
    expect(parseLoginInput('phone', '5876543210')).toBeNull();
  });

  it('accepts and normalises email addresses', () => {
    expect(parseLoginInput('email', ' Owner@Kitchen.Example ')).toEqual({
      channel: 'email',
      email: 'owner@kitchen.example',
    });
    expect(parseLoginInput('email', 'owner@kitchen')).toBeNull();
  });

  it('does not treat a phone number as an email or vice versa', () => {
    expect(parseLoginInput('email', '9876543210')).toBeNull();
    expect(parseLoginInput('phone', 'owner@kitchen.example')).toBeNull();
  });

  it('explains what is expected for each channel', () => {
    expect(loginInputError('phone')).toMatch(/mobile/);
    expect(loginInputError('email')).toMatch(/email/);
  });
});

describe('route params', () => {
  it('round-trips an identifier through string params', () => {
    const phone = { channel: 'phone', phoneE164: '+919876543210' } as const;
    const email = { channel: 'email', email: 'owner@kitchen.example' } as const;
    expect(identifierFromParams(phone.channel, destinationOf(phone))).toEqual(phone);
    expect(identifierFromParams(email.channel, destinationOf(email))).toEqual(email);
  });

  it('rejects missing or invalid params', () => {
    expect(identifierFromParams(undefined, '+919876543210')).toBeNull();
    expect(identifierFromParams('fax', '+919876543210')).toBeNull();
    expect(identifierFromParams('phone', undefined)).toBeNull();
    expect(identifierFromParams('email', 'not-an-email')).toBeNull();
  });
});

describe('describeDestination', () => {
  it('names the channel and a readable destination', () => {
    expect(describeDestination({ channel: 'phone', phoneE164: '+919876543210' })).toBe(
      'by SMS to +91 98765 43210',
    );
    expect(describeDestination({ channel: 'email', email: 'owner@kitchen.example' })).toBe(
      'by email to owner@kitchen.example',
    );
  });
});
