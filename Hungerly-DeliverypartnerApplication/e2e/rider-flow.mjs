// Full rider journey in the browser design preview (phone-sized viewport), against the real API:
// sign in → go online → receive a real order → swipe to accept → every delivery step → handover code →
// earnings / trips / profile. Takes screenshots and reports crashes, console errors and failed calls.
//
// Needs: API on :8000 (dev .env), `pnpm web` on :8081, and the backend venv for order simulation.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.PREVIEW_URL ?? 'http://localhost:8081';
const BACKEND = new URL('../../Hungerly-Backend/', import.meta.url);
const PY = decodeURIComponent(new URL('.venv/Scripts/python.exe', BACKEND).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const CWD = decodeURIComponent(BACKEND.pathname).replace(/^\/([A-Za-z]:)/, '$1');
const OUT = new URL('./screens/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const RIDER = process.env.RIDER_PHONE ?? '9800000001';

const py = (args) => execFileSync(PY, args, { cwd: CWD, encoding: 'utf8' });
const deliveryCode = () =>
  py([
    '-c',
    `import asyncio
from sqlalchemy import select
from app.db.session import sessionmaker
from app.models import Order, DeliveryAssignment, DeliveryPartner, User
from app.services.auth import phone_bidx
async def m():
    async with sessionmaker()() as db:
        uid = (await db.execute(select(User.id).where(User.phone_bidx == phone_bidx('+91${RIDER}')))).scalar_one()
        pid = (await db.execute(select(DeliveryPartner.id).where(DeliveryPartner.user_id == uid))).scalar_one()
        oid = (await db.execute(select(DeliveryAssignment.order_id).where(DeliveryAssignment.delivery_partner_id == pid, DeliveryAssignment.status.in_(('accepted','arrived_at_restaurant','picked_up','arrived_at_customer'))))).scalar_one()
        print((await db.get(Order, oid)).delivery_otp)
asyncio.run(m())`,
  ]).trim();

// Start clean: cancel anything this rider is still carrying from a previous run and set them offline.
py([
  '-c',
  `import asyncio
from sqlalchemy import select
from app.db.session import sessionmaker, dispose_engine
from app.models import DeliveryAssignment, DeliveryPartner, User
from app.services import orders as o, dispatch
from app.services.auth import phone_bidx
async def m():
    async with sessionmaker()() as db:
        uid = (await db.execute(select(User.id).where(User.phone_bidx == phone_bidx('+91${RIDER}')))).scalar_one()
        p = (await db.execute(select(DeliveryPartner).where(DeliveryPartner.user_id == uid))).scalar_one()
        for oid in (await db.execute(select(DeliveryAssignment.order_id).where(DeliveryAssignment.delivery_partner_id == p.id, DeliveryAssignment.status.in_(('offered','accepted','arrived_at_restaurant','picked_up','arrived_at_customer'))))).scalars().all():
            order = await o.lock_order(db, oid)
            if order.status not in ('delivered','cancelled'):
                o.transition(db, order, 'cancelled', actor_type='system', actor_user_id=None, reason='e2e reset')
            await o.cancel_active_assignment(db, oid, 'e2e reset')
        p.is_online = False
        await dispatch.remove_location(p)
        await db.commit()
    await dispose_engine()
asyncio.run(m())`,
]);

const findings = [];
const passed = [];
const check = (ok, label) => (ok ? passed.push(label) : findings.push(`FAIL ${label}`));

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  geolocation: { latitude: 18.5395, longitude: 73.8945 },
  permissions: ['geolocation'],
});
const page = await ctx.newPage();
let step = 'boot';
page.on('pageerror', (e) => findings.push(`[crash] ${step}: ${e.message.slice(0, 200)}`));
page.on('console', (m) => m.type() === 'error' && !/401|favicon|DevTools|shadow\*|pointerEvents|useNativeDriver/.test(m.text()) && findings.push(`[console] ${step}: ${m.text().slice(0, 200)}`));
page.on('response', (r) => r.url().includes('/api/') && r.status() >= 400 && r.status() !== 401 && findings.push(`[http ${r.status()}] ${step}: ${r.request().method()} ${new URL(r.url()).pathname}`));
const shot = (n) => page.screenshot({ path: decodeURIComponent(new URL(`rider-${n}.png`, OUT).pathname).replace(/^\/([A-Za-z]:)/, '$1') });
const btn = (name) => page.getByRole('button', { name, exact: false }).first();

async function swipe(label) {
  const track = page.locator(`[aria-label="${label}"]`).first();
  await track.waitFor({ timeout: 10000 });
  const box = await track.boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 32, y);
  await page.mouse.down();
  for (let x = box.x + 32; x <= box.x + box.width - 8; x += 24) await page.mouse.move(x, y);
  await page.mouse.move(box.x + box.width - 6, y);
  await page.mouse.up();
}

// 1. Boot + sign in
await page.goto(BASE, { timeout: 180_000 });
await page.waitForTimeout(700);
await shot('01-boot');
await page.getByPlaceholder('98765 43210').waitFor({ timeout: 20000 });
step = 'login';
await shot('02-login');
await page.getByPlaceholder('98765 43210').fill(RIDER);
await btn('Get OTP').click();
step = 'verify';
await page.waitForTimeout(1500);
await shot('03-verify');
await page.keyboard.type('123456');
await page.waitForTimeout(3500);

// 2. Home (offline)
step = 'home';
await shot('04-home');
const goOnline = btn('Go online');
check(await goOnline.isVisible().catch(() => false), 'home shows Go online when offline');
if (await goOnline.isVisible().catch(() => false)) {
  await goOnline.click();
  await page.waitForTimeout(3000);
}
await shot('05-online');
check(await page.getByText('Finding orders').isVisible().catch(() => false), 'going online shows Finding orders');

// 3. A real order comes in
step = 'offer';
py(['scripts/simulate_order.py', '--count', '1', '--accept']);
const offer = page.getByText('Swipe to accept');
check(await offer.waitFor({ timeout: 15000 }).then(() => true, () => false), 'offer sheet appears for a dispatched order');
await page.waitForTimeout(800);
await shot('06-offer');
await swipe('Swipe to accept');
await page.waitForTimeout(3000);

// 4. Delivery steps
step = 'delivery';
check(await page.getByText('Go to restaurant', { exact: true }).last().waitFor({ timeout: 8000 }).then(() => true, () => false), 'accepted offer opens the delivery screen');
await shot('07-to-restaurant');
await swipe('Arrived at restaurant');
await page.waitForTimeout(2500);
await shot('08-collect');
for (const box of await page.getByRole('checkbox').all()) await box.click();
await page.waitForTimeout(400);
await shot('09-items-checked');
await swipe('Order picked up');
await page.waitForTimeout(2500);
await shot('10-to-customer');
await swipe('Arrived at customer');
await page.waitForTimeout(2500);
await shot('11-handover');
const code = deliveryCode();
await page.locator('[aria-label="Delivery code"]').click();
await page.keyboard.type(code);
const cash = page.getByRole('checkbox').first();
if (await cash.isVisible().catch(() => false)) await cash.click();
await page.waitForTimeout(400);
await shot('12-handover-filled');
await swipe('Complete delivery');
await page.waitForTimeout(1200);
await shot('13-delivered');
check(await page.getByText('Delivered').first().isVisible().catch(() => false), 'handover with the right code completes the delivery');
check(!(await page.getByText('Swipe to accept').isVisible().catch(() => false)), 'no new offer covers the Delivered screen');
await page.waitForTimeout(3000);
// Any waiting offer appears once back on Home; decline it so the run ends clean.
if (await page.getByText('Swipe to accept').isVisible().catch(() => false)) {
  await shot('13b-next-offer-on-home');
  await btn('Decline').click();
  await page.waitForTimeout(1500);
}

// 5. Other tabs
for (const [tab, n] of [['Earnings', '14-earnings'], ['Trips', '15-trips'], ['Profile', '16-profile']]) {
  step = tab;
  await page.getByRole('tab', { name: tab }).click().catch(() => page.getByText(tab, { exact: true }).last().click());
  await page.waitForTimeout(1800);
  await shot(n);
}
step = 'home-again';
await page.getByRole('tab', { name: 'Home' }).click().catch(() => page.getByText('Home', { exact: true }).last().click());
await page.waitForTimeout(1500);
await shot('17-home-after');
await page.getByRole('switch').first().click().catch(() => undefined); // go offline so the rider is free for the next run
await page.waitForTimeout(2500);
check(await page.getByText("You're offline").last().isVisible().catch(() => false), 'duty switch takes the rider offline');
await shot('18-offline-again');

await browser.close();
console.log(`PASSED (${passed.length})`);
passed.forEach((p) => console.log('  ✓', p));
console.log(`FINDINGS (${findings.length})`);
[...new Set(findings)].forEach((f) => console.log('  ✗', f));
