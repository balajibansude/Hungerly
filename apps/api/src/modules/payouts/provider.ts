/**
 * Payout provider boundary (RazorpayX). Everything that moves money or verifies a bank
 * account goes through this interface, on the server only. Implementations:
 * - `razorpayx.ts`: the real RazorpayX REST API (test or live keys).
 * - `unconfigured`: no credentials; every money operation refuses with
 *   `payout.provider_unconfigured`. There is deliberately no "fake success" provider
 *   outside of tests.
 */

export type ProviderMode = 'unconfigured' | 'test' | 'live';

export type ProviderPayoutStatus =
  | 'queued'
  | 'pending'
  | 'rejected'
  | 'processing'
  | 'processed'
  | 'cancelled'
  | 'reversed'
  | 'failed';

export interface ProviderPayout {
  id: string;
  status: ProviderPayoutStatus;
  utr: string | null;
  failureReason: string | null;
  referenceId: string | null;
}

export interface ProviderValidation {
  id: string;
  status: 'created' | 'completed' | 'failed';
  accountStatus: 'active' | 'invalid' | null;
  registeredName: string | null;
}

export interface PayoutProvider {
  readonly mode: ProviderMode;
  /** Whether bank account validation (penny drop) is available in this mode. */
  readonly supportsAccountValidation: boolean;
  createContact(input: { referenceId: string; name: string; email: string | null; phone: string | null }): Promise<{ contactId: string }>;
  createFundAccount(input: { contactId: string; holderName: string; ifsc: string; accountNumber: string }): Promise<{ fundAccountId: string }>;
  validateFundAccount(input: { fundAccountId: string; referenceId: string }): Promise<ProviderValidation>;
  getValidation(validationId: string): Promise<ProviderValidation>;
  /** Must be idempotent on `idempotencyKey` (provider-side idempotency header). */
  createPayout(input: {
    fundAccountId: string;
    amountMinor: number;
    idempotencyKey: string;
    referenceId: string;
    narration: string;
  }): Promise<ProviderPayout>;
  getPayout(providerPayoutId: string): Promise<ProviderPayout>;
  /** Verifies a webhook signature over the exact raw request body. */
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean;
}

export class ProviderUnconfiguredError extends Error {
  constructor() {
    super('Payout provider is not configured');
    this.name = 'ProviderUnconfiguredError';
  }
}

export class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** True when the request may have reached the provider (timeouts, 5xx): retry with the same idempotency key. */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ProviderRequestError';
  }
}

export const unconfiguredProvider: PayoutProvider = {
  mode: 'unconfigured',
  supportsAccountValidation: false,
  createContact: async () => { throw new ProviderUnconfiguredError(); },
  createFundAccount: async () => { throw new ProviderUnconfiguredError(); },
  validateFundAccount: async () => { throw new ProviderUnconfiguredError(); },
  getValidation: async () => { throw new ProviderUnconfiguredError(); },
  createPayout: async () => { throw new ProviderUnconfiguredError(); },
  getPayout: async () => { throw new ProviderUnconfiguredError(); },
  verifyWebhookSignature: () => false,
};
