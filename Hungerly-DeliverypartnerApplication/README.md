# Hungerly Partner (delivery app)

The rider app for Hungerly, built with React Native and Expo SDK 57. It uses the same design system as the customer app: its `@hungerly/ui` components are copied into `src/ui`.

## What riders can do

| Screen | Features |
|---|---|
| Launch | Animated boot screen that continues from the native splash. The saved session is restored from secure storage. |
| Sign in | Phone number and 6-digit SMS code, with SMS autofill, a resend timer and an error shake. |
| Onboarding | Name, vehicle, registration and licence (validated), and delivery zone. Then a review screen that refreshes itself and updates as soon as an admin approves the rider. |
| Home | Animated online/offline switch, today's earnings, trips and cash in hand. A "finding orders" radar while online. An active-delivery card. |
| Offer | Bottom sheet with the payout, pickup and drop distances, item count and cash to collect, plus a 45-second draining timer. Swipe to accept, or decline. |
| Delivery | Four steps: restaurant → pickup (item checklist) → drop → handover. Each step has Navigate (Google Maps, two-wheeler mode) and Call buttons. Handover needs the customer's 4-digit code and an exact cash check. Problems can be reported to operations. A success animation ends the trip. |
| Earnings | This week, last week or 30 days. Daily bar chart, per-trip average and COD cash collected. |
| Trips | Paginated delivery history. |
| Profile | Rating, vehicle, biometric app lock, support, sign out. |

## How it connects to the other apps

| Event | Effect elsewhere |
|---|---|
| Rider goes online | The rider's location feeds dispatch and appears in the admin panel's **Rider fleet** and **Assign rider** lists. |
| Admin approves a rider | The rider's review screen switches to Home automatically. |
| Admin accepts an order | Dispatch sends an offer to the nearest free rider. |
| Admin assigns an order manually | The order appears directly as the rider's current delivery. |
| Rider accepts, arrives, picks up | The order timeline updates in the admin panel and in the customer's order view. After pickup the customer can see the rider's live location. |
| Rider reports a problem | It appears as an alert on the order in the admin panel. |
| Handover | Only the customer has the delivery code. The order becomes `delivered`, and cash orders become `paid`. |

## Map

The live map is Leaflet with OpenStreetMap tiles, running in a locked-down WebView. It needs no API key and looks the same in Expo Go on Android and iOS.
- **What it shows:** the rider, the restaurant and the customer. The current leg is a solid line and the next leg is dashed. A recenter button sits on the map.
- **Directions:** turn-by-turn navigation opens Google Maps in two-wheeler mode.
- **Security:**
  - Leaflet loads with integrity checks, so a tampered file is refused.
  - The map page cannot navigate anywhere and has no access to app storage or files.
- **Production:** the public OpenStreetMap tiles are for development and light use. Set `EXPO_PUBLIC_MAP_TILE_URL` to a keyed tile provider, for example MapTiler: `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=…`, and restrict the key to the app.

## Reaching the API in development

With `EXPO_PUBLIC_API_URL=metro` (the default in `.env`), the app sends API calls to the Expo dev server it was loaded from, and `metro.config.js` forwards them to the API on `127.0.0.1:8000`.
- **No laptop IP to configure:** it keeps working when your Wi-Fi address changes.
- **No firewall rule for port 8000:** the phone only talks to the Expo dev server.
- **"Metro could not reach the API":** the API isn't running.

## Design preview and end-to-end test (browser)

`pnpm web` runs the app in a browser for design review.
- Native-only pieces get browser stand-ins: the map is a drawn street grid, and storage is per browser tab.
- The real apps never ship these stand-ins.

`pnpm test:flow` drives a phone-sized browser through a whole shift against the real API:
- sign in, go online, receive an order created by `simulate_order.py`
- swipe to accept, then every delivery step and the handover code
- earnings, trips and profile, then go offline

It needs the API on :8000 (with `http://localhost:8081` in `CORS_ORIGINS`) and `pnpm web` running. Screenshots are saved in `e2e/screens/`.

## Run on a phone

1. Start the backend so the phone can reach it:

   ```powershell
   cd ..\Hungerly-Backend
   docker compose up -d
   .\.venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

   Allow port 8000 through Windows Firewall on private networks.
2. Set `EXPO_PUBLIC_API_URL` in `.env` to your laptop's Wi-Fi IP, for example `http://192.168.0.105:8000`. Use `http://10.0.2.2:8000` for the Android emulator.
3. Start the app:

   ```powershell
   pnpm install
   pnpm start
   ```

   Scan the QR code with Expo Go, or press `a` for an Android emulator.
4. Sign in as a seeded rider: `98000 00001`, OTP `123456`. The dev OTP only works with a development backend.
5. Go online, then create work from the backend folder:

   ```powershell
   .\.venv\Scripts\python scripts\simulate_order.py --count 2 --accept
   ```

   The offer pops up within a few seconds. You can also accept orders from the admin panel.

**Expo Go limits:** Expo Go cannot run background location or the full Face ID prompt. The app falls back to foreground location tracking. For the complete behaviour, use a development build (`pnpm exec expo run:android`) or an EAS build.

## Security

- **Token storage:** the refresh token and install ID live only in the iOS Keychain or Android Keystore, set to this device only and unlocked state only. The access token is kept in memory and lasts 15 minutes.
- **Session protection:** refresh tokens rotate on every use, and concurrent refreshes are combined into one request. If an old token is ever replayed, the server revokes the session and the app drops back to login.
- **HTTPS:** production builds (`APP_ENV=production`) refuse a non-HTTPS API URL. Android cleartext traffic is disabled there and iOS ATS is enforced. Development allows HTTP only so the app can reach a LAN backend.
- **Backups:** `allowBackup: false`, so tokens never reach cloud backups.
- **Screenshots:** blocked on the active-delivery screen, which shows the customer's name, address and phone.
- **App lock:** optional fingerprint, face or PIN lock, re-locking after one minute in the background.
- **Location:** shared only while online, with a visible "online" foreground notification on Android. Spoofed (mock) GPS points are rejected in production. Each delivery step sends the rider's position so the server can geofence it.
- **Privacy by step:** the exact customer address and phone are revealed only after the rider accepts. Rider documents are encrypted on the server and shown masked.
- **Server-side validation:** irreversible steps use swipe-to-confirm. The server validates every state change and rate-limits delivery-code guesses.
- **Clean sign-out:** cached data is wiped on sign-out. No secrets are embedded in the app; `EXPO_PUBLIC_*` values contain only the API URL.

**Planned:** push notifications for offers (polling is used now), in-app maps, and certificate pinning once the production domain is fixed.
