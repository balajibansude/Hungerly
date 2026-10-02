# Customer App — Architecture & Developer Guide

> Status: **Phase 1A prototype** — navigable on mock data, no backend. Stack: Expo SDK 57, React Native 0.86, Expo Router, TypeScript strict ([ADR-011](../decisions/ADR-011-react-native-expo.md)).
>
> Screen-level UX specification: [FRONTEND_BLUEPRINT.md §3](../FRONTEND_BLUEPRINT.md#3-customer-application-screens). Design tokens and components: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## 1. What exists today

| Journey step | Route | Status |
|---|---|---|
| Splash / startup gate | `/` (`src/app/index.tsx`) | ✅ restores session (mock), routes to onboarding / login / profile setup / home |
| Onboarding (3 slides) | `/onboarding` | ✅ swipe or Next, Skip, animated page dots |
| Log in / sign up (phone) | `/login` | ✅ +91 mobile validation; one flow for new and returning users |
| OTP verification | `/verify` | ✅ 6-digit input with SMS autofill hints, resend timer, error state. **Prototype code: `123456`** |
| Profile setup (first sign-in) | `/profile-setup` | ✅ name + optional email, skippable |
| Home | `/home` (tab) | ✅ delivery address, greeting, search entry, quick filters, categories, offers, featured restaurants, popular dishes, nearby list, skeleton/error states, pull to refresh |
| Search | `/search` (tab) | ✅ debounced search of dishes and restaurants, suggestions, empty state |
| Orders | `/orders` (tab) | ✅ empty state (ordering not built yet) |
| Account | `/profile` (tab) | ✅ profile summary, upcoming features, log out |
| Restaurant listing | `/restaurants?filter=&cuisine=&sort=` | ✅ quick filters, sort, count, skeleton/empty/error |
| Restaurant details + menu | `/restaurants/[id]` | ✅ hero, info card, offer, veg-only toggle, category jump chips, collapsing top bar, add/stepper per dish, closed-restaurant state |
| Dish details / customisation | `/food/[id]` (modal) | ✅ options with min/max rules, validation, quantity, live price, add to cart |
| Cart | `/cart` | ✅ lines with steppers, clear cart, offer progress hint, estimated bill, minimum-order guard, checkout placeholder |

Not implemented (by design, later phases): real auth, API calls, payments, checkout/order placement, live tracking, maps, addresses, favourites, notifications, persistence across restarts.

## 2. Folder structure

```
apps/customer/
├── app.json                    # Expo config: name, scheme "hungerly", plugins, splash, icons, typed routes
├── assets/                     # app icon, adaptive icon, splash wordmark (generated from the brand font)
├── src/
│   ├── app/                    # ROUTES ONLY (Expo Router). Thin screens that compose features.
│   │   ├── _layout.tsx         # fonts, providers, root Stack, Stack.Protected guards
│   │   ├── index.tsx           # startup gate (splash + redirect)
│   │   ├── (auth)/             # onboarding, login, verify (signed-out only)
│   │   ├── (tabs)/             # home, search, orders, profile (signed-in)
│   │   ├── profile-setup.tsx
│   │   ├── restaurants/        # index (listing), [id] (details)
│   │   ├── food/[id].tsx       # dish modal
│   │   └── cart.tsx
│   ├── features/               # feature code: components, hooks, pure logic (+ tests)
│   │   ├── auth/               # session store, entry routing, OTP input, onboarding content
│   │   ├── cart/               # cart store, pricing (estimate), CartBar, BillSummary, useAddToCart
│   │   ├── home/               # header, category rail, promo carousel, greeting
│   │   ├── menu/               # menu row, option picker, selection rules, stepper behaviour
│   │   └── restaurants/        # restaurant card, info card, skeleton, quick filters
│   ├── services/               # BACKEND BOUNDARY — contracts, errors, provider, mock implementations
│   ├── hooks/useQuery.ts       # key-based async data hook (loading/error/success/refresh)
│   └── mock/                   # prototype data — imported only by services/mock (and onboarding imagery)
└── package.json
```

Conventions:
- Files in `src/app` are screens; they fetch through services, hold screen state and compose feature components. Reusable logic lives in `src/features`.
- Pure business logic (pricing, option rules, routing decisions) is framework-free and unit-tested next to its feature.
- Imports use the `@/` alias for `src/`, and `@hungerly/*` for shared packages.

## 3. Navigation

```
Root Stack
├── index                         startup gate (always reachable)
├── (auth)        [guard: signed out]
│   ├── onboarding → login → verify
├── profile-setup [guard: signed in]
├── (tabs)        [guard: signed in]     Home · Search · Orders · Account
├── restaurants/index, restaurants/[id]
├── food/[id]     (modal presentation)
└── cart
```

- **Single routing decision point:** every auth transition (finish onboarding, verify OTP, finish profile) updates the session store and replaces to `/`; `entryRouteFor()` (pure, tested) decides where to go.
- **`Stack.Protected`** hides signed-in routes from signed-out users (and vice versa). Signing out flips the guard and returns to the gate. This is a UX guard only — access control is enforced by the backend (SECURITY.md).
- **Typed routes** are enabled; `tsc` checks every `router.push` target against the real route files (types are generated in `.expo/types` when the dev server starts).
- The cart is **not a tab**: a floating `CartBar` appears whenever the cart has items (Home, listing, restaurant screens).
- Deep-link scheme: `hungerly://` (final scheme/app links: OD-23).

## 4. State

| State | Where | Why |
|---|---|---|
| Session (signed in, onboarding seen, user) | `features/auth/session.ts` (Zustand) | Needed by the gate, guards and several screens |
| Cart | `features/cart/store.ts` (Zustand) | Shared by menu, dish modal, cart bar and cart screen |
| Server data (feeds, menus, search) | `useQuery(key, load)` per screen | Loading/error/refresh with no global cache yet |
| UI state (filters, selections, dialogs) | Local `useState` | Isolated to a screen |

Cart rules implemented: one restaurant per cart (with "Start a new cart?" confirmation), identical dish + options merge into one line, quantity capped at 20 per line, the cart empties its restaurant when the last line is removed. The bill is an **estimate** (subtotal, delivery fee, offer discount, total, minimum-order and offer gaps) — the server will be the source of truth (FR-CART-2).

Session and cart are in memory only: restarting the app shows onboarding again. Persistence arrives with real auth (`expo-secure-store` for tokens).

## 5. Mock data strategy

- `src/mock/` holds fictional restaurants around Koregaon Park, Pune (10 restaurants, menus with option groups, categories, offers, a delivery address). Names are original; prices are in paise.
- Images come from the Unsplash CDN (free to use). Every photo id was checked against its description. `RemoteImage` shows a neutral fallback tile if an image is missing or fails.
- **Only `src/services/mock` imports `src/mock`** (plus static onboarding imagery). Screens never import mock data, so removing mocks cannot break UI code.
- Mocks simulate latency (450 ms) so loading states are visible; tests use `latencyMs: 0`.
- Mock behaviour mirrors the API blueprint: closed restaurants sort last, cursor pagination, typed `not_found` errors, first OTP login = sign-up.

## 6. Backend integration boundary

```
Screens & feature hooks
        │  (domain types from @hungerly/types)
        ▼
Service contracts           src/services/contracts.ts
  AuthService · CatalogService · RestaurantService · FoodService · LocationService · OrderService
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

Running on a device: the prototype only uses modules that ship with Expo SDK 57 (`expo-doctor` confirms versions match), so it is expected to open in Expo Go — this has **not yet been verified on a physical device**. Once native modules outside Expo Go are added (location, payments), use a development build (`npx expo run:android` or EAS Build).

## 8. Quality status

- ✅ TypeScript strict (+ `noUncheckedIndexedAccess`), ESLint (Expo + React Compiler rules), Prettier.
- ✅ 27 unit tests in the app (cart pricing & store, option selection, entry routing, mock services) + 12 in `@hungerly/utils`.
- ✅ `expo-doctor` 21/21; Android and iOS Hermes bundles build.
- ✅ Visual check: the full journey (onboarding → login → OTP incl. error → profile → home → listing/filter → restaurant → dish → cart → search → orders → account) was rendered in a temporary web build at 390×844 with zero console errors; layout issues found were fixed.
- ⏳ Not yet verified on physical Android/iOS devices; no component/E2E tests yet (planned: React Native Testing Library, Maestro).
