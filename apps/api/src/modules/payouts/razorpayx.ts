import type { Config } from '../../config';
import { hmacHex, safeEqual } from '../../lib/crypto';
import {
  ProviderRequestError,
  unconfiguredProvider,
  type PayoutProvider,
  type ProviderPayout,
  type ProviderPayoutStatus,
  type ProviderValidation,
} from './provider';

/**
 * RazorpayX Payouts over its REST API (https://razorpay.com/docs/api/x/).
 * - Contacts → Fund accounts (bank_account) → Payouts, Basic auth with key id/secret.
 * - Payouts are idempotent via the `X-Payout-Idempotency` header (we pass our payout id).
 * - Webhooks: HMAC-SHA256 of the raw body with the webhook secret, in `X-Razorpay-Signature`.
 * - Account validation (penny drop) is not available in test mode, so in test mode bank
 *   accounts are left for finance review instead of being reported as verified.
 *
 * Mode comes from the key prefix: `rzp_test_` = sandbox (no real money), `rzp_live_` = live.
 */

const PAYOUT_STATUSES: ProviderPayoutStatus[] = [
  'queued',
  'pending',
  'rejected',
  'processing',
  'processed',
  'cancelled',
  'reversed',
  'failed',
];

interface RazorpayPayoutEntity {
  id: string;
  status: string;
  utr?: string | null;
  reference_id?: string | null;
  status_details?: { description?: string | null; reason?: string | null } | null;
  failure_reason?: string | null;
}

export function mapPayoutEntity(entity: RazorpayPayoutEntity): ProviderPayout {
  const status = PAYOUT_STATUSES.includes(entity.status as ProviderPayoutStatus)
    ? (entity.status as ProviderPayoutStatus)
    : 'processing';
  return {
    id: entity.id,
    status,
    utr: entity.utr ?? null,
    referenceId: entity.reference_id ?? null,
    failureReason: entity.status_details?.description ?? entity.failure_reason ?? null,
  };
}

interface RazorpayValidationEntity {
  id: string;
  status: string;
  results?: { account_status?: string | null; registered_name?: string | null } | null;
}

export function mapValidationEntity(entity: RazorpayValidationEntity): ProviderValidation {
  const status = entity.status === 'completed' || entity.status === 'failed' ? entity.status : 'created';
  const accountStatus = entity.results?.account_status;
  return {
    id: entity.id,
    status,
    accountStatus: accountStatus === 'active' || accountStatus === 'invalid' ? accountStatus : null,
    registeredName: entity.results?.registered_name || null,
  };
}

export function verifyRazorpaySignature(secret: string, rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature) return false;
  return safeEqual(hmacHex(secret, rawBody), signature);
}

export function createRazorpayXProvider(
  options: {
    keyId: string;
    keySecret: string;
    accountNumber: string;
    webhookSecret: string | undefined;
    payoutMode: 'IMPS' | 'NEFT' | 'RTGS';
    baseUrl: string;
  },
  fetchImpl: typeof fetch = fetch,
): PayoutProvider {
  const mode = options.keyId.startsWith('rzp_live_') ? 'live' : 'test';
  const auth = `Basic ${Buffer.from(`${options.keyId}:${options.keySecret}`).toString('base64')}`;

  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${options.baseUrl}${path}`, {
        method,
        headers: { Authorization: auth, 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      // The request may or may not have reached RazorpayX: retry with the same idempotency key.
      throw new ProviderRequestError(`RazorpayX unreachable: ${(error as Error).message}`, null, true);
    }
    const text = await response.text();
    if (!response.ok) {
      let description = text.slice(0, 300);
      try {
        description = (JSON.parse(text) as { error?: { description?: string } }).error?.description ?? description;
      } catch {
        // keep raw text
      }
      throw new ProviderRequestError(`RazorpayX ${response.status}: ${description}`, response.status, response.status >= 500);
    }
    return JSON.parse(text) as T;
  }

  return {
    mode,
    supportsAccountValidation: mode === 'live',

    async createContact({ referenceId, name, email, phone }) {
      const contact = await call<{ id: string }>('POST', '/v1/contacts', {
        name,
        type: 'vendor',
        reference_id: referenceId.slice(0, 40),
        ...(email ? { email } : {}),
        ...(phone ? { contact: phone.replace(/^\+91/, '') } : {}),
      });
      return { contactId: contact.id };
    },

    async createFundAccount({ contactId, holderName, ifsc, accountNumber }) {
      const account = await call<{ id: string }>('POST', '/v1/fund_accounts', {
        contact_id: contactId,
        account_type: 'bank_account',
        bank_account: { name: holderName, ifsc, account_number: accountNumber },
      });
      return { fundAccountId: account.id };
    },

    async validateFundAccount({ fundAccountId, referenceId }) {
      const entity = await call<RazorpayValidationEntity>('POST', '/v1/fund_accounts/validations', {
        account_number: options.accountNumber,
        fund_account: { id: fundAccountId },
        amount: 100,
        currency: 'INR',
        notes: { reference: referenceId.slice(0, 200) },
      });
      return mapValidationEntity(entity);
    },

    async getValidation(validationId) {
      return mapValidationEntity(await call<RazorpayValidationEntity>('GET', `/v1/fund_accounts/validations/${validationId}`));
    },

    async createPayout({ fundAccountId, amountMinor, idempotencyKey, referenceId, narration }) {
      const entity = await call<RazorpayPayoutEntity>(
        'POST',
        '/v1/payouts',
        {
          account_number: options.accountNumber,
          fund_account_id: fundAccountId,
          amount: amountMinor,
          currency: 'INR',
          mode: options.payoutMode,
          purpose: 'payout',
          queue_if_low_balance: true,
          reference_id: referenceId.slice(0, 40),
          narration: narration.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 30),
        },
        { 'X-Payout-Idempotency': idempotencyKey },
      );
      return mapPayoutEntity(entity);
    },

    async getPayout(providerPayoutId) {
      return mapPayoutEntity(await call<RazorpayPayoutEntity>('GET', `/v1/payouts/${providerPayoutId}`));
    },

    verifyWebhookSignature(rawBody, signature) {
      if (!options.webhookSecret) return false;
      return verifyRazorpaySignature(options.webhookSecret, rawBody, signature);
    },
  };
}

export function createPayoutProvider(config: Config): PayoutProvider {
  if (!config.RAZORPAYX_KEY_ID || !config.RAZORPAYX_KEY_SECRET || !config.RAZORPAYX_ACCOUNT_NUMBER) {
    return unconfiguredProvider;
  }
  return createRazorpayXProvider({
    keyId: config.RAZORPAYX_KEY_ID,
    keySecret: config.RAZORPAYX_KEY_SECRET,
    accountNumber: config.RAZORPAYX_ACCOUNT_NUMBER,
    webhookSecret: config.RAZORPAYX_WEBHOOK_SECRET,
    payoutMode: config.RAZORPAYX_PAYOUT_MODE,
    baseUrl: config.RAZORPAYX_BASE_URL,
  });
}
