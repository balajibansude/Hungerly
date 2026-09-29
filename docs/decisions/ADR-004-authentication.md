# ADR-004: In-house authentication — phone OTP, JWT + rotating refresh tokens, admin TOTP

- Status: Proposed
- Date: 2026-09-29

## Context
Customers, restaurant staff and delivery partners sign in with their phone number (the norm in India). Admins need strong authentication. The same person may use several apps with different roles. Sessions must be revocable immediately (suspension, theft).

## Decision
Implement authentication in the backend `auth` module using well-reviewed libraries (PyJWT/cryptography, argon2-cffi, pyotp):
- Phone + SMS OTP (hashed, short-lived, rate-limited) for non-admin users; SMS via a provider adapter (MSG91 recommended).
- Email + Argon2id password + mandatory TOTP for admins.
- Access token: Ed25519-signed JWT, 15 minutes, with `sid`; Redis deny-list for revoked sessions.
- Refresh token: opaque, hashed in `auth_sessions`, rotated on each use with reuse detection.
- Mobile: secure storage; admin web: HttpOnly `SameSite=Strict` cookie for refresh + in-memory access token.
Details in [SECURITY.md](../SECURITY.md).

## Alternatives considered
- **Firebase Authentication (phone):** quick to integrate and handles SMS, but per-verification SMS pricing, identity split between Firebase and our DB (roles/sessions still ours), limited control over session revocation semantics and multi-app role scoping, and vendor lock-in.
- **Auth0 / Clerk:** feature-rich, but per-MAU pricing becomes significant for a consumer app; phone OTP still billed per SMS; another critical external dependency.
- **Supabase Auth:** good, but pulls towards the Supabase platform.
- **Keycloak (self-hosted):** powerful, but heavy to operate for a two-person team.

## Consequences
- ➕ No per-user fees; one source of truth for identity, roles and sessions; full control of token lifetimes, revocation and multi-app behaviour.
- ➖ Security responsibility is ours — mitigated by strict adherence to SECURITY.md, library use (no custom crypto), tests for every flow, and a pre-launch security review.
- Cost: SMS only. Scalability: stateless verification; sessions table and Redis scale easily.
