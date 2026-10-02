# ADR-006: React + TypeScript + Vite SPA for the admin dashboard

- Status: Proposed
- Date: 2026-09-29

## Context
The admin dashboard is an internal, authenticated desktop tool: dense tables, filters, forms, document viewing, maps (zones, live ops), charts. No SEO, no public pages.

## Decision
Build `apps/admin` as a **static SPA** with **React + TypeScript + Vite**, React Router, TanStack Query/Table, React Hook Form + Zod, Tailwind CSS + shadcn/ui, a generated TypeScript API client. Hosted as static files on a CDN.

## Alternatives considered
- **Next.js:** excellent framework, but its main advantages (SSR, SEO, server components, edge rendering) do not apply to an internal authenticated tool; it adds a Node server (or platform lock-in) and a larger attack surface. **Reserved for a future public customer web app**, where SSR/SEO matter.
- **Flutter web:** would reuse Dart packages, but data-dense desktop UIs, tables and accessibility are weaker than in the React ecosystem.
- **Low-code (Retool, Appsmith):** fast for CRUD, but per-seat cost, limited custom workflows (live maps, complex approvals), and direct DB access undermines our API authorization model.
- **Django admin / SQLAdmin:** bypasses domain services and audit logging; unsuitable for operations staff.

## Consequences
- ➕ Simplest deployment (static files), near-zero hosting cost, strong ecosystem for tables/forms/maps, strict CSP easy to apply.
- ➖ Second frontend language (TypeScript) in the repo — accepted; limited to one app.
- Scalability: CDN-served; all load is on the API.
