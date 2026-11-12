import { createServices } from './ServicesProvider';

// The real auth service loads the token store; keep the keychain in memory.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const MOCK_ONLY = ['catalog', 'restaurants', 'foods', 'location', 'orders', 'favorites', 'offers'] as const;

describe('createServices', () => {
  it('uses the mock for everything in mock mode', async () => {
    const services = createServices(true);
    // The mock signs in with the prototype code; the real service would call the API.
    const challenge = await services.auth.requestOtp('+919876543210');
    await expect(services.auth.verifyOtp(challenge.requestId, '123456')).resolves.toMatchObject({
      user: { phoneE164: '+919876543210' },
    });
  });

  it('keeps every non-auth service on the mocks when mock mode is off', () => {
    const mock = createServices(true);
    const real = createServices(false);
    expect(Object.keys(real).sort()).toEqual(Object.keys(mock).sort());
    // Same mock shape for every other service…
    for (const key of MOCK_ONLY) {
      expect(Object.keys(real[key]).sort()).toEqual(Object.keys(mock[key]).sort());
    }
  });

  it('routes real auth through the API client instead of the mock', async () => {
    // No EXPO_PUBLIC_API_URL in tests, so the shared client refuses every call: the real
    // service surfaces that as a network error, where the mock would have succeeded.
    const real = createServices(false);
    await expect(real.auth.requestOtp('+919876543210')).rejects.toMatchObject({ code: 'network' });
  });
});
