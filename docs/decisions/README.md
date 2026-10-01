# Architecture Decision Records

Each ADR records one significant decision: context, decision, alternatives, consequences. ADRs are immutable once **Accepted**; to change a decision, write a new ADR that supersedes the old one.

| ADR | Title | Status |
|---|---|---|
| [ADR-001](ADR-001-monorepo.md) | Polyglot monorepo without Turborepo/Nx | Tooling superseded by ADR-012 (single repo stands) |
| [ADR-002](ADR-002-backend.md) | Python + FastAPI modular monolith | Proposed |
| [ADR-003](ADR-003-database.md) | PostgreSQL with PostGIS | Proposed |
| [ADR-004](ADR-004-authentication.md) | In-house authentication: phone OTP, JWT + rotating refresh tokens, admin TOTP | Proposed |
| [ADR-005](ADR-005-mobile-framework.md) | Flutter for customer, restaurant and delivery apps | Superseded by ADR-011 |
| [ADR-006](ADR-006-admin-web.md) | React + TypeScript + Vite SPA for the admin dashboard | Proposed |
| [ADR-007](ADR-007-api-contract.md) | REST + generated OpenAPI contract with client codegen | Proposed (amended by ADR-011: TypeScript client only) |
| [ADR-008](ADR-008-async-realtime.md) | Redis for jobs (ARQ), caching, pub/sub and rider geo index; WebSocket realtime | Proposed |
| [ADR-009](ADR-009-payments.md) | Razorpay as payment provider | Proposed (amended by ADR-011: React Native SDK) |
| [ADR-010](ADR-010-hosting.md) | Managed containers + managed PostgreSQL/Redis in an India region | Proposed |
| [ADR-011](ADR-011-react-native-expo.md) | React Native + Expo for the mobile apps | Accepted |
| [ADR-012](ADR-012-pnpm-turborepo.md) | pnpm workspaces + Turborepo for the TypeScript monorepo | Accepted |

Statuses: Proposed → Accepted → (Superseded by ADR-NNN | Deprecated). All ADRs become **Accepted** when the Phase 0 blueprint is approved.

## Template

```markdown
# ADR-NNN: Title
- Status: Proposed | Accepted | Superseded by ADR-XXX
- Date: YYYY-MM-DD
## Context
## Decision
## Alternatives considered
## Consequences (positive, negative, cost, scalability)
```
