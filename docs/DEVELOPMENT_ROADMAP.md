# Hungerly — Development Roadmap

> Status: **Draft v0.2.** Phase 0 complete (pending approval); Phase 1A (frontend foundation + customer app prototype) implemented on `feature/p1-customer-foundation`; restaurant app prototype in progress on `feature/p2-restaurant-foundation`. No later phase starts until the blueprint is approved and the previous phase's acceptance criteria are met (phases may overlap where dependencies allow, as noted).

Related: [BLUEPRINT.md](BLUEPRINT.md) §59–§61 · [FRONTEND_BLUEPRINT.md](FRONTEND_BLUEPRINT.md) · [API_BLUEPRINT.md](API_BLUEPRINT.md)

## How we work

- **Vertical slices:** from Phase 2 onward, each phase delivers backend + the client screens that use it, so every phase ends with something demonstrable on real devices against a real backend. No throwaway mock backends.
- **Contract first inside a phase:** endpoint schemas are defined (OpenAPI) at the start of a slice; the TypeScript client is generated so backend and frontend can proceed in parallel.
- **Frontend ahead on mocks:** the mobile apps are built against **service interfaces** with in-memory mock implementations (`src/services/mock`). Order agreed by the project owner: **customer app → restaurant app → delivery app → admin dashboard**. Each app is later connected by swapping the mock services for API-client implementations — screens do not change.
- **Branches:** each task is a feature branch (`feature/<phase>-<short-name>`) from the developer's branch (`balaji` or `teammate`), merged back by PR; the developer branch is PR'd into `main` when a coherent set of work is complete and CI is green.
- **Suggested split:** one developer leans backend + admin, the other leans the Expo apps; both review each other's PRs. Adjust per phase.
- **Definition of Done:** BLUEPRINT §61 applies to every task.

## Phase overview

| Phase | Name | Depends on | Milestone |
|---|---|---|---|
| 0 | Architecture & blueprint | — | M0 |
| 1 | Project foundation | 0 | M1 |
| 2 | Authentication & accounts | 1 | M2 |
| 3 | Restaurant onboarding & menu management | 2 | M3 |
| 4 | Customer discovery & cart | 3 | — |
| 5 | Ordering & order management | 4 | M4 |
| 6 | Payments | 5 | M5 |
| 7 | Delivery & dispatch | 5 (6 in parallel) | M6 (with 9) |
| 8 | Admin dashboard | 2 (grows with 3–7) | M7 |
| 9 | Notifications & realtime | 5 (grows with 6–7) | M6 |
| 10 | Testing & quality hardening | 1–9 (continuous) | — |
| 11 | Deployment & launch readiness | 1–10 | M8 |
| 12 | Production hardening | 11 | M9 |

Note on the requested order: the original outline placed "Customer application" before "Ordering" and "Admin" late. Here the restaurant/menu slice (Phase 3) comes before customer discovery because customers cannot browse without restaurants and menus, and a **minimal admin** (restaurant/partner approval) is built inside Phases 3 and 7 rather than waiting for Phase 8. Phase 8 completes the admin dashboard.

---

## Phase 0 — Architecture & blueprint

**Objectives:** agree on product scope, architecture and conventions before writing code.

**Tasks**
- Clean repository, initialise Git with `main`, `balaji`, `teammate`, `docs/blueprint` branches.
- Write BLUEPRINT, DATABASE_SCHEMA, API_BLUEPRINT, FRONTEND_BLUEPRINT, DEVELOPMENT_ROADMAP, SECURITY, ADRs, README.
- Review with both developers; assign owners and dates for open decisions (BLUEPRINT §63).

**Dependencies:** none.
**Deliverables:** `docs/` set, README, ADR-001…010.
**Acceptance criteria**
- All documents reviewed; comments resolved or recorded as open decisions.
- Blueprint approved by the project owner.
- `docs/blueprint` merged via PR into `balaji` and then into `main`.

---

## Phase 1 — Project foundation

Split into **1A — frontend foundation** (done) and **1B — platform foundation** (remaining).

### Phase 1A — Frontend foundation + customer app prototype ✅

**Objectives:** a production-quality frontend foundation and a navigable customer app prototype on mock data, independent of the backend technology.

**Delivered** (see [frontend/CUSTOMER_APP.md](frontend/CUSTOMER_APP.md)):
- pnpm + Turborepo workspace (ADR-012); shared `@hungerly/config`, `@hungerly/types`, `@hungerly/utils`, `@hungerly/ui`.
- Hungerly design system: contrast-checked colour tokens, typography, spacing, radius, elevation, motion; accessible components.
- `apps/customer` (Expo SDK 57, Expo Router): splash gate, onboarding, phone login + OTP (prototype code), profile setup, tabs (Home, Search, Orders, Account), restaurant listing with filters/sort, restaurant menu, dish customisation, local cart with estimated bill.
- Service contracts + mock implementations (the backend boundary); unit tests for pricing, option selection, cart store, entry routing and mocks.

**Acceptance criteria (met):** `pnpm lint`, `pnpm typecheck`, `pnpm test` pass; `expo-doctor` passes; Android and iOS production bundles build with `expo export`; full journey exercised in a rendered build with no console errors.

**Device verification:** the full customer journey was smoke-tested on a physical Android phone in Expo Go (2026-10-02, after the shared-package extraction) with no visible issues and no Metro errors. Not yet verified: iOS devices and an Android development build (Phase 1B).

### Restaurant app prototype (frontend ahead on mocks) — in progress

Built in stages on `feature/p2-restaurant-foundation`, against mock services like the customer app (screen specs: [FRONTEND_BLUEPRINT.md §4](FRONTEND_BLUEPRINT.md#4-restaurant-partner-application-screens)). Order statuses follow the database state machine — no separate "accepted" status.

| Stage | Scope | Status |
|---|---|---|
| 1 | Shared packages: `@hungerly/app-core`; partner types; opening hours, order state machine and bill rules in `@hungerly/utils`; `OtpInput`, `BrandSplash`, `Switch`, `OrderStatusBadge` in `@hungerly/ui` | ✅ customer app unchanged; customer regression passed on physical Android (2026-10-02) |
| 2 | `apps/restaurant` scaffold, Expo Router shell (Dashboard · Orders · Menu · Insights · More), phone/email OTP login (R1), session + route guards, restaurant profile loading, log out | ✅ verified on physical Android in Expo Go (2026-10-02): splash → login, phone and email OTP, demo restaurant → workspace, new account → onboarding entry; no Metro errors |
| 3 | Restaurant registration / onboarding (R3): 7 steps — restaurant details → owner/manager → address → contact → operations (weekly hours incl. overnight, prep time, minimum order) → review (edit any section, full re-validation) → completion; one in-memory draft store; `OnboardingService.completeRegistration` with idempotency key; new restaurant + membership in the shared mock state | ✅ verified on physical Android in Expo Go (2026-10-02): new account (98123 45678) registered end to end, review edits, completion → workspace, More shows the new restaurant, log out/in keeps the membership, Masala Junction demo unaffected; no Metro errors |
| 4 | Orders (R8, R9): order board (New · Preparing · Ready for pickup · Completed · Cancelled, with counts, pull to refresh, loading/empty/error states, two columns on tablets), order detail (items, options, notes, stored bill, customer, delivery, history), accept with prep time, reject with reason, mark ready; `OrderService` with version checks on the shared mock state; every move through the shared state machine | ✅ verified on physical Android in Expo Go (2026-10-02): demo restaurant → accept with prep time → preparing → mark ready → ready for pickup; another order rejected → cancelled; board updated; other tabs, log out/in unaffected; no Metro errors. Checks: 222 tests, typecheck, lint, Prettier, restaurant dev + production Android bundles, customer production Android bundle (unchanged) |
| 5 | Menu management (R11–R13): categories, items, item editor, availability | Next |
| 6 | Dashboard, insights, notifications, profile, hours and availability; new-order alert (R6) | Planned |

Prototype decisions in stage 3 (to revisit with the backend):

- A completed registration is **`pending_review`** with `isAcceptingOrders = false` (BLUEPRINT §26); nothing approves it in the prototype.
- The registrant chooses **Owner or Manager** and the chosen role is stored. This conflicts with API_BLUEPRINT §3.5 ("caller becomes owner") and the one-active-owner rule — recorded as **OD-25**.
- Restaurant email is optional (`restaurants.email` is nullable); phone is required. City/state are not defaulted (pilot city is OD-02).
- Not collected yet: map location (`restaurants.location` is NN in the schema), KYC documents, split-shift hours (one slot per day in the form).

Prototype limitations in stage 4:

- No live updates: orders do not arrive while the board is open; it refreshes when the screen regains focus and on pull to refresh. No new-order alert or sound (R6), and no auto-cancel of unaccepted orders.
- No order history paging or date filters (R10) and no "delay" action.
- In memory only: restarting the app restores the seeded demo orders. Only the demo restaurant (already `active`) has orders; new registrations stay `pending_review` with none.
- Order messages such as "the customer is told" and "the customer's refund has started" describe what the backend is expected to do; the prototype sends nothing and moves no money (rejecting a paid order only sets `payment_status = refund_pending`).

Open product/business decisions from stage 4 (mock placeholders, **not approved requirements**):

- Tax and fees in the mock orders — 5% tax on food and a ₹5 platform fee — are placeholders; tax rules are OD-04 and the fee model OD-03.
- Cancellation and rejection wording ("Rejected: item out of stock", "Cancelled by the customer", the mock reason "customer changed mind") is prototype copy to be confirmed.
- Accept-time prep choices reuse the registration options (10–60 min) while the API allows 5–90; the offered choices need a product decision.
- Still open from earlier stages: OD-25 (registrant role), per-item prep times, code repeated between the customer and restaurant apps.

### Phase 1B — Platform foundation

**Objectives:** backend skeleton, contract pipeline, CI and staging so apps can be connected.

**Tasks**
- Resolve OD-24 (backend platform) first; then backend skeleton accordingly (app factory, settings, logging, errors, health, DB, migrations, outbox, workers).
- Local infrastructure: `infra/docker/compose.yaml` (PostgreSQL + PostGIS, Redis, MinIO, Mailpit) if the FastAPI path is kept.
- Contract pipeline: OpenAPI export → `contracts/openapi.json` → `@hungerly/api-client` generation; CI drift check.
- CI workflows (apps: turbo lint/typecheck/test + expo-doctor + expo export; backend; security; docs) with path filters; branch protection; CODEOWNERS; PR template.
- EAS project setup: development builds for Android/iOS; environment variables via `EXPO_PUBLIC_*` per environment.
- Staging environment for the backend (OD-01).
- **Technical spikes** (time-boxed, development build on 2–3 popular Android devices): background location with `expo-location` + `expo-task-manager`; high-priority push with custom sound on a tablet; Razorpay React Native SDK test checkout.

**Dependencies:** Phase 0 approval; OD-01, OD-19, OD-20, OD-23, OD-24.
**Deliverables:** backend skeleton, CI, staging, EAS dev builds, spike reports in `docs/spikes/`.
**Acceptance criteria**
- A new contributor can follow the README to run the backend (if applicable) and the customer app.
- The customer app runs as a development build on a physical Android device.
- CI blocks merges on lint/type/test failures; OpenAPI drift check works.
- Spikes documented with go/no-go findings.

---

## Phase 2 — Authentication & accounts

**Objectives:** secure identity for all four apps.

**Tasks**
- Backend: `users`, `user_roles`, `auth_sessions`, `device_tokens`, `customer_profiles`, `admin_profiles` migrations; OTP request/verify (SMS adapter: MSG91 + local console adapter), JWT issuance (Ed25519, key rotation via `kid`), refresh rotation with reuse detection, logout, session list/revoke, Redis deny-list, admin email+password (Argon2id) + TOTP enrolment/verification, rate limits, audit events, `/me` endpoints, account deletion request.
- Mobile (`@hungerly/api-client` + app session store): `expo-secure-store` token storage, auth header, single-flight refresh, logout on refresh failure; replace the mock `AuthService`.
- Customer app: connect C1–C4 (UI already built in Phase 1A); Restaurant app: R1; Delivery app: D1.
- Admin: A1 (login + MFA enrolment + verification), session handling with HttpOnly refresh cookie + CSRF.
- DLT registration of OTP SMS template (business task, start early).

**Dependencies:** Phase 1; OD-15 (email provider).
**Deliverables:** working login in all apps against staging.
**Acceptance criteria**
- OTP login works on a physical Android device against staging (real SMS).
- Admin login requires TOTP; accounts without TOTP must enrol before access.
- Refresh token reuse revokes the session (tested).
- Rate limits verified by tests (OTP per phone/IP, admin login lockout).
- No tokens/OTPs/phones in logs (log redaction tests).
- API tests cover every auth endpoint including negative authorization cases.

---

## Phase 3 — Restaurant onboarding & menu management

**Objectives:** restaurants can onboard, be approved and publish menus.

**Tasks**
- Backend: `cities`, `service_zones`, `restaurants`, `restaurant_staff`, `restaurant_hours`, `restaurant_hour_exceptions`, `restaurant_documents`, `cuisines`, menu tables; partner endpoints (profile, hours, documents, staff, status, menu CRUD, availability); uploads (presign, complete, image processing worker); restaurant policies (owner/manager/staff); minimal admin endpoints for city/zone creation, restaurant review/approval and document decisions.
- Restaurant app: R2–R5, R7, R11–R14, R17, R18.
- Admin (minimal): restaurant pending list and review/approval (A3, A4 basic), cities/zones creation (A11 basic), cuisines (A12).

**Dependencies:** Phase 2; OD-02 (pilot city), OD-12 (KYC approach).
**Deliverables:** a restaurant fully onboarded on staging with a real menu.
**Acceptance criteria**
- An owner onboards a restaurant, uploads documents, submits; an ops admin approves it with commission and zone; the owner builds a menu with categories, items, option groups and images.
- Staff role cannot edit the menu but can toggle availability (policy tests).
- Private documents are not publicly accessible; admin views them via short-lived URLs (tested).
- Hours with split shifts and midnight crossing compute "open now" correctly (unit tests with timezones).

---

## Phase 4 — Customer discovery & cart

**Objectives:** customers find restaurants and build a correctly priced cart.

**Tasks**
- Backend: `addresses`, serviceability, restaurant listing (PostGIS), restaurant detail, public menu with caching, search (FTS + trigram), favourites, cart endpoints with server-side pricing engine (subtotal, packaging, delivery fee by zone/distance, platform fee, tax placeholder), coupons (validation only; redemption in Phase 5).
- Customer app: C5–C12, C18, C20 (addresses part).
- Admin: coupons (A10 basic).

**Dependencies:** Phase 3; OD-03 (fee model), OD-14 (maps provider), OD-18 (languages).
**Deliverables:** browse → menu → cart with accurate bill on staging.
**Acceptance criteria**
- Listing returns only active, in-zone restaurants within radius, ordered per sort option; performance p95 < 300 ms with seeded pilot-size data.
- Pricing engine has unit tests for all fee/discount combinations and rounding; cart always shows server totals.
- Cart single-restaurant rule and option min/max enforced server-side.
- Menu availability changes appear to customers within 60 s.
- Location permission denied and unserviceable-area flows behave as specified.

---

## Phase 5 — Ordering & order management

**Objectives:** orders can be placed and processed by restaurants (COD/test path before payments).

**Tasks**
- Backend: `orders`, `order_items`, `order_item_options`, `order_status_events`, `coupon_redemptions`; place order (idempotent, re-pricing, price-changed flow), order state machine, customer cancel, restaurant accept/reject/ready/delay, acceptance timeout and payment-timeout jobs, order history/detail, reorder, outbox events for order transitions.
- Customer app: C10 place-order, C14 (status timeline via polling at this stage), C15, C16.
- Restaurant app: R6 (alert via polling/foreground), R8–R10.

**Dependencies:** Phase 4; OD-04 (tax), OD-06 (cancellation policy), OD-07 (timeouts).
**Deliverables:** end-to-end order flow (payment method: COD flag on staging only, for testing) up to `ready_for_pickup`.
**Acceptance criteria**
- Duplicate submission with the same `Idempotency-Key` creates one order (test).
- Concurrent transitions (customer cancel vs restaurant accept) resolve deterministically with `409` for the loser (test).
- Every transition writes a status event; invalid transitions are rejected.
- Unaccepted orders auto-cancel after the configured timeout.
- Order snapshots unaffected by later menu edits (test).

---

## Phase 6 — Payments

**Objectives:** online payments, verification, webhooks, refunds, reconciliation.

**Tasks**
- Backend: `payments`, `payment_webhook_events`, `refunds`; payment creation, client verification, webhook endpoint (signature, dedupe, async processing), auto-refund on cancellation/rejection, admin refund endpoint, daily reconciliation job, finance export (basic), COD feature flag per zone.
- Customer app: C13 with Razorpay SDK, payment-pending and failure flows, refund status in C16.
- Admin: refunds in order detail (A8 part), finance basics (A15 basic).

**Dependencies:** Phase 5; OD-05 (COD), OD-11 (payout approach); Razorpay account KYC (business task).
**Deliverables:** paid orders in test mode on staging.
**Acceptance criteria**
- Test-mode scenarios pass: success, failure, retry, app killed during payment (webhook completes it), duplicate webhooks, delayed webhook, refund full/partial, refund failure.
- An order can never have two captured payments (DB constraint + test).
- Amount charged always equals server-computed total (test).
- Reconciliation job flags seeded mismatches.
- No payment secrets in clients or logs (review + automated checks).

---

## Phase 7 — Delivery & dispatch

**Objectives:** delivery partners onboard and complete deliveries with live location.

**Tasks**
- Backend: `delivery_partners`, `delivery_partner_documents`, `delivery_assignments`, `delivery_location_pings`; onboarding, availability, location ingestion (Redis GEO), dispatch v1 worker (sequential offers, expiry, radius expansion, ops escalation), offer accept/reject with atomic assignment, pickup/arrival/delivered transitions with geofence checks, delivery OTP (per OD-08), COD recording, issue reporting, history, earnings summary; minimal admin partner approval and manual assignment.
- Delivery app: D2–D14 with foreground location service and permission flows.
- Customer app: live rider on map in C14 (polling fallback at this stage).
- Admin: partner review (A5, A6 basic), reassign in A8.

**Dependencies:** Phase 5 (Phase 6 can proceed in parallel); OD-08, OD-09, OD-10.
**Deliverables:** complete order loop to `delivered` on staging with real devices.
**Acceptance criteria**
- Two riders cannot accept the same offer (concurrency test); a rider cannot hold two active deliveries.
- Offers expire and move to the next candidate; escalation appears for ops after the configured time.
- Location updates flow at the configured interval with the app backgrounded on target test devices for a 30-minute session.
- Stale riders (no location for 2 minutes) are excluded from dispatch.
- Location breadcrumbs purge after the retention period (job test).

---

## Phase 8 — Admin dashboard

**Objectives:** complete the operations, support and finance tooling needed to run the pilot.

**Tasks**
- Live ops (A2), full restaurants/partners management (A3–A6), orders (A7, A8) with cancel/reassign/refund, users (A9), coupons (A10), zones & pricing editor (A11), review moderation (A13), analytics (A14), finance (A15), admin users (A16), audit log viewer (A17).
- Backend: admin endpoints and analytics queries (time-bounded, read-replica ready), CSV export jobs, platform settings (feature flags, timeouts, min app versions).

**Dependencies:** Phase 2 onward (built incrementally); final completion after Phases 5–7.
**Deliverables:** an admin dashboard sufficient for daily operations.
**Acceptance criteria**
- Every admin screen is gated by sub-role (tests for each role).
- Every admin mutation creates an audit log entry with reason (tests).
- Ops can resolve the top support scenarios (late order, wrong item refund, rider no-show, restaurant offline) using only the dashboard (scripted walkthrough).

---

## Phase 9 — Notifications & realtime

**Objectives:** timely, reliable alerts and live screens.

**Tasks**
- Backend: notifications module (templates, preferences, inbox), FCM integration with token hygiene, outbox relay → notification jobs, WebSocket endpoint with ticket auth and Redis pub/sub fan-out, events per API_BLUEPRINT §2.6, email templates for onboarding/admin.
- Mobile apps: push handling (foreground/background/terminated), deep links, notification channels (restaurant new order with custom sound, rider offer), WebSocket client with reconnect and polling fallback; inbox screens (C19, R19, D15).
- Admin: live dashboard updates.

**Dependencies:** Phase 5 (events); integrates with Phases 6–7.
**Deliverables:** realtime order tracking and push notifications across apps.
**Acceptance criteria**
- Restaurant tablet receives an audible new-order alert within 5 s while the app is backgrounded (target devices).
- Customer tracking updates within 3 s p95 while WebSocket is connected; falls back to polling on disconnect.
- Invalid FCM tokens are removed automatically.
- Transactional notifications cannot be disabled; promotional ones respect preferences.

---

## Phase 10 — Testing & quality hardening

Testing is continuous in every phase; this phase closes the gaps before launch.

**Objectives:** confidence that the system is correct, secure and performant at pilot scale.

**Tasks**
- Critical-flow E2E suites: Maestro (or Detox) for mobile (login, order, pay, accept, deliver) and Playwright for admin (approve, refund).
- Load tests (k6): browsing, order placement bursts, 500 riders sending locations, WebSocket connections — against a production-sized staging.
- Security testing: OWASP ZAP baseline, dependency audit, authorization matrix tests review, secrets scan history, threat-model review of payments and auth; external pen test if approved (OD-21).
- Chaos drills: Redis restart, provider outage simulation (SMS, payments), worker crash mid-job.
- Accessibility and device-matrix testing (low-end Android, tablet, iOS).
- Bug bash with ops people using staging.

**Dependencies:** Phases 1–9.
**Deliverables:** test reports, fixed defects, performance baseline.
**Acceptance criteria**
- Non-functional targets in BLUEPRINT §13 met at 2× pilot load.
- No open critical/high security findings.
- Coverage targets met (BLUEPRINT §51).
- All P0/P1 bugs closed.

---

## Phase 11 — Deployment & launch readiness

**Objectives:** production environment, releases and operations ready.

**Tasks**
- Production infrastructure as code (Terraform) mirroring staging; secrets in secret manager; DNS/TLS; CDN; backups + PITR verified; budget alerts.
- Release pipeline: tagged releases, manual approval, migration job, rolling deploy, automatic rollback; mobile release pipelines (OD-16) with signing keys held in CI secrets.
- Store listings, privacy policy, terms, data-safety forms, App Store review preparation.
- Runbooks (`docs/runbooks/`): incident response, rollback, DB restore, provider outages, dispatch stuck, payment backlog.
- Monitoring dashboards and alert routing; on-call rota.
- Restore drill from backup; DR tabletop exercise.
- Legal/compliance sign-off items (OD-04, OD-12, OD-13).

**Dependencies:** Phase 10.
**Deliverables:** production environment, approved store builds, runbooks.
**Acceptance criteria**
- Production deploy and rollback rehearsed successfully.
- Backup restore drill completed within RTO.
- Apps approved on Play Store (closed testing) and TestFlight.
- Alerts fire correctly in a simulated incident.

---

## Phase 12 — Production hardening

**Objectives:** safe pilot launch and stabilisation.

**Tasks**
- Staged launch: internal users → friends & family → limited public in pilot zones; staged mobile rollouts.
- Daily review of errors, latency, cancellations, dispatch times, payment success; tune timeouts, radii, rate limits.
- Enable OpenTelemetry tracing; add PgBouncer/read replica if metrics require.
- Cost review against budget (BLUEPRINT §55).
- Post-launch backlog grooming for post-MVP scope (BLUEPRINT §11).

**Dependencies:** Phase 11.
**Deliverables:** stable pilot; post-launch report; prioritised post-MVP roadmap.
**Acceptance criteria**
- Two consecutive weeks meeting availability and latency targets.
- Payment reconciliation mismatches investigated and resolved daily.
- No P0 incidents unresolved; post-mortems written for any incident.

---

## Immediate next step

**Phase 0 review.** After approval: merge `docs/blueprint` → `balaji` → `main` by PR, review the Phase 1A customer prototype (`feature/p1-customer-foundation`), resolve OD-24 (backend platform) and the Phase 1B blockers (OD-01, OD-19, OD-20, OD-23), then continue with the restaurant app prototype and Phase 1B in parallel.
