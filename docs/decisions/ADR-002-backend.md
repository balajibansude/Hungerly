# ADR-002: Python + FastAPI modular monolith

- Status: Proposed
- Date: 2026-09-29

## Context
The backend serves four client apps with REST and realtime APIs, integrates payments/SMS/push/maps, runs background jobs, and must be maintainable by two developers. Future AI/ML features are expected. The workload is I/O-bound (DB, Redis, providers), not CPU-bound.

## Decision
- **Python 3.13 + FastAPI** (ASGI, Uvicorn), **Pydantic v2**, **SQLAlchemy 2 (async) + asyncpg**, **Alembic**, **ARQ** workers.
- Architecture: **modular monolith** — one code base and image with `api` and `worker` entrypoints; domain modules (`auth`, `restaurants`, `menu`, `cart`, `orders`, `payments`, `delivery`, `dispatch`, `notifications`, …) with boundaries enforced by `import-linter`.

## Alternatives considered
- **Node.js + NestJS (TypeScript):** strong typing and shared TS with admin; but mobile is Dart, so end-to-end type sharing is limited (OpenAPI codegen is needed anyway); weaker fit for future ML work.
- **Go:** excellent performance and simple deployment; slower feature development for CRUD-heavy domains, smaller ecosystem for our integrations, less team familiarity.
- **Django + DRF:** batteries included (admin, ORM, auth); synchronous-first design is awkward for WebSockets/async I/O; Django admin is not sufficient for operational tooling; still a reasonable option.
- **Microservices:** independent scaling/ownership, but significant operational and consistency overhead for a pilot with two developers.

## Consequences
- ➕ Fast development, automatic OpenAPI from Pydantic schemas (enables typed Dart/TS clients), strong async I/O, best ecosystem for AI/ML later.
- ➕ One deployable → simple CI/CD, transactions across modules, low cost.
- ➖ Python CPU performance is lower — mitigated by keeping CPU-heavy work (image processing, reports) in workers and scaling horizontally.
- ➖ Monolith discipline required — enforced with import contracts and code review; extraction of `dispatch`/location or `notifications` into services remains possible later.
- Cost: small containers. Scalability: stateless horizontal scaling; module extraction path.
