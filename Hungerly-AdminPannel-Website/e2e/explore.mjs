// UI regression + exploratory test. Signs in with real 2FA, then at desktop and phone widths:
// visits every page, opens every kind of detail panel, follows panel links, uses the eye reveal, the
// Ctrl+K palette and the mobile menu, reloads, and checks for console errors, crashes, failed API calls
// and horizontal overflow. Screenshots go to e2e/screens/.
//   Run with the API on :8000 and Vite on :5173:   node e2e/explore.mjs
import { createHmac } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const creds = JSON.parse(readFileSync(new URL('../.qa-admin.json', import.meta.url), 'utf8'));
const OUT = new URL('./screens/', import.meta.url);
mkdirSync(OUT, { recursive: true });

function base32(s) {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '')) bits += a.indexOf(c).toString(2).padStart(5, '0');
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totp(secret, offset = 0) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = createHmac('sha1', base32(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

const findings = [];
const passed = [];
const note = (where, kind, detail) => findings.push({ where, kind, detail });
const check = (where, ok, label) => (ok ? passed.push(`${where}: ${label}`) : note(where, 'FAIL', label));

async function run(name, viewport, totpOffset) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  let where = 'login';
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('401') && note(`${name}:${where}`, 'console', m.text().slice(0, 240)));
  page.on('pageerror', (e) => note(`${name}:${where}`, 'crash', e.message.slice(0, 240)));
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/') && r.status() >= 400 && !(u.includes('/auth/admin/refresh') && r.status() === 401))
      note(`${name}:${where}`, `http ${r.status()}`, `${r.request().method()} ${new URL(u).pathname}`);
  });
  const shot = (n) => page.screenshot({ path: decodeURIComponent(new URL(`${name}-${n}.png`, OUT).pathname).replace(/^\/([A-Za-z]:)/, '$1'), fullPage: false });
  const overflow = async () => {
    const w = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (w > 2) note(`${name}:${where}`, 'layout', `page scrolls horizontally by ${w}px`);
  };
  const navTo = async (label, path) => {
    // Client-side navigation through the real menu (hamburger on phones).
    const hamburger = page.locator('button[aria-label="Open menu"]');
    if (await hamburger.isVisible()) {
      await hamburger.click();
      await page.waitForTimeout(350);
    }
    await page.locator(`nav a[href="${path}"]`).click();
    await page.waitForTimeout(1500);
    where = label;
  };

  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await shot('01-login');
  await overflow();
  // A code can only be used once per 30 s window (replay protection), so try neighbouring windows.
  let signedIn = false;
  for (const off of [totpOffset, ...[0, 1, -1].filter((o) => o !== totpOffset)]) {
    await page.waitForSelector('#email', { timeout: 10000 });
    await page.fill('#email', creds.email);
    await page.fill('#password', creds.password);
    await page.click('button[type=submit]');
    await page.waitForSelector('input[autocomplete="one-time-code"]', { timeout: 10000 });
    await page.fill('input[autocomplete="one-time-code"]', totp(creds.totp_secret, off));
    await page.click('button[type=submit]');
    signedIn = await page.waitForSelector('.topbar', { timeout: 4000 }).then(() => true, () => false);
    if (signedIn) break;
  }
  if (!signedIn) throw new Error('could not sign in');
  findings.length = 0; // a rejected replayed code is expected, not a finding
  where = 'dashboard';
  await page.waitForTimeout(2000);
  await shot('02-dashboard');
  await overflow();
  check(name, (await page.locator('.brand svg').count()) > 0 || name === 'phone', 'brand logo is the SVG mark');

  for (const [label, path, kind] of [
    ['orders', '/orders', 'order'],
    ['riders', '/riders', 'rider'],
    ['restaurants', '/restaurants', 'restaurant'],
    ['users', '/users', 'customer'],
    ['team', '/team', null],
    ['audit', '/audit', null],
  ]) {
    await navTo(label, path);
    if (label === 'orders') await page.locator('button[role=tab]', { hasText: 'All' }).click().then(() => page.waitForTimeout(1200));
    if (label === 'riders') await page.locator('button[role=tab]', { hasText: 'All' }).click().then(() => page.waitForTimeout(1200));
    await shot(`03-${label}`);
    await overflow();
    if (!kind) continue;
    const row = page.locator('table.table tbody tr').first();
    if (!(await row.count())) {
      note(`${name}:${label}`, 'data', 'no rows to test');
      continue;
    }
    await row.click({ position: { x: 20, y: 20 } });
    await page.waitForSelector('.drawer', { timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(1200);
    check(`${name}:${label}`, (await page.locator('.drawer').count()) === 1, `row click opens the ${kind} panel`);
    await shot(`04-${label}-panel`);

    if (label === 'orders') {
      // Follow the customer link inside the order, then come back.
      const link = page.locator('.drawer .link-card', { hasText: 'Customer' });
      if (await link.count()) {
        await link.click();
        await page.waitForTimeout(1200);
        check(`${name}:orders`, await page.locator('.drawer button[aria-label="Back"]').isVisible(), 'order → customer panel shows Back');
        await shot('05-order-to-customer');
        await page.locator('.drawer button[aria-label="Back"]').click();
        await page.waitForTimeout(600);
        check(`${name}:orders`, (await page.locator('.drawer .drawer-title.mono').count()) === 1, 'Back returns to the order');
      }
    }
    if (label === 'users') {
      // Eye icon inside the panel reveals the full phone.
      const before = await page.locator('.drawer .reveal-text').first().innerText();
      await page.locator('.drawer .reveal-btn').first().click();
      await page.waitForTimeout(900);
      const after = await page.locator('.drawer .reveal-text').first().innerText();
      check(`${name}:users`, before.includes('•') && !after.includes('•') && /\+91\d{10}/.test(after), `panel eye reveals full phone (${before} → ${after})`);
      await shot('06-customer-revealed');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  if (name === 'desktop') {
    // Eye icon directly in the customers table.
    await navTo('users', '/users');
    const cell = page.locator('table.table tbody tr').first().locator('.reveal-text').first();
    const before = await cell.innerText();
    await page.locator('table.table tbody tr').first().locator('.reveal-btn').first().click();
    await page.waitForTimeout(900);
    const after = await cell.innerText();
    check('desktop:users', before.includes('•') && !after.includes('•'), `table eye reveals phone (${before} → ${after})`);
    check('desktop:users', (await page.locator('.drawer').count()) === 0, 'clicking the eye does not open the panel');
    // Command palette.
    where = 'palette';
    await page.keyboard.press('Control+k');
    await page.waitForSelector('.palette');
    await page.keyboard.type('dosa');
    await page.waitForTimeout(900);
    await shot('07-palette');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1300);
    check('desktop:palette', (await page.locator('.drawer .drawer-title', { hasText: 'Dosa' }).count()) === 1, 'Ctrl+K "dosa" → Enter opens the restaurant panel');
    await shot('08-restaurant-panel');
    await page.keyboard.press('Escape');
    // Sidebar collapse.
    await page.locator('button[aria-label="Collapse sidebar"]').click();
    await page.waitForTimeout(400);
    await shot('09-collapsed');
    check('desktop', await page.locator('.sidebar.collapsed').isVisible(), 'sidebar collapses');
    await page.locator('button[aria-label="Expand sidebar"]').click();
  }

  where = 'reload';
  await page.reload();
  await page.waitForTimeout(2500);
  check(name, (await page.locator('#email').count()) === 0, 'session survives a page reload');
  await browser.close();
}

await run('desktop', { width: 1440, height: 900 }, 0);
await run('tablet', { width: 900, height: 1180 }, 1);
await run('phone', { width: 390, height: 844 }, -1);

console.log(`PASSED (${passed.length})`);
for (const p of passed) console.log('  ✓', p);
const seen = new Set();
const unique = findings.filter((f) => {
  const k = `${f.where}|${f.kind}|${f.detail}`;
  return seen.has(k) ? false : (seen.add(k), true);
});
console.log(`\nFINDINGS (${unique.length})`);
for (const f of unique) console.log(`  ✗ [${f.kind}] ${f.where} — ${f.detail}`);
process.exitCode = unique.some((f) => f.kind !== 'data') ? 1 : 0;
