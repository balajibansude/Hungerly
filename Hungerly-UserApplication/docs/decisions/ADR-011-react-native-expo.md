# ADR-011: React Native + Expo for the customer, restaurant and delivery apps

- Status: Accepted
- Date: 2026-09-29
- Supersedes: [ADR-005](ADR-005-mobile-framework.md) (Flutter)
- Amends: [ADR-007](ADR-007-api-contract.md) — one generated TypeScript client instead of Dart + TypeScript

## Context
ADR-005 chose Flutter. Before any mobile code was written, the project owner decided to build the mobile apps with React Native and Expo. The admin dashboard is already React + TypeScript (ADR-006), the team works in TypeScript, and the development machines have Node/pnpm but not the Flutter SDK.

The requirements from ADR-005 still apply: Android and iOS apps with maps, background location (delivery app), high-priority push with custom sounds (restaurant app), a payments SDK (customer app) and good performance on low/mid-range Android.

## Decision
- Build all three mobile apps with **React Native + Expo** (Expo SDK 57 at the time of writing), **TypeScript strict**, **Expo Router** (file-based navigation, typed routes), **React Native Reanimated** for animation, **expo-image** for cached images.
- Apps use **development builds** (not Expo Go) as soon as a feature needs a native module outside Expo Go (background location, payments). Native projects are generated (Continuous Native Generation); `ios/` and `android/` are not committed.
- Shared code lives in TypeScript workspace packages consumed by all apps, including the admin: `@hungerly/ui` (design system; React Native), `@hungerly/types`, `@hungerly/utils`, `@hungerly/config`, and later `@hungerly/api-client` (generated from OpenAPI).
- State: local component state first; **Zustand** only for genuinely shared client state (e.g. the cart); server state behind a small query hook that can be swapped for TanStack Query when the real API arrives.
- Styling: **typed design tokens + `StyleSheet`** (no Tailwind layer), so every value is type-checked and there is no extra Babel/Metro configuration.

## Alternatives considered
- **Flutter (ADR-005):** strong rendering consistency and performance on low-end Android; but a second language alongside the TypeScript admin, no code sharing with the admin, and the SDK/toolchain is not part of the team's current setup.
- **Bare React Native (no Expo):** full control, but more native maintenance (upgrades, build config) for a two-person team; Expo's config plugins and prebuild cover our needs.
- **NativeWind (Tailwind) styling:** familiar syntax, but adds build configuration and version coupling; tokens + StyleSheet keep one source of truth that is checked by TypeScript.

## Consequences
- ➕ One language (TypeScript) across mobile apps, admin and shared packages; domain types and utilities are shared directly.
- ➕ One OpenAPI code generator (TypeScript) instead of two.
- ➕ Expo tooling: config plugins, EAS Build/Submit, over-the-air updates (EAS Update) for JS-only fixes.
- ➖ JavaScript-thread performance must be managed on low-end Android: Hermes, UI-thread animations (Reanimated), virtualised lists, cached/resized images, and profiling on real devices.
- ➖ Background location and OEM battery management still need device testing — the Phase 1 spike now targets `expo-location` + `expo-task-manager` in a development build.
- ➖ Native modules without Expo support need config plugins or a custom dev client.
- Cost: free tooling; EAS has a free tier (paid plans only if build volume requires). Scalability: additional apps reuse `@hungerly/ui` and shared packages.
