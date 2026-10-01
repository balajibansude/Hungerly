# ADR-007: REST + generated OpenAPI contract with client codegen

- Status: Proposed — amended by [ADR-011](ADR-011-react-native-expo.md): only a TypeScript client is generated
- Date: 2026-09-29

## Context
Four clients in two languages (Dart, TypeScript) consume one backend. Keeping request/response types in sync by hand is error-prone.

## Decision
- **REST/JSON** API versioned under `/api/v1`, separated by actor surface.
- **Pydantic schemas are the single source of truth**; FastAPI generates OpenAPI, exported to `contracts/openapi.json` and committed.
- CI regenerates the spec and **fails on drift**; Dart (`packages/hungerly_api`) and TypeScript (`packages/api-client-ts`) clients are generated from it (generator choice finalised in Phase 1, e.g. `openapi-generator` dart-dio and `openapi-typescript` + `openapi-fetch`).
- Errors as RFC 9457 Problem Details with stable codes; cursor pagination; idempotency keys for money operations.
- Realtime via WebSocket for server→client events; push for background; REST for commands.

## Alternatives considered
- **GraphQL:** flexible querying, but harder authorization per field, caching and rate limiting; more complexity than our screen-driven needs require.
- **gRPC / Connect:** great typing, but weaker browser/mobile tooling ergonomics and debugging for a small team; not needed for internal service-to-service calls yet.
- **Handwritten clients/types:** drift and duplicated effort.
- **SSE instead of WebSocket:** simpler, but one-directional and less convenient on mobile; WebSocket keeps options open (e.g. chat later).

## Consequences
- ➕ Typed clients in all apps, contract changes visible in PR diffs, easy debugging with standard HTTP tools.
- ➖ Generated code must never be hand-edited; generator quirks may need small templates/config.
- Cost: none. Scalability: stateless HTTP; WebSocket fan-out via Redis pub/sub.
