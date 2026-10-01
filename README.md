# Hungerly

Hungerly is a food-delivery platform connecting **customers**, **restaurants** and **delivery partners**, operated through an **admin dashboard**. It is being built by a small team with a focus on correctness (money and order state), low operating cost and a clear path to scale.

> **Project status: Phase 1A — frontend foundation.** The architecture blueprint is written (Phase 0) and a **customer app prototype** runs on mock data. There is no backend yet; the backend platform is open decision OD-24.

## Architecture summary

| Component | Technology | Location |
|---|---|---|
| Customer app | React Native + Expo (Android, iOS) — prototype ✅ | `apps/customer` |
| Restaurant partner app | React Native + Expo (Android/iOS phones and tablets) — next | `apps/restaurant` |
| Delivery partner app | React Native + Expo (Android first, iOS) — later | `apps/delivery` |
| Admin dashboard | React + TypeScript + Vite (static SPA) | `apps/admin` |
| Backend API + workers | Python 3.13, FastAPI, SQLAlchemy 2, ARQ — modular monolith (platform under review: OD-24) | `backend/` |
| Database | PostgreSQL 16+ with PostGIS | managed service |
| Cache / queue / realtime | Redis (Valkey-compatible) | managed service |
| Files | S3-compatible object storage + CDN | managed service |
| Shared TypeScript packages | Design system, domain types, utilities, config (pnpm + Turborepo) | `packages/` |
| API contract | OpenAPI generated from the backend → generated TypeScript client | `contracts/`, `packages/api-client` |

Key integrations: Razorpay (payments), SMS provider for OTP (MSG91 recommended), Firebase Cloud Messaging (push), Google Maps Platform (maps), Sentry (errors).

Read the full design in [docs/BLUEPRINT.md](docs/BLUEPRINT.md).

## Repository structure

```
apps/
  customer/        Expo customer app (prototype, mock data)          ✅
  restaurant/      Expo restaurant partner app                        (next)
  delivery/        Expo delivery partner app                          (later)
  admin/           React + Vite admin dashboard                        (later)
packages/
  config/          @hungerly/config — shared tsconfig + ESLint         ✅
  types/           @hungerly/types — client domain types               ✅
  utils/           @hungerly/utils — money, formatting, phone helpers  ✅
  ui/              @hungerly/ui — design system (React Native)         ✅
  api-client/      @hungerly/api-client — generated from OpenAPI       (later)
backend/           API and workers                                     (later, OD-24)
contracts/         OpenAPI spec and event schemas                      (later)
docs/              blueprint, schema, API, frontend, roadmap, security, ADRs
package.json  pnpm-workspace.yaml  turbo.json
```

## Development principles

1. **The blueprint is the source of truth.** Changes to architecture are made by PR to `docs/`, with an ADR for significant decisions.
2. **The server owns business rules.** Prices, totals, permissions and state transitions are decided by the backend only.
3. **Correctness before features** for money and orders: idempotency, transactions, DB constraints, audit trails.
4. **Keep it simple.** Modular monolith, managed services, no technology without a documented need.
5. **Contract first.** API schemas generate the OpenAPI spec and typed clients; no hand-written duplicates.
6. **Secure by default.** No secrets in Git or clients; least privilege; see [docs/SECURITY.md](docs/SECURITY.md).
7. **Backend-agnostic frontend.** Apps talk to data only through service interfaces; mocks today, the API client later — screens never change for integration.
8. **Tested and reviewed.** Every change goes through CI and review by the other developer ([Definition of Done](docs/BLUEPRINT.md#61-definition-of-done)).

## Branch strategy

| Branch | Purpose | Rules |
|---|---|---|
| `main` | Stable, production-ready code | Protected. Changes only via pull request with passing CI and one approval. Never developed on directly. |
| `balaji` | Balaji's development branch | Integration branch for Balaji's feature branches. PR into `main`. |
| `teammate` | Teammate's development branch | Integration branch for the teammate's feature branches. PR into `main`. |
| `feature/<phase>-<name>`, `docs/<name>`, `fix/<name>` | Short-lived work branches | Created from `balaji` or `teammate`; merged back via PR. |

Rules:
- Never commit directly to `main`.
- **No force pushes** and no rewriting of shared history on `main`, `balaji` or `teammate`.
- Keep your developer branch up to date by merging `main` into it (not rebasing shared branches).
- Never commit secrets, `.env` files or credentials. Only `.env.example` templates are committed.

## Local setup prerequisites

- Git
- Node.js 24 (see `.nvmrc`) and pnpm 10 (via Corepack: `corepack enable`)
- For running the mobile apps: Android Studio (SDK + emulator) or a phone with Expo Go; Xcode on macOS for iOS simulators
- Later, for the backend: Python 3.13 + [uv](https://docs.astral.sh/uv/), Docker (depends on OD-24)

## How to run the project

```bash
pnpm install              # install all workspace dependencies
pnpm dev:customer         # start the customer app (Expo dev server)

pnpm lint                 # ESLint across apps and packages (Turborepo)
pnpm typecheck            # TypeScript across apps and packages
pnpm test                 # Jest across apps and packages
pnpm format               # Prettier (code; Markdown is formatted by hand)
```

The customer prototype uses mock data. Prototype login: any valid Indian mobile number, OTP `123456`. Details: [apps/customer/README.md](apps/customer/README.md).

Local configuration for later phases will be copied from `.env.example` files into untracked `.env` files; real credentials are never committed. Mobile builds only use public `EXPO_PUBLIC_*` values.

## Documentation

| Document | Contents |
|---|---|
| [BLUEPRINT.md](docs/BLUEPRINT.md) | Product scope, architecture, technology decisions, NFRs, operations, risks, open decisions |
| [DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) | Entities, fields, keys, relationships, indexes, constraints, business rules |
| [API_BLUEPRINT.md](docs/API_BLUEPRINT.md) | API conventions and endpoint catalogue with detailed specs for key endpoints |
| [FRONTEND_BLUEPRINT.md](docs/FRONTEND_BLUEPRINT.md) | Client architecture and every screen of the four apps |
| [DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md) | Phases 0–12 with tasks, dependencies, deliverables and acceptance criteria |
| [SECURITY.md](docs/SECURITY.md) | Authentication, authorization, secrets, API/payment/upload security, privacy |
| [frontend/CUSTOMER_APP.md](docs/frontend/CUSTOMER_APP.md) | Customer app architecture, navigation, state, mock data, backend boundary, commands |
| [frontend/DESIGN_SYSTEM.md](docs/frontend/DESIGN_SYSTEM.md) | Colours, typography, spacing, components and conventions |
| [decisions/](docs/decisions/) | Architecture Decision Records (ADR-011: React Native + Expo; ADR-012: pnpm + Turborepo) |

## Contribution workflow

1. Pick a task from the current phase in the [roadmap](docs/DEVELOPMENT_ROADMAP.md).
2. Update your developer branch: `git switch balaji && git pull` (or `teammate`), then merge the latest `main` if needed.
3. Create a work branch: `git switch -c feature/p1-restaurant-app`.
4. Make small, focused commits with clear messages (e.g. `feat(auth): add OTP verification endpoint`).
5. Run `pnpm lint && pnpm typecheck && pnpm test` locally.
6. Push the work branch and open a PR into your developer branch; request review from the other developer.
7. When a coherent set of work is ready, open a PR from your developer branch into `main`. CI must pass and one approval is required.
8. Update docs, `.env.example` and the OpenAPI contract in the same PR when behaviour or configuration changes.

## License

To be decided. Until a license is added, all rights are reserved by the project owners.
