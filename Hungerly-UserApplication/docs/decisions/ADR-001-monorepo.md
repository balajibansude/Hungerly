# ADR-001: Polyglot monorepo without Turborepo/Nx

- Status: Proposed — tooling superseded by [ADR-012](ADR-012-pnpm-turborepo.md) (2026-09-29); the single-repository decision stands
- Date: 2026-09-29

## Context
Hungerly has three Flutter apps, one React admin app, a Python backend, shared Dart packages and one API contract. Two developers work across all of them; many features touch backend and clients in the same change.

## Decision
Use a **single Git repository** with `apps/`, `backend/`, `packages/`, `contracts/`, `infra/`, `docs/`.
- Dart: pub workspaces + Melos.
- Python: uv project in `backend/`.
- TypeScript: pnpm workspace limited to `apps/admin` and `packages/api-client-ts`.
- A root `Makefile` provides common entry points (`setup`, `dev`, `test`, `lint`, `codegen`).
- CI uses path filters per area.
- **No Turborepo or Nx** for now.

## Alternatives considered
- **Polyrepo (one repo per app):** clean ownership, but cross-cutting changes need coordinated PRs and contract versioning between repos; overhead for a two-person team.
- **Monorepo with Turborepo:** good caching for JS/TS tasks, but only one JS app exists; it does not natively understand Dart or Python, so it would be one more tool without much gain.
- **Nx:** powerful, but heavy configuration and plugin reliance for Flutter/Python.

## Consequences
- ➕ Atomic PRs across backend + clients; one place for contract, docs and CI.
- ➕ Each ecosystem uses its native tooling (fewer surprises).
- ➖ Contributors need three toolchains installed (documented in README; each area can be worked on independently).
- ➖ CI must be carefully path-filtered to stay fast.
- Cost: none. Scalability: revisit if more JS apps are added (then Turborepo becomes worthwhile) or teams grow enough to split repositories.
