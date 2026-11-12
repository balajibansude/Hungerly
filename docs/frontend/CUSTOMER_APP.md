# Customer App — Architecture & Developer Guide

> Status: **Phase 1A prototype** — navigable on mock data, no backend. Stack: Expo SDK 57, React Native 0.86, Expo Router, TypeScript strict ([ADR-011](../decisions/ADR-011-react-native-expo.md)).
>
> Screen-level UX specification: [FRONTEND_BLUEPRINT.md §3](../FRONTEND_BLUEPRINT.md#3-customer-application-screens). Design tokens and components: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## 1. What exists today

| Journey step | Route | Status |
|---|---|---|
| Splash / startup gate | `/` (`src/app/index.tsx`) | ✅ short white splash with the Swaadone logo while the session is restored (mock), then **straight to Home** — no intro slides, never a login wall; guests browse freely |
| Log in / sign up (phone) | `/login?reason=` | ✅ +91 mobile validation; one flow for new and returning users; opened on demand (checkout, favourites, orders, account) with copy explaining why; back returns to browsing |
| OTP verification | `/verify` | ✅ 6-digit input with SMS autofill hints, resend timer, error state. **Prototype code: `123456`** |
| Profile setup / edit | `/profile-setup` | ✅ first sign-in: name + optional email, skippable; signed in: "Edit profile" |
| Home | `/home` (tab) | ✅ logo + delivery address, greeting, search entry, quick filters, **Special offers** banners (See all → `/offers`), "What's on your mind?" cuisine rail whose filter icon opens the **Veg / Mixed / Jain** sheet (and "Browse all cuisines"), popular dishes as food cards (open restaurants first), Nearby kitchens (closest first, centred logo/monogram, CLOSED state), skeleton/error states, pull to refresh |
| All cuisines | `/cuisines` (modal) | ✅ 4-column grid of every cuisine (`listCuisines`), image fallback, tap → `/restaurants?cuisine=` |
| Offers | `/offers` (tab) | ✅ large green/orange/pink/blue banners (active → upcoming → expired; tap for terms and "Order from …"), **Deals on dishes** grid of food cards with the food preference, loading/empty/error; labelled as sample offers (codes not redeemable yet) |
| Favourites | `/favorites` (signed in) | ✅ saved restaurants, unsave in place, empty state |
| My addresses | `/addresses` (signed in) | ✅ read-only current delivery address; add/edit pending backend |
| Search | `/search` (tab) | ✅ debounced search; dishes as food cards (preference chips, open restaurants first, "n hidden by preference" note), restaurants as cards; suggestions, empty state |
| Orders | `/orders` (tab) | ✅ guests: login prompt; signed in: empty state (ordering not built yet) |
| Profile | `/profile` (tab) | ✅ "My Profile": identity card (verified phone only when OTP-confirmed), summary grid (orders · wallet — · offers · saved), quick access, activity, appearance, support & info, logout/delete with confirmation; unbuilt destinations show a "Soon" explanation; guest variant with login entry |
| Restaurant listing | `/restaurants?filter=&cuisine=&sort=` | ✅ quick filters, sort, count, skeleton/empty/error |
| Restaurant details + menu | `/restaurants/[id]` | ✅ hero, info card, offer, Veg / Mixed / Jain chips, category jump chips, collapsing top bar, two-column food-card grid, closed banner ("Opens at …") with grey add buttons |
| Dish details / customisation | `/food/[id]` (modal) | ✅ options with min/max rules, validation, quantity, live price, add to cart; closed/unavailable explanation instead of the add button |
| Cart | `/cart` | ✅ lines with steppers, clear cart, offer progress hint, estimated bill, minimum-order guard; re-checks the restaurant on open — while closed, + and checkout are disabled but items can be removed; **guests are asked to log in at Checkout** and return to the same cart; checkout placeholder after that |

Not implemented (by design, later phases): real auth, API calls, payments/wallet, checkout/order placement, live tracking, maps/device location, address management, notifications, scratch cards, referrals, legal/support content, the "glass" home screen, account deletion backend, persistence across restarts.

## 2. Folder structure

```
apps/customer/
├── app.json                    # Expo config: name "Swaadone", scheme "hungerly", plugins, white logo splash, icons, typed routes
├── assets/brand/               # swaadone-logo.png (temporary logo — replace this one file) + padded Android adaptive icon
├── assets/                     # app icon, adaptive icon, splash wordmark (generated from the brand font)
├── src/
│   ├── app/                    # ROUTES ONLY (Expo Router). Thin screens that compose features.
│   │   ├── _layout.tsx         # fonts, providers, root Stack, Stack.Protected guards
│   │   ├── index.tsx           # startup gate (splash + redirect)
│   │   ├── (auth)/             # login, verify (signed-out only)
│   │   ├── (tabs)/             # home, search, offers, orders, profile (public; account data gated inside)
│   │   ├── profile-setup.tsx   # first-time setup or edit profile
│   │   ├── restaurants/        # index (listing), [id] (details)
│   │   ├── food/[id].tsx       # dish modal
│   │   ├── cuisines.tsx        # All cuisines (modal)
│   │   ├── favorites.tsx, addresses.tsx   # signed-in only
│   │   └── cart.tsx
│   ├── features/               # feature code: components, hooks, pure logic (+ tests)
│   │   ├── auth/               # session store, entry routing, login reasons
│   │   ├── brand/              # brand.ts (name + logo, one place) and BrandLogo
│   │   ├── food/               # FoodCard, grid/rail, availability rules, Veg/Mixed/Jain preference, dish cart controls
│   │   ├── cart/               # cart store, pricing (estimate), checkout gate, CartBar, BillSummary, useAddToCart
│   │   ├── cuisines/           # grid metrics, cuisine → listing href
│   │   ├── favorites/          # favourites store, sync, bookmark toggle (guest → login)
│   │   ├── offers/             # offer status/terms/banner copy, OfferBanner
│   │   ├── profile/            # profile card, summary grid, menu rows, "coming soon" copy
│   │   ├── home/               # header, category rail, promo carousel, greeting
│   │   ├── menu/               # menu row, option picker, selection rules, stepper behaviour
│   │   └── restaurants/        # restaurant card + logo/monogram, info card, skeleton, quick filters
│   ├── services/               # BACKEND BOUNDARY — contracts, provider, mock implementations
│   └── mock/                   # prototype data — imported only by services/mock
└── package.json
```

Conventions:
- Files in `src/app` are screens; they fetch through services, hold screen state and compose feature components. Reusable logic lives in `src/features`.
- Pure business logic (pricing, option rules, routing decisions) is framework-free and unit-tested next to its feature.
- Imports use the `@/` alias for `src/`, and `@hungerly/*` for shared packages.
- Shared by every app (not copied): `useQuery`, `ServiceError` and the services provider come from `@hungerly/app-core`; `OtpInput` and `BrandSplash` from `@hungerly/ui`.

## 3. Navigation

```
Root Stack
├── index                         startup gate (always reachable)
├── (tabs)                        Home · Search · Offers · Orders · Profile   (public)
├── restaurants/index, restaurants/[id], food/[id] (modal), cuisines (modal), cart   (public)
├── profile-setup                 setup (pending sign-in) or edit (signed in); redirects home otherwise
├── (auth)        [guard: signed out]
│   ├── login → verify
└── favorites, addresses  [guard: signed in]
```

- **Guest-first:** `entryRouteFor()` (pure, tested) always opens Home after the splash — with or without a session. Sign-in is only required to place an order (`checkoutStepFor()`) or use account data (orders, favourites, addresses).
- **Return after login:** login is *pushed* on top of the screen that needed it. Verifying flips the `(auth)` guard, which removes the auth screens and reveals that screen (e.g. the cart) unchanged — no duplicate routes. First-time users go verify → `profile-setup` (held as `pendingSession` until setup ends) → back.
- **`Stack.Protected`** hides the auth flow from signed-in users and account screens from guests. Signing out keeps the customer where they are, as a guest. This is a UX guard only — access control is enforced by the backend (SECURITY.md).
- **Typed routes** are enabled; `tsc` checks every `router.push` target against the real route files (types are generated in `.expo/types` when the dev server starts).
- The cart is **not a tab**: a floating `CartBar` appears whenever the cart has items (Home, listing, restaurant screens).
- Deep-link scheme: `hungerly://` (final scheme/app links: OD-23).

## 4. State

| State | Where | Why |
|---|---|---|
| Session (signed in, pending first-time setup, user) | `features/auth/session.ts` (Zustand) | Needed by the gate, guards and several screens; no session = guest |
| Favourite restaurant ids | `features/favorites/store.ts` (Zustand) | Bookmark state on every card; loaded after sign-in, cleared on sign-out |
| Cart | `features/cart/store.ts` (Zustand) | Shared by menu, dish modal, cart bar and cart screen |
| Server data (feeds, menus, search) | `useQuery(key, load)` per screen (from `@hungerly/app-core`) | Loading/error/refresh with no global cache yet |
| UI state (filters, selections, dialogs) | Local `useState` | Isolated to a screen |

Cart rules implemented: one restaurant per cart (with "Start a new cart?" confirmation), identical dish + options merge into one line, quantity capped at 20 per line, the cart empties its restaurant when the last line is removed. The bill is an **estimate** (subtotal, delivery fee, offer discount, total, minimum-order and offer gaps) — the server will be the source of truth (FR-CART-2).

Session, cart, favourites and the food preference are in memory only: restarting the app returns to guest mode. A guest cart survives signing in (it is never cleared on login); logging out clears it. Persistence arrives with real auth (`expo-secure-store` for tokens).

## 5. Mock data strategy

- `src/mock/` holds fictional restaurants around Koregaon Park, Pune (10 restaurants, menus with option groups, categories, offers, a delivery address). Names are original; prices are in paise.
- Images come from the Unsplash CDN (free to use). Every photo id was checked against its description. `RemoteImage` shows a neutral fallback tile if an image is missing or fails.
- **Only `src/services/mock` imports `src/mock`**. Screens never import mock data, so removing mocks cannot break UI code.
- Mocks simulate latency (450 ms) so loading states are visible; tests use `latencyMs: 0`.
- Mock behaviour mirrors the API blueprint: closed restaurants sort last, cursor pagination, typed `not_found` errors, first OTP login = sign-up.

## 6. Backend integration boundary

```
Screens & feature hooks
        │  (domain types from @hungerly/types)
        ▼
Service contracts           src/services/contracts.ts
  AuthService · CatalogService · RestaurantService · FoodService · LocationService · OrderService
  FavoritesService · OfferService
        │
        ├── createMockServices()      src/services/mock   ← today
        └── createApiServices(client) (to be written)     ← later, using @hungerly/api-client
                │
                ▼
          Backend (FastAPI or Supabase — OD-24) → PostgreSQL
```

To connect a real backend:
1. Generate `@hungerly/api-client` from the OpenAPI contract (or write thin adapters for Supabase if OD-24 goes that way).
2. Implement `Services` in `src/services/api/` — map wire DTOs (snake_case) to `@hungerly/types` and API errors to `ServiceError` codes (codes already match API_BLUEPRINT §2.5).
3. Pass the implementation to `<ServicesProvider services={…}>` based on build configuration (`EXPO_PUBLIC_*`).
4. Replace the local cart pricing with the server bill (`GET /customer/cart`) — the `Bill` shape was designed for this.

Backend gaps found while building the guest/offers/profile work (the UI handles each honestly today):
- `GET /catalog/restaurants` has no starting price — `RestaurantSummary.startingPrice` is a proposed field (mock derives it from menus).
- No public offers listing for guests (only `GET /customer/coupons`, signed in) — `OfferService.listAvailable()`.
- Restaurant `logo_url` is in the contract, but no prototype restaurant has a logo; cards show a monogram.
- `DELETE /me` exists in the blueprint but not in the mock: deletion is refused with a clear message, never faked.
- No API or schema for wallet, scratch cards, referrals, notification inbox/preferences, help content or legal pages.
- Address management (`/customer/addresses`) and device location (expo-location) are not integrated; distances come from the server relative to the delivery address.

No endpoint URLs, keys or credentials exist in the app today, and none may be committed (SECURITY.md → Secrets management).

## 7. Development commands

From the repository root:

```bash
pnpm install              # install all workspace dependencies
pnpm dev:customer         # start the Expo dev server for the customer app
pnpm lint                 # ESLint in all packages (Turborepo)
pnpm typecheck            # TypeScript in all packages
pnpm test                 # Jest in all packages
pnpm format               # Prettier (code only; Markdown is hand-formatted)
```

From `apps/customer`:

```bash
npx expo start            # dev server (press a for Android)
npx expo-doctor           # dependency/config diagnostics
npx expo export --platform android --platform ios   # production bundle smoke build
npx expo install <pkg>    # add dependencies at SDK-compatible versions (never plain pnpm add for Expo/RN packages)
```

Running on a device: the prototype only uses modules that ship with Expo SDK 57 (`expo-doctor` confirms versions match), so it opens in Expo Go — **verified on a physical Android phone** (see §8). Once native modules outside Expo Go are added (location, payments), use a development build (`npx expo run:android` or EAS Build).

## 8. Quality status

- ✅ TypeScript strict (+ `noUncheckedIndexedAccess`), ESLint (Expo + React Compiler rules), Prettier.
- ✅ 91 unit tests in the app (cart pricing & store incl. closed-restaurant rules, checkout gate & guest cart through sign-in, food preference filtering, availability/opening times, option selection, entry routing, cuisine grid, offers & banner copy, favourites, profile summary, restaurant monograms, mock services) + 51 in `@hungerly/utils`.
- ✅ `expo-doctor` 21/21; Android and iOS Hermes bundles build.
- ✅ Visual check (before the Swaadone redesign): the full journey (onboarding → login → OTP incl. error → profile → home → listing/filter → restaurant → dish → cart → search → orders → account) was rendered in a temporary web build at 390×844 with zero console errors; layout issues found were fixed.
- ✅ Physical Android (Expo Go, before the Swaadone redesign): onboarding, login + OTP, home, restaurant list, restaurant detail, dish, add to cart, cart and tab navigation passed on 2026-10-02, after `OtpInput`, `BrandSplash`, `useQuery` and service errors moved to shared packages. No visible issues; no Metro errors.
- ⏳ The Swaadone redesign (§9) passed typecheck, lint, tests, an Android + iOS export and dev-server start; it still needs a visual pass on a phone.
- ⏳ Not yet verified on iOS devices or in an Android development build; no component/E2E tests yet (planned: React Native Testing Library, Maestro).

## 9. Swaadone redesign (2026-10-09)

**Brand.** The customer app is **Swaadone**. The name and logo come from `src/features/brand/brand.ts`; the temporary logo is `apps/customer/assets/brand/swaadone-logo.png`, which the native icon and splash (`app.json`) also use. To swap in the final logo, replace that file (square artwork) and regenerate `swaadone-adaptive-foreground.png` (the same logo at ~60% on a white 1024² canvas, so Android's icon mask does not crop it). Internal identifiers were intentionally not renamed: package names (`@hungerly/*`), the Expo `slug` (`hungerly-customer`, tied to EAS) and the deep-link `scheme` (`hungerly://`, OD-23).

**Design system.** Foodu-inspired green theme in `packages/ui/src/theme` (see DESIGN_SYSTEM.md). Shared by both apps, so the restaurant app also picks up the new palette; its own "hungerly" splash wordmark is unchanged.

**Food cards.** `features/food/components/FoodCard.tsx` is the only dish card (Home, Search, Offers deals, restaurant menus). Cart rules live in `useDishCartControls` (one place for + / − / customisable / blocked behaviour). Food-type colours come from `foodTypeStyles` in `@hungerly/ui`.

**Availability.** Closed = `RestaurantSummary.isOpen === false`. Cards turn grayscale, show a CLOSED pill and "Opens at …" when `opensAt` is known, and the add control is grey (tapping it explains why). The cart store itself refuses additions and increases for closed restaurants (`addItem` → `'closed'`), still allows removal, and blocks checkout. `useSyncCartAvailability` keeps the cart's copy of the restaurant's open state current from whatever a screen last loaded (menu, listings, cart re-check on open). There is no polling and no realtime yet: state refreshes on navigation and pull-to-refresh. The server must still reject orders for closed restaurants.

**Food preference.** Veg = `veg` + `jain`; Mixed = everything (incl. egg); Jain = only dishes typed `jain`. Plain veg is never treated as Jain, and nothing is inferred from dish names. One shared store keeps Home, Search, Offers and menus in sync.

### Backend / schema work required

| Change | Why |
|---|---|
| Add `jain` to `menu_items.food_type` (and option `food_type`) CHECK; let restaurants mark dishes Jain | `FoodType` now includes `jain` |
| Return `opens_at` ("HH:MM", next opening, only while closed) in restaurant listing/detail responses, derived from `restaurant_hours` | "Opens at …" labels |
| `menu_items.compare_at_price_minor` (nullable, > price) → `originalPrice` | Struck-through price, "Save ₹…" and the Deals grid |
| `GET /catalog/deals` (dishes with a compare-at price) | Offers → Deals on dishes |
| Home feed / search dish results include the restaurant's availability, fees and minimum order | Add-to-cart from cards without another request |
| Offer listings include the restaurant's cover image | Banner photo |
| Server-side rejection of cart/order changes for closed restaurants | UI and cart-store checks are not a security boundary |
| Realtime (or cache-invalidation) signal when a restaurant opens/closes | Today availability refreshes only on navigation/refresh |

### Delivery location — remaining work (not built)

Guests browse with no location permission; Home shows "Choose at checkout" when no address is known. Still to design and build in a later phase: asking for the delivery address when the customer proceeds to order; current location (needs `expo-location` + permission copy); map pin selection and address search (needs a maps/geocoding provider — not chosen, no credentials added); manual entry form; saving and suggesting previous addresses (`/customer/addresses` API). The checkout placeholder and the read-only `/addresses` screen are the integration points.

