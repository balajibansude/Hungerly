import { randomUUID } from 'node:crypto';

import { documents, orders } from '../src/db/schema';
import { hmacHex } from '../src/lib/crypto';
import {
  ProviderRequestError,
  type PayoutProvider,
  type ProviderPayout,
  type ProviderPayoutStatus,
  type ProviderValidation,
} from '../src/modules/payouts/provider';
import { verifyRazorpaySignature } from '../src/modules/payouts/razorpayx';
import { postOrderEarnings } from '../src/modules/wallet/ledger';
import type { TestContext } from './harness';

export const WEBHOOK_SECRET = 'whsec_test_only';

/**
 * TEST-ONLY fake of the RazorpayX provider. Behaves like the real API where it matters:
 * createPayout is idempotent on the key, webhooks use the real HMAC check. Never used
 * outside tests.
 */
export class FakePayoutProvider implements PayoutProvider {
  mode: 'test' | 'live';
  supportsAccountValidation: boolean;
  payoutStatus: ProviderPayoutStatus = 'queued';
  failNext: ProviderRequestError | null = null;
  validationResult: ProviderValidation['accountStatus'] = 'active';
  readonly calls: { method: string; args: unknown }[] = [];
  readonly payouts = new Map<string, ProviderPayout>();
  private validations = new Map<string, ProviderValidation>();
  private counter = 0;

  constructor(mode: 'test' | 'live' = 'test') {
    this.mode = mode;
    this.supportsAccountValidation = mode === 'live';
  }

  private record(method: string, args: unknown) {
    this.calls.push({ method, args });
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
  }

  callsOf(method: string) {
    return this.calls.filter((c) => c.method === method);
  }

  async createContact(args: { referenceId: string }) {
    this.record('createContact', args);
    return { contactId: `cont_${++this.counter}` };
  }

  async createFundAccount(args: { contactId: string; accountNumber: string }) {
    this.record('createFundAccount', args);
    return { fundAccountId: `fa_${++this.counter}` };
  }

  async validateFundAccount(args: { fundAccountId: string }) {
    this.record('validateFundAccount', args);
    const validation: ProviderValidation = { id: `fav_${++this.counter}`, status: 'created', accountStatus: null, registeredName: null };
    this.validations.set(validation.id, validation);
    return validation;
  }

  async getValidation(id: string) {
    this.record('getValidation', { id });
    return {
      id,
      status: this.validationResult === 'active' ? ('completed' as const) : ('failed' as const),
      accountStatus: this.validationResult,
      registeredName: this.validationResult === 'active' ? 'TEST KITCHENS PVT LTD' : null,
    };
  }

  async createPayout(args: { idempotencyKey: string; referenceId: string; amountMinor: number }) {
    this.record('createPayout', args);
    const existing = this.payouts.get(args.idempotencyKey);
    if (existing) return existing;
    const payout: ProviderPayout = {
      id: `pout_${++this.counter}`,
      status: this.payoutStatus,
      utr: null,
      failureReason: null,
      referenceId: args.referenceId,
    };
    this.payouts.set(args.idempotencyKey, payout);
    return payout;
  }

  async getPayout(id: string) {
    this.record('getPayout', { id });
    const found = [...this.payouts.values()].find((p) => p.id === id);
    if (!found) throw new ProviderRequestError('not found', 404, false);
    return found;
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined) {
    return verifyRazorpaySignature(WEBHOOK_SECRET, rawBody, signature);
  }
}

export function signWebhook(body: string): string {
  return hmacHex(WEBHOOK_SECRET, body);
}

let orderCounter = 0;

/**
 * Inserts a delivered order and posts its earnings through the real ledger code. With the
 * default 20% commission and 18% GST on commission, a ₹1,000 subtotal nets ₹764.
 */
export async function createDeliveredOrder(
  ctx: TestContext,
  branchId: string,
  options: { subtotalMinor?: number; restaurantDiscountMinor?: number; deliveredAt?: Date } = {},
) {
  const subtotal = options.subtotalMinor ?? 100_000;
  const discount = options.restaurantDiscountMinor ?? 0;
  const deliveredAt = options.deliveredAt ?? ctx.clock.now;
  orderCounter += 1;
  const [order] = await ctx.db
    .insert(orders)
    .values({
      orderNumber: `HGR-T${String(orderCounter).padStart(5, '0')}${randomUUID().slice(0, 4)}`,
      branchId,
      customerFirstName: 'Asha',
      status: 'delivered',
      paymentMethod: 'online',
      paymentStatus: 'paid',
      subtotalMinor: subtotal,
      discountMinor: discount,
      restaurantDiscountMinor: discount,
      totalMinor: subtotal - discount,
      placedAt: new Date(deliveredAt.getTime() - 45 * 60_000),
      deliveredAt,
    })
    .returning();
  await postOrderEarnings(ctx.db, ctx.config, order!.id, deliveredAt);
  return order!;
}

/** Adds an approved bank-proof document (what finance checks before verifying an account). */
export async function approveBankProof(ctx: TestContext, branchId: string, userId: string) {
  await ctx.db.insert(documents).values({
    branchId,
    type: 'bank_proof',
    storageKey: `documents/${branchId}/proof.pdf`,
    fileName: 'cancelled-cheque.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1000,
    sha256: 'x'.repeat(64),
    status: 'approved',
    submittedBy: userId,
    reviewedAt: ctx.clock.now,
  });
}

export const DAY = 86_400_000;
