# ADR-009: Razorpay as payment provider

- Status: Proposed — amended by [ADR-011](ADR-011-react-native-expo.md): the customer app uses Razorpay's React Native SDK instead of the Flutter SDK
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

## Amendment (2026-10-01)
This ADR was written when the mobile apps were planned in Flutter ([ADR-005](ADR-005-mobile-framework.md)). [ADR-011](ADR-011-react-native-expo.md) replaced Flutter with React Native + Expo + TypeScript. The decision above is unchanged: Razorpay remains the provider, behind the same `PaymentGateway` interface. Only the client integration changes: the customer app uses Razorpay's React Native SDK, added through an Expo config plugin in a development build (it is not available in Expo Go), as described in [BLUEPRINT.md](../BLUEPRINT.md). The Flutter SDK references above are kept as the original record.
