# Hungerly Partner — Restaurant App

Expo (React Native) app for restaurant owners, managers and staff. **Prototype**: runs entirely on in-memory mock data; no backend, real authentication or notifications.

```bash
# from the repository root
pnpm install
pnpm dev:restaurant        # dev server on port 8082 (the customer app uses 8081); open in Expo Go
```

Prototype login (phone or email, code **123456**):

- **98765 43210** — demo owner of *Masala Junction*, Koregaon Park, Pune → restaurant workspace with 11 demo orders
- any other valid phone number or email — a new account → registration → workspace (the restaurant stays in review)

Status: Phase 4 — sign-in, restaurant registration (7 steps) and orders (board, detail, accept with prep time, reject, mark ready) work on mock services, verified on a physical Android phone in Expo Go (2026-10-02). New registrations are `pending_review` with no orders (prototype: nothing approves them). Dashboard, menu and insights are placeholders until their phases. Prototype limits and open decisions: [DEVELOPMENT_ROADMAP.md](../../docs/DEVELOPMENT_ROADMAP.md#restaurant-app-prototype-frontend-ahead-on-mocks--in-progress).

- Screen specifications: [docs/FRONTEND_BLUEPRINT.md §4](../../docs/FRONTEND_BLUEPRINT.md#4-restaurant-partner-application-screens)
- Design system: [docs/frontend/DESIGN_SYSTEM.md](../../docs/frontend/DESIGN_SYSTEM.md)
- Expo conventions for this SDK: [AGENTS.md](AGENTS.md)
