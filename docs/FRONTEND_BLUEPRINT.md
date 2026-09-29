# Hungerly — Frontend Blueprint

> Status: **Draft for review** (Phase 0). Describes UX and client architecture for the four client applications. No implementation yet.

Related: [BLUEPRINT.md](BLUEPRINT.md) · [API_BLUEPRINT.md](API_BLUEPRINT.md) · [ADR-005](decisions/ADR-005-mobile-framework.md) · [ADR-006](decisions/ADR-006-admin-web.md)

---

## 1. Applications

| App | Users | Technology | Platforms (MVP) | Folder |
|---|---|---|---|---|
| Customer | Customers | Flutter | Android, iOS | `apps/customer` |
| Restaurant (Partner) | Restaurant owners, managers, staff | Flutter | Android phones & tablets (primary), iOS | `apps/restaurant` |
| Delivery | Delivery partners | Flutter | Android (primary), iOS | `apps/delivery` |
| Admin | Hungerly operations, support, finance | React + TypeScript (Vite SPA) | Desktop browsers | `apps/admin` |

Why the restaurant app is mobile/tablet rather than web for MVP: restaurants run on a counter tablet or the owner's phone, need loud **push alerts for new orders even when the app is backgrounded**, and benefit from sharing the Flutter design system and API client. A web version of the restaurant app can be produced later from the same Flutter code base (Flutter web) or as a separate portal if restaurants request it (open decision).

---

## 2. Client architecture

### 2.1 Flutter apps (customer, restaurant, delivery)

**Layering (per app, feature-first):**

```
apps/<app>/lib/
  main.dart                 # bootstrap: env config, error handlers, DI (ProviderScope)
  app/                      # MaterialApp.router, theme, router, app-level listeners
  features/<feature>/
    presentation/           # screens, widgets (no business logic)
    application/            # Riverpod notifiers/controllers, UI state
    data/                   # repositories wrapping the generated API client
    domain/                 # app-specific models/value objects (only when API models are not enough)
  l10n/                     # ARB files
```

Shared Dart packages (in `packages/`):

| Package | Contents |
|---|---|
| `hungerly_api` | **Generated** Dart client + models from the backend OpenAPI spec. Never edited by hand |
| `hungerly_core` | HTTP setup (Dio, auth interceptor with single-flight token refresh, request-id, retry policy), secure token storage, env config, error mapping (`ProblemDetails` → typed `AppFailure`), money/time formatting, logging, analytics facade, WebSocket client with reconnect/backoff, push-notification plumbing |
| `hungerly_ui` | Design system: theme tokens (color, typography, spacing, radius), components (buttons, inputs, cards, bottom sheets, status chips, skeleton loaders, empty/error views, price text, veg/non-veg marks), icons, illustrations |

**Key choices** (details in ADR-005):

| Concern | Choice | Notes |
|---|---|---|
| State management | **Riverpod** (with code generation) | Compile-safe DI + state, testable without widgets, supports async state (`AsyncValue`) that maps cleanly to loading/empty/error states |
| Navigation | **go_router** | Declarative routes, deep links (push notification → order screen), auth redirects |
| Networking | **Dio** + generated client | Interceptors for auth refresh, request id, logging |
| Local persistence | `flutter_secure_storage` (tokens), `shared_preferences` (non-sensitive prefs) | No offline database in MVP; server is source of truth |
| Maps | Google Maps Flutter plugin (behind a thin `MapView` abstraction in `hungerly_ui`) | Provider can be swapped (open decision on Ola/Mapbox) |
| Location | `geolocator`; delivery app uses a foreground service for background tracking on Android | Required for rider tracking; strict permission UX |
| Push | Firebase Cloud Messaging (`firebase_messaging`) + local notifications | Restaurant app uses a high-priority channel with custom sound |
| Payments | Razorpay Flutter SDK (customer app only) | Server creates the payment order; SDK only collects payment |
| Errors/crashes | Sentry Flutter SDK | Release health, crash reports with PII scrubbing |
| Localisation | `flutter_localizations` + ARB | English at launch; Hindi/Marathi post-MVP (open decision) |
| Flavours | `dev`, `staging`, `prod` flavours with separate bundle ids and API base URLs | Config via `--dart-define-from-file`, no secrets in the app |

### 2.2 Admin web app

```
apps/admin/src/
  main.tsx, app/            # router, providers, layout shell
  features/<feature>/       # pages, components, hooks (TanStack Query)
  lib/                      # api client wrapper, auth, formatting
  components/ui/            # shadcn/ui-based primitives
```

| Concern | Choice |
|---|---|
| Framework | React 19 + TypeScript + Vite (static SPA) |
| Routing | React Router (data routers) |
| Server state | TanStack Query (caching, polling for live dashboard) |
| Client state | React state/context; Zustand only if a real need appears |
| Forms & validation | React Hook Form + Zod |
| UI | Tailwind CSS + shadcn/ui (copied components, no heavy UI framework) |
| Tables | TanStack Table (server-side pagination/filtering) |
| Charts | A single lightweight chart library (e.g. Recharts) |
| Maps | Google Maps JS API (zone drawing, live ops map) |
| API client | Generated TypeScript types/client from OpenAPI (`packages/api-client-ts`) |
| Auth | Access token in memory; refresh via HttpOnly cookie; CSRF header on refresh |

### 2.3 Cross-app UX standards

- **Every data screen defines four states:** loading (skeletons, not spinners, for lists), empty (illustration + one clear action), error (message from error `code` + retry), and content. Partial failures (e.g. one widget on the dashboard) degrade locally.
- **Money** always shown with `₹` and correct rounding from minor units; never computed on the client beyond display.
- **Order status** uses one shared status vocabulary and colour mapping across all apps (from `hungerly_ui`).
- **Connectivity:** a global offline banner; mutating buttons disabled while offline; queued retries only for idempotent calls.
- **Accessibility:** minimum 48dp touch targets, semantic labels, text scaling up to 200%, colour contrast WCAG AA; veg/non-veg marks never rely on colour alone.
- **Session expiry:** transparent refresh; on refresh failure, return to login and preserve the intended route.
- **Forced update:** a `426` response shows a blocking "Update required" screen with a store link.

---

## 3. Customer application screens

Navigation shell: bottom tabs **Home · Search · Orders · Account**; the cart is a floating bar shown whenever the cart is not empty.

| # | Screen | Purpose | Major components | Actions | API dependencies | Navigation | Loading | Empty | Error |
|---|---|---|---|---|---|---|---|---|---|
| C1 | Splash / Bootstrap | Restore session, check min version, decide first route | Logo, progress | — | `POST /auth/refresh`, `GET /me` | → C2 (no session) / C5 (no location) / C6 | Logo animation | — | Network error → retry; `426` → Update screen |
| C2 | Phone login | Start OTP login | Country code (+91 fixed), phone field, terms link, continue | Request OTP | `POST /auth/otp/request` | → C3 | Button spinner | — | Invalid number (inline), rate limited (countdown), SMS unavailable (retry later) |
| C3 | OTP verification | Verify phone | 6-box OTP input (SMS autofill on Android), resend timer, change number | Verify, resend | `POST /auth/otp/verify`, `/auth/otp/request` | → C4 (new user) / C5 / C6 | Button spinner | — | Wrong OTP (shake + attempts left), expired (resend), attempts exceeded (wait) |
| C4 | Profile setup | Collect name (and optional email) for new users | Name, email fields | Save, skip email | `PATCH /me` | → C5 | Button spinner | — | Field validation |
| C5 | Set delivery location | Choose where to deliver | "Use current location", map with draggable pin, place autocomplete, saved addresses list | Detect location, pick address, add address | Maps SDK / Places, `GET /catalog/serviceability`, `GET /customer/addresses` | → C6, → C11 | Map placeholder | No saved addresses → prompt to add | Location permission denied (explain + manual search), not serviceable (friendly "not here yet" + notify-me later) |
| C6 | Home (discovery) | Browse restaurants near the selected location | Address header, cuisine chips, filter/sort bar, offer banner (post-MVP), restaurant cards with rating/ETA/fee/veg mark, "closed" section | Change location, filter, sort, open restaurant, favourite | `GET /catalog/restaurants`, `/catalog/cuisines`, `PUT/DELETE /customer/favorites/{id}` | → C8, → C5, → C7 | Card skeletons | No restaurants open/nearby → "try later" + show closed | Load failure → retry; partial (cuisines) hidden silently |
| C7 | Search | Find restaurants or dishes | Search field with debounce, recent searches (local), results tabs (Restaurants / Dishes) | Search, open result | `GET /catalog/search` | → C8 (scroll to dish) | Inline skeleton | No results → suggestions | Retry |
| C8 | Restaurant & menu | View restaurant and add items | Header (rating, ETA, fees, open status), veg-only toggle, category tabs/scroll-spy, menu item rows with add/stepper, "customisable" label, reviews preview | Add item, open customisation, favourite, view reviews | `GET /catalog/restaurants/{id}`, `/menu`, `POST /customer/cart/items` | → C9 sheet, → C10, → reviews list | Header + list skeleton | Menu empty → "menu coming soon" | Restaurant closed (banner, adding disabled), cart conflict dialog ("replace cart?"), item became unavailable |
| C9 | Item customisation (bottom sheet) | Pick variants/add-ons | Option groups with radio/checkbox respecting min/max, notes, quantity, live price | Add to cart | `POST /customer/cart/items` | back to C8 | Button spinner | — | Invalid selection (inline), option unavailable |
| C10 | Cart | Review items and bill | Items with steppers, unavailable-item warnings, address selector, coupon row, bill breakdown, tip selector, instructions, payment method, "Place order" with total | Edit quantity, change address, apply coupon, set tip, place order | `GET /customer/cart`, cart item endpoints, `PUT /customer/cart/address`, `PUT/DELETE /customer/cart/coupon`, `GET /customer/coupons`, `POST /customer/orders` | → C11, → C12 (coupons), → C13 / C14 | Bill skeleton on recompute | Empty cart → "browse restaurants" | Blocking reasons shown inline (closed, min order, unserviceable); `order.price_changed` → show new bill and ask to confirm |
| C11 | Address add/edit | Save a delivery address | Map pin (required), form fields, label chips | Save, delete | `POST/PATCH/DELETE /customer/addresses` | back | Map placeholder | — | Field validation, pin outside zone (warning, still saveable), limit reached |
| C12 | Coupons | See and apply coupons | Coupon cards with conditions, manual code entry | Apply | `GET /customer/coupons`, `PUT /customer/cart/coupon` | back to C10 | List skeleton | "No offers right now" | Invalid/expired code (inline reason) |
| C13 | Payment | Pay for an online order | Razorpay checkout (SDK), processing screen | Pay, retry, change method, cancel | `POST /customer/orders/{id}/payments`, `/verify` | success → C14; failure → retry or cancel | "Confirming payment…" (never double-charge on back press) | — | Payment failed (retry, other method), pending (wait for webhook, auto-refresh), timeout → order auto-cancelled message |
| C14 | Order tracking | Follow an active order live | Status timeline, ETA, map with restaurant/rider/home (after pickup), rider card (name, vehicle, masked call), restaurant call, order summary, help | Call rider/restaurant (masked), cancel (when allowed), help | `GET /customer/orders/{id}`, WebSocket `order.*`, `delivery.location_updated`, `POST .../cancel` | from push/deep link, C15 | Timeline skeleton | — | WebSocket drop → fall back to polling + "reconnecting" chip; cancellation not allowed → explain |
| C15 | Orders (history) | List past and active orders | Active order card on top, history list with status, reorder | Open order, reorder, rate | `GET /customer/orders`, `POST .../reorder` | → C14 / C16 / C17 | List skeleton | "No orders yet" → Home | Retry; pagination error at list end |
| C16 | Order detail (past) | Receipt and details | Items, bill, payment/refund status, delivery address, invoice (post-MVP) | Reorder, rate, get help | `GET /customer/orders/{id}` | → C17 | Skeleton | — | Retry |
| C17 | Rate order | Rate restaurant and delivery | Two star rows, review text, delivery feedback chips | Submit | `POST /customer/orders/{id}/rating` | back | Button spinner | — | Window closed, validation |
| C18 | Favourites | Quick access to liked restaurants | Restaurant cards | Open, unfavourite | `GET /customer/favorites` | → C8 | Skeleton | "Tap ♥ on a restaurant" | Retry |
| C19 | Notifications | In-app inbox | Grouped list, unread marker | Open (deep link), mark all read | `GET /me/notifications`, `/read`, `/read-all` | deep links | Skeleton | "You're all caught up" | Retry |
| C20 | Account | Profile and settings hub | Profile summary, addresses, favourites, notifications prefs, help, legal, logout, delete account | Edit profile, logout, manage sessions, delete account | `GET/PATCH /me`, `GET /auth/sessions`, `POST /auth/logout`, `DELETE /me` | → C11, C18, C19 | — | — | Deletion confirmation with consequences |

---

## 4. Restaurant (partner) application screens

Navigation shell (after selecting a restaurant): **Orders · Menu · Insights · More**. A persistent online/offline switch sits in the top bar. New orders trigger a full-screen alert with a repeating sound until acknowledged.

| # | Screen | Purpose | Major components | Actions | API dependencies | Navigation | Loading | Empty | Error |
|---|---|---|---|---|---|---|---|---|---|
| R1 | Login (phone OTP; optional email/password) | Authenticate staff | Phone field, OTP | Request/verify OTP | `/auth/otp/*` (or `/auth/login`) | → R2 | Button spinner | — | Same as C2/C3 |
| R2 | Restaurant picker | Choose restaurant when a user belongs to several; entry to onboarding | Restaurant list with status badges, "Register a new restaurant" | Select, start onboarding | `GET /partner/restaurants` | → R8 / R3 / R7 | Skeleton | No memberships → onboarding CTA / "ask owner to invite you" | Retry |
| R3 | Onboarding wizard | Register a restaurant | Steps: basic details → location (map pin) → cuisines & food type → hours → documents (FSSAI, GST, PAN, bank proof) → review & submit | Save each step (draft), upload, submit | `POST/PATCH /partner/restaurants[/{id}]`, `PUT .../hours`, `POST /uploads/presign`, `POST .../documents`, `POST .../submit` | → R4 | Step skeleton, upload progress | — | Upload failure (retry per file), validation per step, cannot submit until required docs attached |
| R4 | Onboarding status | Track review | Status timeline (draft → in review → approved/rejected), rejection reasons, document statuses | Fix and resubmit | `GET /partner/restaurants/{id}`, `/documents` | → R3 (fix) / R8 (approved) | Skeleton | — | Retry |
| R5 | Go online / offline | Control order intake | Switch with confirmation, reason when going offline | Toggle | `PATCH /partner/restaurants/{id}/status` | top bar | Switch pending state | — | `outside_hours`, `not_active` explained |
| R6 | New order alert | Make sure no order is missed | Full-screen card, order summary, countdown to auto-reject, prep time picker | Accept (with prep time), reject (reason) | WebSocket `partner.order_created`, push, `POST .../accept`, `/reject` | → R9 | Button spinner | — | Already cancelled by customer (dismiss), version conflict (refresh) |
| R7 | Staff invite acceptance | Join a restaurant as staff | Invitation details | Accept/decline | `GET/POST /partner/restaurants/{id}/staff` | → R8 | — | — | Invitation expired |
| R8 | Live orders board | Run service | Tabs/columns: New · Preparing · Ready · Picked up; order cards with timers, rider ETA/arrival indicator; sound/vibration settings | Open order, accept/reject, mark ready, delay | `GET .../orders?status=`, WebSocket, `.../accept`, `/reject`, `/ready`, `/delay` | → R9 | Column skeletons | "No active orders" (with online status reminder) | Connection lost banner + auto-poll; action conflict → refresh card |
| R9 | Order detail | See full order | Items with options and notes (large type for kitchen), bill (restaurant view: payout estimate), customer first name, rider details, timeline | Accept, reject, ready, delay, print (post-MVP), report issue | `GET .../orders/{id}`, actions above | from R8/R10 | Skeleton | — | Retry |
| R10 | Order history | Past orders | Date filter, status filter, list | Open order | `GET .../orders` | → R9 | Skeleton | "No orders in this period" | Retry |
| R11 | Menu | Manage categories and items | Category list (reorder), items with price, veg mark, availability switch | Add/edit/reorder, toggle availability | `GET .../menu`, `PUT .../categories/order`, availability endpoints | → R12 | Skeleton | "Add your first category" | Toggle failure reverts switch with toast |
| R12 | Item editor | Create/edit a dish | Name, description, price, food type, category, image upload, option groups editor (min/max, options with price deltas) | Save, delete | `POST/PATCH/DELETE .../menu/items`, `/uploads/presign` | back to R11 | Button spinner, image upload progress | — | Field validation, upload error, permission error for `staff` role (read-only) |
| R13 | Quick availability | Rush-hour "out of stock" toggling | Searchable flat list of items/options with switches | Toggle | availability endpoints | from R11 / top bar | Skeleton | — | Revert on failure |
| R14 | Hours & holidays | Manage opening times | Weekly schedule editor (split shifts), exceptions calendar | Save hours, add/remove exception | `PUT .../hours`, `.../hour-exceptions` | More → R14 | Skeleton | No exceptions → add CTA | Overlap validation |
| R15 | Insights | Business summary | Period selector, KPI tiles (orders, sales, AOV, rejection rate, avg prep time, rating), simple trend chart, top items | Change period | `GET .../reports/summary` | tab | Tile skeletons | "No sales yet" | Per-tile retry |
| R16 | Reviews | See customer feedback | Rating summary, review list | Report abusive review | `GET .../reviews`, `POST .../report` | More → R16 | Skeleton | "No reviews yet" | Retry |
| R17 | Staff | Manage team | Staff list with roles | Invite by phone, change role, remove | `/partner/restaurants/{id}/staff` | More → R17 | Skeleton | "Only you so far" | Role permission errors |
| R18 | Restaurant profile & settings | Edit profile, documents, payout info, notification sound | Profile form (locked fields marked), documents list, payout account status, logout | Save, upload documents | `GET/PATCH /partner/restaurants/{id}`, documents | More | Skeleton | — | Validation |
| R19 | Notifications | Inbox | List | Open | `/me/notifications` | More | Skeleton | Caught up | Retry |

---

## 5. Delivery application screens

Navigation shell: **Home (map) · History · Earnings · Profile**. The active delivery takes over the Home tab until completed.

| # | Screen | Purpose | Major components | Actions | API dependencies | Navigation | Loading | Empty | Error |
|---|---|---|---|---|---|---|---|---|---|
| D1 | Login (phone OTP) | Authenticate partner | Phone, OTP | Request/verify | `/auth/otp/*` | → D2 / D4 | Button spinner | — | Same as C2/C3 |
| D2 | Onboarding | Become a partner | Steps: personal details → zone → vehicle → documents (licence, RC, ID, photo, bank proof) → submit | Save, upload, submit | `GET /delivery/me`, `POST /delivery/onboarding`, `/uploads/presign`, `POST /delivery/documents` | → D3 | Upload progress | — | Upload/validation errors |
| D3 | Onboarding status | Track verification | Status timeline, document statuses, rejection reasons | Fix and resubmit | `GET /delivery/me`, `/delivery/documents` | → D2 / D4 | Skeleton | — | Retry |
| D4 | Permissions check | Ensure location (incl. background), notifications, battery-optimisation exemption | Checklist with explanation for each permission | Grant | OS APIs | → D5 | — | — | Permission permanently denied → open settings |
| D5 | Home (online/offline) | Go on duty and wait for offers | Big online switch, map with own position, zone boundary, today's summary (deliveries, earnings) | Go online/offline | `PUT /delivery/availability`, `POST /delivery/location` (background), WebSocket | → D6 on offer | Map placeholder | Online with no offers → "Waiting for orders" | GPS unavailable, outside zone, suspended account |
| D6 | Incoming offer | Accept or reject a delivery | Full-screen card: restaurant, pickup distance, drop distance, estimated payout, countdown, sound | Accept, reject | WebSocket `delivery.offer_created`, push, `GET /delivery/offers`, `POST .../accept`, `/reject` | → D7 | Button spinner | — | Offer expired / taken (dismiss with message) |
| D7 | To restaurant | Navigate to pickup | Map with route, restaurant address/contact, order number, "Open in Google Maps", status of food (preparing/ready) | Arrived, call restaurant, report issue | `GET /delivery/assignments/current`, `POST .../arrived-restaurant`, `/issue` | → D8 | — | — | Geofence warning if far |
| D8 | Pickup | Confirm correct order collected | Order number, item count, checklist | Confirm pickup | `POST .../picked-up` | → D9 | Button spinner | — | Order not ready (wait state), too far from restaurant |
| D9 | To customer | Navigate to drop | Map with route, address + landmark + instructions, masked call, COD amount if any | Arrived, call, report issue | `POST .../arrived-customer`, `/issue` | → D10 | — | — | Customer unreachable flow → issue |
| D10 | Delivery confirmation | Complete handoff | Delivery OTP entry (if enabled), COD amount collected, optional photo (post-MVP) | Complete delivery | `POST .../delivered` | → D5 with earnings toast | Button spinner | — | Wrong OTP, COD mismatch, too far |
| D11 | Report issue | Escalate problems | Issue type list, notes | Submit | `POST .../issue` | back | Button spinner | — | Retry |
| D12 | History | Past deliveries | Date filter, list with payout | Open detail | `GET /delivery/history` | tab | Skeleton | "No deliveries yet" | Retry |
| D13 | Earnings | Earnings summary | Period selector, totals, per-delivery breakdown, COD cash to deposit (if applicable) | Change period | `GET /delivery/earnings` | tab | Tile skeleton | "No earnings in this period" | Retry |
| D14 | Profile | Account and documents | Profile, vehicle, documents status, payout account, support, logout | Edit, logout | `GET /delivery/me`, `/delivery/documents` | tab | Skeleton | — | Retry |
| D15 | Notifications | Inbox | List | Open | `/me/notifications` | Profile | Skeleton | Caught up | Retry |

Delivery-app specifics: battery-aware location intervals, Android foreground service notification while online, graceful handling of poor connectivity (queue location points locally and send in batches), large touch targets and high-contrast UI for outdoor use.

---

## 6. Admin dashboard screens

Layout: left sidebar navigation, top bar with city selector, global search (order number / phone), user menu. Screens are visible according to admin sub-role.

| # | Screen | Purpose | Major components | Actions | API dependencies | Roles | Loading | Empty | Error |
|---|---|---|---|---|---|---|---|---|---|
| A1 | Login + MFA | Secure admin access | Email/password form, TOTP step, enrolment QR on first login | Login, verify, enrol | `/auth/login`, `/auth/mfa/*` | all | Button spinner | — | Invalid credentials (generic), locked account, MFA required |
| A2 | Live operations | Real-time view of the platform | KPI tiles (active orders by status, online riders, restaurants online), delayed-order alert list (e.g. not accepted in 3 min, no rider in 10 min), live map | Open order, filter by zone | `GET /admin/dashboard/live` (polling 10–15 s), WebSocket (post-MVP) | operations | Tile skeletons | "All quiet" | Stale-data indicator on failure |
| A3 | Restaurants list | Manage restaurants | Table (name, zone, status, rating, online), filters (status, zone), "Pending review" tab | Open, filter, export | `GET /admin/restaurants` | operations | Table skeleton | "No restaurants match" | Retry |
| A4 | Restaurant detail / review | Approve and manage a restaurant | Profile, documents viewer (private presigned URLs), document decisions, commission & zone form, status history, staff list, recent orders | Approve, reject, suspend, reinstate, approve/reject documents | `GET /admin/restaurants/{id}`, `/approve`, `/reject`, `/suspend`, `PATCH /admin/documents/...` | operations | Section skeletons | — | Transition conflicts; confirmation dialogs with reason required |
| A5 | Delivery partners list | Manage fleet | Table (name, zone, status, online, rating, deliveries), pending review tab | Open, filter | `GET /admin/delivery-partners` | operations | Skeleton | Empty filter state | Retry |
| A6 | Delivery partner detail | Verify and manage a partner | Profile, documents, status history, deliveries, ratings | Approve, reject, suspend | `/admin/delivery-partners/{id}/*` | operations | Skeleton | — | Same as A4 |
| A7 | Orders list | Find and inspect orders | Search (order number, phone), filters (status, restaurant, zone, date), table | Open | `GET /admin/orders` | operations, support | Skeleton | Empty filter state | Retry |
| A8 | Order detail | Resolve issues | Timeline (status events), items, bill, payments & refunds, delivery assignments (offers, rejections), rider track (from pings), customer/restaurant contacts, audit entries | Cancel, reassign rider, refund (finance), add internal note | `GET /admin/orders/{id}`, `/cancel`, `/reassign`, `POST /admin/payments/{id}/refunds` | operations, support, finance | Skeleton | — | Action conflict; refund exceeds captured |
| A9 | Users | Customer support lookup | Search, user detail with roles, orders, sessions | Suspend, reinstate, revoke sessions | `GET /admin/users`, `/suspend`, `/reinstate` | support, operations | Skeleton | No results | Retry |
| A10 | Coupons | Promotions | Table, create/edit form with preview of rules, usage stats | Create, edit, deactivate | `/admin/coupons` | operations | Skeleton | "No coupons" | Validation |
| A11 | Cities & zones | Geography and pricing | Map with polygon drawing/editing, zone pricing form | Create/edit zone, activate | `/admin/cities`, `/admin/zones` | super_admin | Map placeholder | "Create your first city" | Invalid polygon, overlapping zones warning |
| A12 | Cuisines | Curate filters | List | Add, rename, deactivate | `/admin/cuisines` | operations | Skeleton | Empty | Duplicate name |
| A13 | Review moderation | Handle flagged reviews | Flagged list, review content, order context | Hide, restore | `PATCH /admin/reviews/{order_id}` | support | Skeleton | "Nothing flagged" | Retry |
| A14 | Analytics | Business insights | Date range, city filter, KPI tiles, time series, restaurant/delivery performance tables | Change filters, export | `/admin/analytics/*`, `/admin/exports/*` | operations, finance | Chart skeletons | "No data for this range" | Per-widget retry; range too large |
| A15 | Finance | Money view | Collections, refunds, commission, payables to restaurants, refund queue | Export, issue refund | `/admin/analytics/finance`, refunds | finance | Skeleton | Empty | Retry |
| A16 | Admin users | Manage admin team | Table, invite form, sub-role select | Invite, change role, deactivate, reset MFA | `/admin/admins` | super_admin | Skeleton | — | Cannot remove last super admin |
| A17 | Audit log | Accountability | Filterable log (actor, action, entity, date) with diff viewer | Filter, export | `/admin/audit-logs` | super_admin | Skeleton | Empty filter state | Retry |

---

## 7. Navigation maps (summary)

```
Customer:  Splash → Login → OTP → [Profile setup] → Location → Home
           Home ⇄ Search → Restaurant → (Item sheet) → Cart → [Address] → [Payment] → Tracking
           Orders → Order detail → Rate      Account → Addresses / Favourites / Notifications / Sessions

Restaurant: Login → Picker → (Onboarding → Status) | Orders board ⇄ Order detail
            Menu → Item editor · Quick availability · Insights · More → Hours / Reviews / Staff / Profile

Delivery:  Login → (Onboarding → Status) → Permissions → Home (online) → Offer → To restaurant
           → Pickup → To customer → Confirm → Home      History · Earnings · Profile

Admin:     Login → MFA → Live ops | Restaurants | Partners | Orders | Users | Coupons | Zones
           | Cuisines | Reviews | Analytics | Finance | Admins | Audit log
```

Deep links (push notification payloads): `hungerly://orders/{id}` (customer), `hungerly-partner://orders/{id}` (restaurant), `hungerly-rider://offers/{assignment_id}` (delivery). Final scheme/app-links domain is an open decision.

---

## 8. Frontend testing approach

| Level | Flutter | Admin |
|---|---|---|
| Unit | Riverpod notifiers, repositories with mocked API client, formatting utilities | Hooks, utils (Vitest) |
| Widget/component | Key widgets and screens in each state (loading/empty/error/content) | React Testing Library |
| Golden tests | Design-system components in `hungerly_ui` | — |
| Integration/E2E | `integration_test` for critical flows (login, order placement, accept, delivery) against the staging API | Playwright for login, restaurant approval, order refund |

API mocks in tests use the generated models and recorded fixtures — never a hand-written fake backend shipped in the app.
