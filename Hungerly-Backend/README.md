# Hungerly Backend

One REST API (FastAPI) for all three Hungerly apps. Each app talks to its own surface:

| App | Prefix | Login |
|---|---|---|
| Customer app (Expo) | `/api/v1/me`, `/api/v1/customer/*`, `/api/v1/catalog/*` | Phone + SMS OTP |
| Delivery partner app (Expo) | `/api/v1/delivery/*` | Phone + SMS OTP |
| Admin panel (web) | `/api/v1/admin/*` | Email + password + TOTP authenticator |

**Data stores:** one PostgreSQL 16 database (with PostGIS) and Redis.
- Postgres holds all business data.
- Redis holds rate limits, OTPs, live rider locations and session revocations.

The design follows `Hungerly-UserApplication/docs/` (API_BLUEPRINT, DATABASE_SCHEMA, SECURITY).

## Run locally

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\python scripts\generate_env.py      # random keys -> .env (never commit it)
docker compose up -d --wait                          # Postgres + Redis on 127.0.0.1 only
.\.venv\Scripts\alembic upgrade head
.\.venv\Scripts\python scripts\seed.py --admin-email you@yourdomain.com
.\.venv\Scripts\python -m app.serve --port 8000
```

- Always start the API with `python -m app.serve`, not plain `uvicorn`. Uvicorn trusts `X-Forwarded-For` from 127.0.0.1 by default, which lets callers behind a local proxy fake their IP and get around per-IP limits. Real proxies go in `TRUSTED_PROXIES`.
- API docs (development only): http://localhost:8000/api/docs
- Tests run against a separate `hungerly_test` database: `.\.venv\Scripts\python -m pytest`

### Test tools

| Test | Command |
|---|---|
| Unit, integration and white-box tests (43) | `.\.venv\Scripts\python -m pytest` |
| Black-box probe: fuzzes every route in the OpenAPI spec for auth, input, leak and header issues | `python tests\blackbox\probe.py http://127.0.0.1:8001 <qa-admin.json>` |
| Stress and race test: read burst, checkout storm, idempotency, cart, refresh and dispatch races, sustained load | `python tests\stress\stress.py http://127.0.0.1:8001 <qa-admin.json> <test-db-url> [customers] [seconds]` |

Run the probe and the stress test against a test API: `ENV=test`, the `hungerly_test` database and its own Redis DB. The stress test also needs `TRUSTED_PROXIES=127.0.0.1` so that each simulated client gets its own IP. Create the QA admin with `scripts\create_qa_admin.py --out <file>`. Run pytest first, because it rebuilds the test database.

**Development logins:**
- OTP code `123456` works for every phone number. The server refuses to start with that setting outside development.
- Seeded riders: `+919800000001` to `+919800000003`.

## Security model

| Threat | Control |
|---|---|
| Stolen or forged tokens | Ed25519 (EdDSA) JWTs, 15-minute life, strict algorithm allow-list (no `none` or HS/RS confusion). Issuer and audience are checked, and audience is per app, so a customer token cannot call admin or delivery routes. Each session can be revoked instantly through the database plus a Redis deny-list. |
| Refresh token theft | Opaque 256-bit tokens stored only as HMAC-SHA256 hashes and rotated on every use. Reusing an old token revokes the whole session. |
| OTP brute force / SMS flooding | Codes stored as HMACs and bound to the phone and app. Single use, 5 attempts, 30 s resend cooldown. Limits per phone, IP and device. These limits fail closed if Redis is down. |
| Admin credential attacks | Argon2id (64 MiB, t=3). Mandatory TOTP with replay protection, plus single-use recovery codes. Lockout with exponential backoff. The same error is returned whether or not the account exists, and unknown accounts take the same work. |
| SQL injection | All queries go through SQLAlchemy bound parameters. LIKE wildcards are escaped. Sort and filter values come from allow-lists. Ruff bandit rules (`S608`) are clean. |
| Mass assignment | Every request schema uses `extra="forbid"`. Status, price, role and commission fields are only changed by dedicated server-side transitions. |
| IDOR / broken object authorization | Ownership is part of the query (`WHERE id = :id AND customer_user_id = :me`). Someone else's resource returns 404. A test checks that every route declares an auth policy. |
| Data leaks at rest | Phone numbers, addresses, order address snapshots, delivery OTPs, rider documents and TOTP secrets are encrypted with AES-256-GCM. Each value is bound to its column, and keys carry ids so they can be rotated. Phone lookups use a keyed blind index, so plaintext is never stored. |
| Data leaks via the API | Phones are masked in admin views. Riders see the exact address only after accepting an order. Customers see the rider's location only after pickup. Document numbers are shown as the last 4 characters. Errors use RFC 9457 and never include stack traces or echo input. |
| Money and state tampering | Prices are computed only on the server. Orders are rejected if the total changed (`expected_total_minor`). Idempotency keys prevent double orders. DB CHECK constraints enforce totals. Status changes go through a locked state machine. Partial unique indexes allow one active rider per order and one active order per rider. Handover requires a delivery OTP, with a brute-force limit, and cash on delivery must match the exact amount. |
| Rewriting history | Database triggers make `audit_logs` and `order_status_events` append-only. Every admin action is audited in the same transaction. |
| Abuse and DoS | Redis sliding-window limits: 300 per minute per IP and 120 per minute per user, with stricter auth limits. Request bodies are capped at 1 MB. Postgres has a 10 s statement timeout. |
| Browser attacks on the admin | The refresh token is in an `HttpOnly; Secure; SameSite=Strict` cookie and the access token stays in memory only. Refresh uses double-submit CSRF plus an Origin check. Security headers are sent: CSP, HSTS in production, nosniff and frame-deny. CORS has no wildcard. |
| Misconfiguration | The app refuses to boot with missing or short keys, a CORS wildcard, the dev OTP or insecure cookies in production. API docs are disabled in production. DB and Redis bind to localhost and Redis requires a password. |

**In transit:** deploy behind TLS 1.3 (with HSTS), which encrypts every request and response. The admin panel should be served from the same origin as the API, under `/api`.

**Not built yet** (tracked in the user app docs): Razorpay online payments, real SMS provider (MSG91), push notifications, restaurant partner app.
