# Hungerly Admin Panel

The operations console for Hungerly. It uses the same design language as the customer app: the palette, Plus Jakarta Sans, radii and motion are copied from `@hungerly/ui`.

Built with React 19, Vite, TanStack Query and React Router.

| Page | What it does |
|---|---|
| Overview | Live order pipeline, alerts for orders that need attention, today's KPIs, a 14-day chart and the rider fleet. Refreshes every 10 s. |
| Orders | Status tabs and search. The detail drawer can accept an order on the restaurant's behalf (which starts auto-dispatch), mark it ready, assign or reassign a rider, or cancel it with a reason. It also shows the item breakdown and a timeline. |
| Riders | Approval queue (approve or reject with a reason), suspend and reinstate, per-rider stats. Document numbers are masked. |
| Restaurants | Pause or resume order intake. |
| Customers | Search by name, phone or email, and suspend accounts. Suspending signs the user out of every device. |
| Team & access | Super admins only. Invite admins, change roles and deactivate accounts. |
| Audit log | Super admins only. The append-only record of sign-ins and admin actions. |

## Working faster

- **Ctrl+K / ⌘K:** search everything (order numbers, names, full 10-digit phones, emails, restaurants) and open the result directly.
- **Detail panels:** click any row to open its panel. Links inside a panel open the related record (order → customer → their other orders). **Back** or **Esc** steps back one panel.
- **Eye icon:** shows a full phone number, email or address for 30 seconds, with a copy button. Every reveal is written to the audit log (`pii.reveal`) and limited to 40 per admin per 10 minutes. Riders' full document numbers are shown to super admins only.
- **Sidebar:** collapses to icons on desktop. On tablets and phones it becomes a slide-in menu opened from the ☰ button.

## Automated UI test

`pnpm test:ui` drives a real Chromium browser at desktop, tablet and phone sizes. It:
- signs in with real two-factor authentication
- opens every page and every kind of panel
- follows the links between panels
- uses the eye reveal and the command palette
- reloads the page
- fails on console errors, crashes, failed API calls or horizontal overflow

Screenshots are saved in `e2e/screens/`. One-time setup:

```powershell
pnpm exec playwright install chromium
..\Hungerly-Backend\.venv\Scripts\python ..\Hungerly-Backend\scripts\create_qa_admin.py --out .qa-admin.json
```

## Run

Start the API first (see `../Hungerly-Backend/README.md`), then:

```powershell
pnpm install
pnpm dev        # http://localhost:5173 — /api is proxied to http://127.0.0.1:8000
pnpm build      # production bundle in dist/ (with a strict Content-Security-Policy)
```

**First sign-in:** use the email and temporary password printed by `scripts/seed.py`. Then scan the QR code with an authenticator app and store the recovery codes.

## Security

- **Tokens:** the access token is kept only in memory, never in `localStorage`. The refresh token is an `HttpOnly; Secure; SameSite=Strict` cookie that page scripts cannot read. Refreshing also requires a double-submit CSRF token and a matching Origin.
- **Same origin:** the panel and the API share an origin (Vite proxy in development, reverse proxy in production). No credentials are ever sent cross-site.
- **Two-factor:** TOTP is required for every admin. The QR code is generated in the browser, so the secret never goes to a third-party service.
- **Content Security Policy:** production builds use `default-src 'self'`, with no inline scripts or `eval`, and the only third-party origins allowed are Google Fonts and the image CDN. Send the same policy as an HTTP header from your host.
- **Roles:** controls are hidden by role (support, operations, finance, super admin), but the server checks the role again on every request.
- **Data in memory:** cached query data is wiped on sign-out.

**Production:** serve `dist/` and proxy `/api` to the backend from the same domain over TLS 1.3, for example `admin.hungerly.app`. Add HSTS and the CSP as response headers.
