# Hungerly

Hungerly is a food-delivery platform connecting **customers**, **restaurants** and **delivery partners**, operated through an **admin dashboard**. It is being built by a small team with a focus on correctness (money and order state), low operating cost and a clear path to scale.

> **Project status: Phase 0 — Architecture.** The repository currently contains the architecture blueprint only. No application code has been written yet. Implementation starts after the blueprint is reviewed and approved.

## Architecture summary

| Component | Technology | Location |
|---|---|---|
| Customer app | Flutter (Android, iOS) | `apps/customer` |
| Restaurant partner app | Flutter (Android/iOS phones and tablets) | `apps/restaurant` |
| Delivery partner app | Flutter (Android first, iOS) | `apps/delivery` |
| Admin dashboard | React + TypeScript + Vite (static SPA) | `apps/admin` |
| Backend API + workers | Python 3.13, FastAPI, SQLAlchemy 2, ARQ — modular monolith | `backend/` |
| Database | PostgreSQL 16+ with PostGIS | managed service |
| Cache / queue / realtime | Redis (Valkey-compatible) | managed service |
| Files | S3-compatible object storage + CDN | managed service |
| API contract | OpenAPI generated from the backend → generated Dart & TypeScript clients | `contracts/`, `packages/` |

Key integrations: Razorpay (payments), SMS provider for OTP (MSG91 recommended), Firebase Cloud Messaging (push), Google Maps Platform (maps), Sentry (errors).

Read the full design in [docs/BLUEPRINT.md](docs/BLUEPRINT.md).

## Repository structure

Planned layout (directories are created in Phase 1):

```
apps/
  customer/        Flutter customer app
  restaurant/      Flutter restaurant partner app
  delivery/        Flutter delivery partner app
  admin/           React + Vite admin dashboard
backend/           FastAPI API and ARQ workers (Python)
packages/
  hungerly_api/    generated Dart API client
  hungerly_core/   shared Dart core (networking, auth, config, errors, realtime)
  hungerly_ui/     shared Dart design system
  api-client-ts/   generated TypeScript API client
contracts/         OpenAPI spec and event schemas
infra/             local Docker Compose, Terraform (later)
scripts/           codegen and maintenance scripts
docs/              blueprint, schema, API, frontend, roadmap, security, ADRs
```

Currently present:

```
docs/
  BLUEPRINT.md
  DATABASE_SCHEMA.md
  API_BLUEPRINT.md
  FRONTEND_BLUEPRINT.md
  DEVELOPMENT_ROADMAP.md
  SECURITY.md
  decisions/ (ADR-001 … ADR-010)
README.md  .gitignore  .editorconfig
```

## Development principles

1. **The blueprint is the source of truth.** Changes to architecture are made by PR to `docs/`, with an ADR for significant decisions.
2. **The server owns business rules.** Prices, totals, permissions and state transitions are decided by the backend only.
3. **Correctness before features** for money and orders: idempotency, transactions, DB constraints, audit trails.
4. **Keep it simple.** Modular monolith, managed services, no technology without a documented need.
5. **Contract first.** API schemas generate the OpenAPI spec and typed clients; no hand-written duplicates.
6. **Secure by default.** No secrets in Git or clients; least privilege; see [docs/SECURITY.md](docs/SECURITY.md).
7. **Vertical slices.** Each phase delivers backend + UI working together against a real backend.
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

Installed tools (exact versions will be pinned in repository files during Phase 1):

- Git
- Docker and Docker Compose
- Python 3.13 and [uv](https://docs.astral.sh/uv/)
- Flutter (stable), managed with [FVM](https://fvm.app/)
- Android Studio (Android SDK + emulator); Xcode on macOS for iOS builds
- Node.js 24 LTS and pnpm (via Corepack)
- make

## How to run the project

There is nothing to run yet — Phase 0 contains documentation only.

From Phase 1, the intended workflow is:

```bash
make setup     # install toolchain dependencies (uv, melos/pub, pnpm)
make dev       # start local services (PostgreSQL+PostGIS, Redis, MinIO, Mailpit) and the backend
make test      # run all test suites
make lint      # run linters and type checks
make codegen   # regenerate OpenAPI contract and API clients
```

Each area will also document its own commands (`backend/README.md`, `apps/*/README.md`). Local configuration is copied from `.env.example` files into untracked `.env` files; real credentials are never committed.

## Documentation

| Document | Contents |
|---|---|
| [BLUEPRINT.md](docs/BLUEPRINT.md) | Product scope, architecture, technology decisions, NFRs, operations, risks, open decisions |
| [DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) | Entities, fields, keys, relationships, indexes, constraints, business rules |
| [API_BLUEPRINT.md](docs/API_BLUEPRINT.md) | API conventions and endpoint catalogue with detailed specs for key endpoints |
| [FRONTEND_BLUEPRINT.md](docs/FRONTEND_BLUEPRINT.md) | Client architecture and every screen of the four apps |
| [DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md) | Phases 0–12 with tasks, dependencies, deliverables and acceptance criteria |
| [SECURITY.md](docs/SECURITY.md) | Authentication, authorization, secrets, API/payment/upload security, privacy |
| [decisions/](docs/decisions/) | Architecture Decision Records |

## Contribution workflow

1. Pick a task from the current phase in the [roadmap](docs/DEVELOPMENT_ROADMAP.md).
2. Update your developer branch: `git switch balaji && git pull` (or `teammate`), then merge the latest `main` if needed.
3. Create a work branch: `git switch -c feature/p2-otp-login`.
4. Make small, focused commits with clear messages (e.g. `feat(auth): add OTP verification endpoint`).
5. Run tests and linters locally.
6. Push the work branch and open a PR into your developer branch; request review from the other developer.
7. When a coherent set of work is ready, open a PR from your developer branch into `main`. CI must pass and one approval is required.
8. Update docs, `.env.example` and the OpenAPI contract in the same PR when behaviour or configuration changes.

## License

To be decided. Until a license is added, all rights are reserved by the project owners.
