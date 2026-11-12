import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { ProviderRequestError } from '../src/modules/payouts/provider';
import { createPayoutProvider, createRazorpayXProvider } from '../src/modules/payouts/razorpayx';
import { testConfig } from './harness';

interface Captured {
  url: string;
  init: RequestInit;
}

function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: Captured[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const options = {
  keyId: 'rzp_test_abc',
  keySecret: 'secret',
  accountNumber: '7878780080316316',
  webhookSecret: 'whsec',
  payoutMode: 'IMPS' as const,
  baseUrl: 'https://api.razorpay.com',
};

describe('RazorpayX provider (request mapping)', () => {
  it('creates payouts with Basic auth and the idempotency header', async () => {
    const { calls, impl } = fakeFetch([
      { status: 200, body: { id: 'pout_1', status: 'processing', utr: null, reference_id: 'ref-1' } },
    ]);
    const provider = createRazorpayXProvider(options, impl);
    expect(provider.mode).toBe('test');
    expect(provider.supportsAccountValidation).toBe(false);
    const payout = await provider.createPayout({
      fundAccountId: 'fa_1',
      amountMinor: 50_000,
      idempotencyKey: 'key-1',
      referenceId: 'ref-1',
      narration: 'Swaadone payout #1!',
    });
    expect(payout).toEqual({ id: 'pout_1', status: 'processing', utr: null, referenceId: 'ref-1', failureReason: null });
    const [call] = calls;
    expect(call!.url).toBe('https://api.razorpay.com/v1/payouts');
    expect(call!.init.method).toBe('POST');
    const headers = call!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('rzp_test_abc:secret').toString('base64')}`);
    expect(headers['X-Payout-Idempotency']).toBe('key-1');
    expect(JSON.parse(call!.init.body as string)).toEqual({
      account_number: '7878780080316316',
      fund_account_id: 'fa_1',
      amount: 50_000,
      currency: 'INR',
      mode: 'IMPS',
      purpose: 'payout',
      queue_if_low_balance: true,
      reference_id: 'ref-1',
      narration: 'Swaadone payout 1',
    });
  });

  it('maps pending to approval, failures to readable reasons and live keys to live mode', async () => {
    const { impl } = fakeFetch([
      { status: 200, body: { id: 'pout_2', status: 'reversed', status_details: { description: 'Beneficiary bank offline' } } },
    ]);
    const provider = createRazorpayXProvider({ ...options, keyId: 'rzp_live_abc' }, impl);
    expect(provider.mode).toBe('live');
    expect(provider.supportsAccountValidation).toBe(true);
    const payout = await provider.getPayout('pout_2');
    expect(payout.status).toBe('reversed');
    expect(payout.failureReason).toBe('Beneficiary bank offline');
  });

  it('classifies errors as retryable only when the request may have gone through', async () => {
    const { impl } = fakeFetch([
      { status: 400, body: { error: { description: 'Invalid fund account' } } },
      { status: 503, body: {} },
    ]);
    const provider = createRazorpayXProvider(options, impl);
    const args = { fundAccountId: 'fa', amountMinor: 100, idempotencyKey: 'k', referenceId: 'r', narration: 'n' };
    await expect(provider.createPayout(args)).rejects.toMatchObject({ retryable: false, status: 400 });
    await expect(provider.createPayout(args)).rejects.toMatchObject({ retryable: true, status: 503 });
    const network = createRazorpayXProvider(options, (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch);
    await expect(network.createPayout(args)).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it('creates fund accounts and validations with the documented bodies', async () => {
    const { calls, impl } = fakeFetch([
      { status: 200, body: { id: 'cont_1' } },
      { status: 200, body: { id: 'fa_1' } },
      { status: 200, body: { id: 'fav_1', status: 'created', results: { account_status: null, registered_name: null } } },
    ]);
    const provider = createRazorpayXProvider({ ...options, keyId: 'rzp_live_x' }, impl);
    await provider.createContact({ referenceId: 'branch-1', name: 'Kitchen', email: null, phone: '+919876543210' });
    await provider.createFundAccount({ contactId: 'cont_1', holderName: 'Kitchen', ifsc: 'HDFC0001234', accountNumber: '123456789012' });
    const validation = await provider.validateFundAccount({ fundAccountId: 'fa_1', referenceId: 'acc-1' });
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.razorpay.com/v1/contacts',
      'https://api.razorpay.com/v1/fund_accounts',
      'https://api.razorpay.com/v1/fund_accounts/validations',
    ]);
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({ type: 'vendor', contact: '9876543210' });
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual({
      contact_id: 'cont_1',
      account_type: 'bank_account',
      bank_account: { name: 'Kitchen', ifsc: 'HDFC0001234', account_number: '123456789012' },
    });
    expect(JSON.parse(calls[2]!.init.body as string)).toMatchObject({ fund_account: { id: 'fa_1' }, amount: 100, currency: 'INR' });
    expect(validation).toEqual({ id: 'fav_1', status: 'created', accountStatus: null, registeredName: null });
  });

  it('verifies webhook signatures over the raw body', () => {
    const provider = createRazorpayXProvider(options, fetch);
    const body = Buffer.from('{"event":"payout.processed"}');
    const good = createHmac('sha256', 'whsec').update(body).digest('hex');
    expect(provider.verifyWebhookSignature(body, good)).toBe(true);
    expect(provider.verifyWebhookSignature(body, good.replace(/.$/, '0'))).toBe(false);
    expect(provider.verifyWebhookSignature(body, undefined)).toBe(false);
    const noSecret = createRazorpayXProvider({ ...options, webhookSecret: undefined }, fetch);
    expect(noSecret.verifyWebhookSignature(body, good)).toBe(false);
  });

  it('is unconfigured without credentials', () => {
    expect(createPayoutProvider(testConfig()).mode).toBe('unconfigured');
    expect(() => testConfig({ RAZORPAYX_KEY_ID: 'rzp_test_x' })).toThrow(/together/);
  });
});
