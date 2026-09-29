# ADR-009: Razorpay as payment provider

- Status: Proposed
- Date: 2026-09-29

## Context
The pilot launches in India (assumption). Customers expect UPI (intent/collect), cards, netbanking and wallets. The platform must refund reliably and later split payments between Hungerly, restaurants and delivery partners.

## Decision
Integrate **Razorpay** (Orders API, Checkout SDK for Flutter, webhooks, Refunds API) behind a `PaymentGateway` interface in `backend/app/integrations/payments/`. Auto-capture enabled. Settlements to restaurants are manual for the pilot; **Razorpay Route** (marketplace splits) evaluated post-MVP. Security requirements in [SECURITY.md](../SECURITY.md#payment-security).

## Alternatives considered
- **Cashfree:** competitive pricing and payouts product; strong alternative and candidate as a second gateway.
- **PayU:** established, but SDK/developer experience considered weaker for our stack.
- **Stripe:** excellent developer experience, but more limited India-specific payment methods and marketplace features in India.
- **Building direct UPI integrations:** requires payment aggregator licensing; not feasible.

## Consequences
- ➕ Broad India payment methods, mature Flutter SDK, webhooks and refunds, a path to marketplace splits.
- ➖ Business KYC with the provider is required before live mode (start early); provider outage affects online payments — mitigated by clear failure UX, optional COD (flagged) and a second gateway later.
- Cost: per-transaction fees (MDR; UPI pricing subject to regulation), no fixed fee. Scalability: provider-scaled.
