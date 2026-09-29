# Hungerly — Security

> Status: **Draft for review** (Phase 0). Security requirements for design and implementation. Every PR is expected to respect this document (BLUEPRINT §61). Target baseline: **OWASP ASVS Level 2**, with the **OWASP API Security Top 10** and **OWASP MASVS** (mobile) as checklists.

Related: [BLUEPRINT.md](BLUEPRINT.md) §19, §20, §42–§45 · [API_BLUEPRINT.md](API_BLUEPRINT.md) · [ADR-004](decisions/ADR-004-authentication.md)

## Reporting a vulnerability

Do not open a public issue. Contact the maintainers privately (a `security@` address will be set up before launch). Include steps to reproduce and impact.

---

## Threat model summary

| Asset | Threats | Key controls |
|---|---|---|
| Customer accounts | OTP brute force, SIM-swap, session theft | OTP limits, hashed OTPs, short access tokens, refresh rotation + reuse detection, device session list/revoke |
| Admin accounts | Phishing, credential stuffing, insider misuse | Password + mandatory TOTP, lockouts, least-privilege sub-roles, audit logs, IP/device alerts |
| Payments | Amount tampering, fake success, webhook spoofing, double refunds | Server-side amounts, signature verification, provider status fetch, idempotency, DB constraints |
| Orders & state | Unauthorized transitions, race conditions, IDOR | Ownership policies, state machine, optimistic locking |
| PII (phones, addresses, KYC) | Leakage via API, logs, storage, staff | Minimisation, masking, private buckets, presigned short-lived access, log redaction, retention limits |
| Location data | Tracking abuse, stalking | Only shared during an active delivery, only with that order's customer, retention 30 days |
| Infrastructure | Secret leakage, exposed databases, supply-chain attacks | Secret manager, private networking, dependency/image scanning, least-privilege IAM |

---

## Authentication

- **Customers, restaurant staff, delivery partners:** phone number + SMS OTP.
  - 6-digit OTP from a CSPRNG; valid 5 minutes; single use; **stored as HMAC-SHA256** (with server secret) in Redis bound to `otp_request_id` + phone; max 5 verification attempts; resend cooldown 30 s.
  - Rate limits per phone, IP and device (see [Rate limiting](#rate-limiting)).
  - Same response for existing and new numbers (no enumeration).
  - Android SMS Retriever/User Consent API for autofill (reduces phishing of codes into other apps).
  - SMS templates DLT-registered; OTP message includes app hash and "do not share" warning.
- **Admins:** email + password + **mandatory TOTP** (RFC 6238). OTP login is disabled for admin accounts. Recovery codes (10, single-use, hashed) issued at enrolment; MFA reset only by a super admin with audit log.
- **Restaurant staff (post-MVP option):** email + password with optional TOTP for owners.
- **Account suspension** revokes all sessions immediately.
- **Step-up:** sensitive admin actions (refunds above threshold, admin user management) require a recent authentication (≤ 15 min) — post-MVP if not ready at launch.

## JWT and session strategy

| Item | Decision |
|---|---|
| Access token | JWT, **EdDSA (Ed25519)**, 15-minute lifetime; claims `iss`, `aud` (client app), `sub`, `sid`, `roles`, `iat`, `exp`, `jti`; header `kid` |
| Validation | Signature, `alg` allow-list (no `none`, no HS/RS confusion), `iss`, `aud`, `exp`/`nbf` with ≤ 30 s leeway, session not revoked (Redis deny-list by `sid`) |
| Refresh token | Opaque 256-bit random; stored as HMAC-SHA256 (with pepper) in `auth_sessions`; rotated on each use; old token reuse ⇒ **revoke whole session** and audit `auth.refresh_reuse_detected` |
| Lifetimes | Mobile: 30-day sliding / 90-day absolute. Admin: 12-hour sliding / 7-day absolute |
| Storage — mobile | Refresh token in `flutter_secure_storage` (iOS Keychain, Android Keystore-backed); access token in memory only |
| Storage — admin web | Refresh token in cookie `__Host-hg_rt`: `HttpOnly; Secure; SameSite=Strict; Path=/`; scoped by the refresh endpoint's checks; access token in memory (never localStorage) |
| Key rotation | New signing key added with new `kid`; old public keys kept until all tokens expire; rotation at least yearly and immediately on suspected compromise |
| Logout | Revokes session server-side; client deletes tokens |
| WebSocket | Short-lived (60 s), single-use ticket from `POST /auth/ws-ticket`; tokens never placed in URLs |

## Password security

- Hashing: **Argon2id** (argon2-cffi) with parameters tuned to ~50–100 ms on production hardware (initially m=64 MiB, t=3, p=1), re-hash on login when parameters change.
- Policy (NIST SP 800-63B): minimum 12 characters, no composition rules, check against a breached-password list (k-anonymity range API or local top-N list), no forced periodic rotation.
- Login errors are generic; constant-time comparison; lockout with exponential backoff after 5 failures per account and per IP; alert on unusual patterns.
- Password reset: single-use token (hashed in DB), 30-minute expiry, sent to verified email, invalidates all sessions on success.

## Authorization

- **Deny by default.** Every route declares its required policy via a FastAPI dependency; a CI test enumerates all routes and fails if any route lacks an explicit policy (or an explicit `public` marker).
- **Three layers** (BLUEPRINT §20): API surface by coarse role → scoped role (restaurant `staff_role`, admin `admin_role`) → resource ownership.
- **IDOR prevention:** resources are always loaded with the caller's scope in the query (e.g. `WHERE id = :id AND customer_user_id = :caller`), not fetched first and checked later. Not-found and not-allowed both return `404` for customer-owned resources.
- **Mass-assignment prevention:** separate Pydantic input schemas per operation; fields like `status`, `commission_bps`, `approved_at` are never client-writable except via dedicated admin endpoints.
- **Server-side state machine** for orders and assignments; clients request transitions, never set status directly.
- **Policy tests:** for every endpoint, tests for each role that should be allowed and at least one that must be denied.

## RBAC

| Role | Scope | Granted by |
|---|---|---|
| `customer` | Own profile, addresses, cart, orders, ratings | Self-signup via customer app |
| `restaurant_staff` → `staff` | Orders and availability of restaurants where member | Owner/manager invitation |
| `restaurant_staff` → `manager` | + menu, hours, staff (staff-level) | Owner |
| `restaurant_staff` → `owner` | + documents, payout info, all staff | Onboarding creator (one active owner per restaurant) |
| `delivery_partner` | Own profile, offers, assignments, earnings | Self-signup; can act only when `status = active` |
| `admin` → `support` | Read users/orders; moderate reviews; revoke user sessions | Super admin |
| `admin` → `operations` | + approvals, suspensions, cancellations, reassignments, coupons, cuisines | Super admin |
| `admin` → `finance` | Read orders/payments; refunds; finance reports/exports | Super admin |
| `admin` → `super_admin` | Everything, incl. zones, admin users, audit log, platform settings | Existing super admin (minimum two super admins; cannot remove the last) |

Principle of least privilege: admins receive the narrowest sub-role; role changes are audit-logged; quarterly access review.

## Secrets management

- **Never in Git:** `.env` files are ignored (`.env.*` except `.env.example`); `.env.example` holds names and dummy placeholders only.
- **Scanning:** gitleaks pre-commit hook (recommended) and in CI; GitHub secret scanning + push protection enabled on the repository.
- **Runtime:** secrets stored in the hosting platform's secret manager and injected as environment variables; staging and production secrets are different; developers do not have production secrets by default.
- **Clients contain no secrets.** Only public identifiers (Razorpay key id, platform-restricted Maps keys, Sentry DSN). Maps keys restricted by Android package + SHA-1 / iOS bundle id / HTTP referrer, and by API.
- **Signing keys** (Android keystore, iOS certificates) kept in CI secrets and an offline encrypted backup; never in the repository.
- **Rotation:** documented procedure for each secret; rotate on staff changes and suspected exposure. A leaked secret is treated as compromised even if the commit is removed.
- **Field-level encryption** for especially sensitive fields (TOTP secrets) using an application key (envelope encryption; key in secret manager).

## API security

- TLS 1.2+ only; HSTS (`max-age` ≥ 1 year, `includeSubDomains`) on web domains.
- Strict **CORS**: only the admin origin(s); no wildcard with credentials. Mobile apps do not need CORS.
- Security headers on all responses: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` for authenticated responses.
- Request size limits (1 MB JSON default; uploads never pass through the API); JSON depth limits; pagination `limit` caps.
- Timeouts on inbound requests and outbound provider calls.
- **No stack traces or internal details** in error responses; OpenAPI docs disabled in production.
- **Minimum app version** enforcement to retire vulnerable client versions.
- Addressing OWASP API Top 10: BOLA/IDOR (scoped queries + tests), broken authentication (above), BOPLA/mass assignment (strict schemas), unrestricted resource consumption (rate limits, size limits, pagination caps), BFLA (per-route policies), sensitive business flows (idempotency, OTP limits, coupon abuse limits), SSRF (no user-supplied URLs fetched server-side; provider URLs allow-listed), misconfiguration (hardened defaults, CI checks), inventory (single versioned OpenAPI), unsafe API consumption (validate provider responses, verify webhooks).

## Rate limiting

- Redis sliding-window counters keyed by (scope, identifier, route class); limits in BLUEPRINT §43.
- Auth endpoints **fail closed** if Redis is unavailable (return `503`), other endpoints fail open with logging.
- Responses: `429` + `Retry-After` + `RateLimit-*` headers.
- Abuse signals (OTP floods, credential stuffing, coupon brute force) raise alerts and can trigger temporary IP/device blocks.
- Edge protection: platform/CDN-level DDoS protection and basic WAF rules in front of the API.

## Input validation

- All input validated at the boundary with Pydantic (`extra="forbid"`, strict types, lengths, ranges, enums, regex only where necessary and anchored).
- Normalisation: Unicode NFC, trim, collapse control characters; phone numbers via `phonenumbers` to E.164; emails lower-cased/`citext`.
- Coordinates within valid ranges and inside supported countries; timestamps within sane skew.
- Business validation in services; DB constraints as the last line.
- Client-side validation is for UX only.

## SQL injection prevention

- All DB access through SQLAlchemy Core/ORM with bound parameters. **Raw SQL strings with interpolated input are forbidden**; any `text()` usage must use bound parameters and be reviewed.
- Dynamic sorting/filtering uses allow-listed column mappings, never raw field names from input.
- Ruff security rules (flake8-bandit, `S608`) enabled in CI.
- The application DB user has least privilege: no superuser, no DDL at runtime (migrations run with a separate migration role), `INSERT/SELECT` only on `audit_logs`.

## XSS

- **Admin SPA:** React escapes by default; `dangerouslySetInnerHTML` is forbidden (lint rule) except through a reviewed sanitiser (DOMPurify) if ever needed.
- **Content Security Policy** for the admin: `default-src 'self'`; `script-src 'self'` (+ Maps origins); no `unsafe-inline` scripts; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`; report-only first, then enforced.
- User-generated content (reviews, names, instructions) is stored as plain text, length-limited, and rendered as text in all clients; never interpreted as HTML/Markdown.
- Flutter renders text widgets (no web views for user content).

## CSRF

- **Mobile apps:** not applicable (bearer tokens, no ambient cookies).
- **Admin web:** API calls use `Authorization: Bearer` from memory (not cookie-authenticated) → not CSRF-able. The only cookie-authenticated endpoints are `/auth/refresh` and `/auth/logout`, protected by `SameSite=Strict`, `__Host-` cookie prefix, an **`Origin` header check** against the admin origin, and a **double-submit CSRF token** header.

## File upload security

- **Direct-to-storage presigned uploads**, purpose-scoped and authorised per owner; URL expiry 5 minutes; content-type and max size bound into the signature.
- Allow-lists: images `image/jpeg`, `image/png`, `image/webp` ≤ 5 MB; documents `application/pdf`, `image/jpeg`, `image/png` ≤ 10 MB.
- Post-upload worker validates **magic bytes**, image dimensions (decompression-bomb limits), re-encodes images (strips EXIF, including GPS), and quarantines failures; PDFs are not rendered server-side in MVP. Malware scanning (e.g. ClamAV worker) for documents before admins open them — required before launch.
- Object keys are server-generated (UUIDs), never user-provided file names.
- **Private bucket** for KYC documents: no public ACLs, bucket policy denies public access, encryption at rest, access only via ≤ 5-minute presigned GET generated for authorised admins and logged in `audit_logs`.
- Public media bucket serves only processed variants via CDN.

## Payment security

- **No card or bank credentials** are ever entered into, transmitted through or stored by Hungerly systems; the provider SDK handles collection (PCI DSS scope minimal).
- **Amount integrity:** amounts are computed server-side from the order; the provider order is created server-side; verification compares provider-reported amount and currency with the order.
- **Payment confirmation** only via verified signature (HMAC-SHA256 with key secret, constant-time comparison) **and** provider API status, or verified webhook.
- **Webhooks:** signature verified over the raw body with the webhook secret; replay-safe (unique event id); processed asynchronously and idempotently; endpoint rate-limited; source IP allow-list if the provider publishes one.
- **Idempotency** keys on payment creation and refunds; DB constraint of one captured payment per order; refunds locked against the payment row and bounded by captured amount.
- **Refund authority** limited to `finance` / `super_admin`; reason required; audit-logged; high-value refunds require a second approver (post-MVP).
- **Reconciliation** daily against provider reports; discrepancies alert finance.
- Secrets (`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) only in the backend secret store; separate test/live keys per environment.
- COD cash handling risk (partner cash float) controlled by limits per partner (open decision OD-05).

## Audit logging

- `audit_logs` (append-only; app role cannot update/delete) records: authentication events (login success/failure, MFA enrol/reset, refresh reuse, logout-all), admin actions (approvals, suspensions, cancellations, refunds, role changes, settings changes, document views), restaurant owner actions on staff and payout info, and security events (signature failures, rate-limit blocks).
- Each entry: actor, role, action, entity, before/after (PII redacted), IP, user agent, `request_id`, timestamp.
- Audit entries are written in the same transaction as the action.
- Retention ≥ 1 year; exported to cold storage; access limited to `super_admin`.

## Privacy

- **Data minimisation:** collect only what a feature needs; no contacts, no precise location when not needed (customer location only while choosing an address; rider location only while online).
- **Masking:** restaurants see the customer's first name and order details, not full phone numbers; riders see the address and a masked/relayed contact (full number only if masked calling is not adopted — OD-09, with minimum exposure); support views are audit-logged.
- **Location privacy:** customers see the rider's location only between pickup and delivery of their own order; rider breadcrumbs retained 30 days.
- **Consent & notices:** terms/privacy acceptance recorded (`terms_accepted_at`); promotional notifications opt-in; OS permission prompts preceded by clear explanations.
- **Account deletion:** in-app request → sessions revoked immediately → PII in `users`, `addresses`, profiles erased/anonymised within 30 days; order records retained for legal/tax obligations with customer identity anonymised where allowed.
- **Data subject requests:** export of personal data on request (manual process in MVP).
- **Third parties:** data shared with providers only as required (SMS: phone; payment: contact/amount; maps: coordinates/search text; Sentry: no PII — scrubbing enabled); data-processing terms reviewed.
- **Regulatory alignment:** India's Digital Personal Data Protection Act 2023 and rules — legal review required before launch (OD-13).
- **Logs:** PII redaction processors; no request/response bodies logged for auth, payment or profile endpoints.

## Mobile app security (MASVS highlights)

- Tokens only in secure storage; no sensitive data in shared preferences, logs or screenshots of sensitive screens (payment, OTP) — `FLAG_SECURE` where appropriate.
- Release builds: obfuscation (`--obfuscate --split-debug-info`), debugging disabled, cleartext traffic disabled (Android network security config), ATS on iOS.
- Certificate pinning: not in MVP (operational risk with rotating certificates); re-evaluate post-launch.
- Root/jailbreak detection and app attestation (Play Integrity / App Attest) considered for OTP abuse protection post-MVP.
- Deep links validated; no sensitive actions triggered purely by a link without user confirmation.

## Production environment security

- **Network:** database and Redis on private networking only, no public endpoints; API reachable only through the load balancer/TLS; admin tools access through the platform with MFA.
- **Access:** cloud accounts with MFA mandatory; least-privilege IAM roles; separate staging and production projects/accounts; no shared personal credentials; break-glass procedure documented.
- **Containers:** minimal base images (slim/distroless), non-root user, read-only filesystem where possible, image vulnerability scanning in CI, pinned base image digests, regular rebuilds for patches.
- **Dependencies:** lockfiles committed (`uv.lock`, `pubspec.lock`, `pnpm-lock.yaml`); Dependabot/Renovate updates; dependency review on PRs; licences checked.
- **CI/CD:** GitHub Actions with least-privilege tokens (`permissions:` set per workflow), pinned third-party actions by commit SHA, OIDC to cloud instead of long-lived keys where supported, protected environments with required reviewers for production.
- **Repository:** branch protection on `main`, `balaji`, `teammate` (no force push, no deletion); required reviews and status checks for `main`; signed commits recommended.
- **Data at rest:** managed DB and storage encryption enabled; backups encrypted; backup access restricted.
- **Monitoring:** alerts on auth anomalies, 5xx spikes, webhook signature failures, privilege changes.
- **Incident response:** runbook with severity levels, contact list, containment steps (revoke keys, revoke sessions, disable features via flags), customer communication and post-mortem; breach notification obligations per applicable law.

## Security checklist for PRs

- [ ] Endpoint has an explicit authorization policy and negative tests
- [ ] Inputs validated with strict schemas; no mass assignment
- [ ] No secrets, tokens or PII in code, logs, errors or fixtures
- [ ] Queries parameterised; dynamic sort/filter allow-listed
- [ ] Money/state changes idempotent and transactional
- [ ] New data fields reviewed for PII, retention and masking
- [ ] New dependencies justified and scanned
- [ ] Audit log added for admin/security-relevant actions
