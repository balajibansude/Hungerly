# ADR-012: pnpm workspaces + Turborepo for the TypeScript monorepo

- Status: Accepted
- Date: 2026-09-29
- Supersedes: the tooling part of [ADR-001](ADR-001-monorepo.md) (Dart pub workspaces + Melos, root Makefile, "no Turborepo"). The single-repository decision of ADR-001 stands.

## Context
ADR-001 rejected Turborepo because only one JavaScript app existed. With React Native (ADR-011) there are now up to four TypeScript apps (customer, restaurant, delivery, admin) plus shared TypeScript packages — exactly the situation ADR-001 said would justify revisiting.

## Decision
- **pnpm workspaces** (`apps/*`, `packages/*`) as the only JavaScript package manager; version pinned via `packageManager` in the root `package.json`.
- **Turborepo** runs workspace tasks (`lint`, `typecheck`, `test`) with dependency ordering and local caching. Root scripts: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format`, `pnpm dev:customer`.
- **`nodeLinker: hoisted`** in `pnpm-workspace.yaml`. Expo supports isolated installs, but shared React Native packages (`@hungerly/ui`) peer-depend on `react`/`react-native`; a hoisted layout guarantees Metro sees exactly one copy of each.
- Shared packages are **TypeScript source packages** (`main: src/index.ts`); Metro and TypeScript consume them directly — no build step for packages.
- **Jest** is the single test runner for TypeScript code (`jest-expo` preset for apps; `babel-preset-expo` transform for plain packages).
- **ESLint** config is shared from `@hungerly/config` (Expo's flat config + project rules). **Prettier** formats code; Markdown is formatted by hand.
- Turborepo's automatic AI-agent guidance file is disabled (`"agentGuidance": false`) to keep tool-injected files out of the repository.
- The Python backend (ADR-002) keeps its own toolchain (uv) when it is added; it is not a pnpm workspace member.

## Alternatives considered
- **pnpm alone (`pnpm -r`)**: works, but no task graph caching; acceptable fallback.
- **Nx:** more features (generators, affected graphs) than needed; heavier configuration.
- **npm/yarn workspaces:** pnpm is faster and stricter about undeclared dependencies.

## Consequences
- ➕ One command runs lint/typecheck/tests across all apps and packages; CI can use `turbo run … --filter` for affected packages.
- ➕ Shared packages change in the same PR as the apps that use them.
- ➖ Hoisting relaxes pnpm's strict dependency isolation; undeclared imports may resolve by accident — mitigated by declaring dependencies explicitly and by typecheck/lint per package.
- Cost: none (remote caching not enabled).
