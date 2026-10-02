# ADR-005: Flutter for customer, restaurant and delivery apps

- Status: Superseded by [ADR-011](ADR-011-react-native-expo.md) (2026-09-29)
- Date: 2026-09-29

## Context
Three mobile apps are needed for Android and iOS. They need maps, background location (delivery), high-priority push with custom sounds (restaurant), payments SDK (customer) and good performance on low/mid-range Android devices. The team is small and prefers Flutter.

## Decision
Build all three apps with **Flutter** (stable channel, pinned with FVM), sharing Dart packages `hungerly_api` (generated), `hungerly_core` and `hungerly_ui`. State: **Riverpod**; navigation: **go_router**; HTTP: **Dio**. Details in [FRONTEND_BLUEPRINT.md](../FRONTEND_BLUEPRINT.md).

## Alternatives considered
- **React Native / Expo:** large ecosystem and shared TypeScript with the admin app; but types are generated from OpenAPI anyway, and Flutter gives more consistent rendering/performance across low-end Android devices. Expo managed workflow constraints around background location/foreground services would add friction.
- **Native (Kotlin + Swift):** best platform access, but 6 native code bases (3 apps × 2 platforms) is unrealistic for two developers.
- **PWA:** no reliable background location, weak push on iOS, poor fit for restaurant alerts and rider tracking.

## Consequences
- ➕ One language for all mobile apps; shared design system and core; strong performance; mature plugins (google_maps_flutter, geolocator, firebase_messaging, razorpay_flutter).
- ➖ Background location and OEM battery management need native configuration and device testing (spike in Phase 1).
- ➖ Dart cannot share code with the TypeScript admin — accepted; the OpenAPI contract is the shared layer.
- Cost: free tooling. Scalability: adding a fourth app (e.g. restaurant web via Flutter web) reuses packages.
