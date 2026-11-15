// Drives the site in a real browser against a running backend. Local use only: it registers a user and
// resets that user's password through the admin API.
//
// Needs: the backend, this site (npm run preview), demo data (npm run seed:demo), and
//   SEED_ADMIN_PHONE / SEED_ADMIN_PASSWORD   the bootstrap admin
//   WEB_URL (default http://localhost:5173), API_BASE_URL (default http://localhost:3000)
//   CHROME_CDP_URL                           attach to a running Chrome instead of starting one
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const WEB = (process.env.WEB_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
const API = `${(process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/api/v1`;
const { SEED_ADMIN_PHONE, SEED_ADMIN_PASSWORD, CHROME_CDP_URL } = process.env;
if (!SEED_ADMIN_PHONE || !SEED_ADMIN_PASSWORD)
  throw new Error('Set SEED_ADMIN_PHONE and SEED_ADMIN_PASSWORD');
const SHOTS = 'test-results';
mkdirSync(SHOTS, { recursive: true });

const live = await (await fetch(`${API}/auctions?status=ACTIVE&limit=50`)).json();
const phoneId = live.items.find((a) => a.title === 'Win a Samsung Galaxy A55')?.id;
assert.ok(phoneId, 'Demo data is missing: run npm run seed:demo first');
const phone = `09${Math.floor(10000000 + Math.random() * 89999999)}`;
const ok = (name) => console.log('PASS', name);

const browser = CHROME_CDP_URL
  ? await chromium.connectOverCDP(CHROME_CDP_URL)
  : await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const problems = [],
  requests = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(m.text());
});
page.on('pageerror', (e) => problems.push(String(e)));
page.on('request', (r) => {
  if (r.url().startsWith(API))
    requests.push(`${r.method()} ${new URL(r.url()).pathname.replace('/api/v1', '')}`);
});
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('lub.session')));

process.on('uncaughtException', async (e) => {
  console.log(
    'FAILED at',
    page.url(),
    '\n',
    (
      await page
        .locator('body')
        .innerText()
        .catch(() => '')
    ).slice(0, 700),
  );
  await shot('failure').catch(() => {});
  console.log(e);
  console.log('requests', requests.slice(-8));
  console.log(problems);
  process.exit(1);
});
// Auction list
await page.goto(WEB);
await page.getByRole('link', { name: /Win a Samsung Galaxy A55/ }).waitFor();
assert.ok((await page.locator('main ul > li').count()) >= 2);
const first = await page.locator('time').first().textContent();
await page.waitForTimeout(2100);
assert.notEqual(await page.locator('time').first().textContent(), first, 'countdown ticks');
await shot('1-list-live');
ok('list: running auctions with a ticking countdown');

await page.getByRole('tab', { name: 'Upcoming' }).click();
await page.getByRole('link', { name: /HP Pavilion 15 laptop/ }).waitFor();
assert.match(await page.locator('main').textContent(), /Opens in/);
await page.getByRole('tab', { name: 'Ended' }).click();
await page.getByRole('link', { name: /JBL Flip 6 speaker/ }).click();
await page.getByText('ETB 4', { exact: true }).waitFor();
assert.match(await page.locator('main').textContent(), /Out of 12 bids/);
await shot('2-detail-ended');
ok('ended auction shows the winning bid ETB 4 out of 12 bids');

// Detail -> register -> back to the auction
await page.goto(`${WEB}/auctions/${phoneId}`);
await page.getByRole('heading', { name: 'Win a Samsung Galaxy A55' }).waitFor();
assert.match(await page.locator('main').textContent(), /Fee per bidETB 75/);
assert.match(await page.locator('main').textContent(), /256 GB/);
await shot('3-detail-live');
await page.getByRole('link', { name: 'Sign in to bid' }).click();
await page.getByRole('link', { name: 'Create an account' }).click();
await page.getByRole('heading', { name: 'Create your account' }).waitFor();
await page.getByLabel('Phone number').fill(phone);
await page.getByLabel('Password', { exact: true }).fill('first-pass1');
await page.getByLabel('Repeat password').fill('first-pass1');
await page.getByLabel(/Full name/).fill('Browser Test');
await shot('4-register');
await page.getByRole('button', { name: 'Create account' }).click();
await page.waitForURL(`${WEB}/auctions/${phoneId}`);
await page.getByRole('link', { name: 'Account' }).waitFor();
ok('register from an auction: signed in and returned to that auction');

// Session restore
await page.reload();
await page.getByRole('link', { name: 'Account' }).click();
await page.getByText('Browser Test').waitFor();
await shot('5-account');
ok('reload keeps the user signed in');

// Refresh: make the access token look expired, then a refused one
const before = await stored();
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lub.session'));
  s.accessExpiresAt = Date.now() - 1000;
  localStorage.setItem('lub.session', JSON.stringify(s));
});
requests.length = 0;
await page.reload();
await page.getByText('Browser Test').waitFor();
await page.waitForFunction(
  (old) => JSON.parse(localStorage.getItem('lub.session')).refreshToken !== old,
  before.refreshToken,
);
assert.deepEqual(
  requests.filter((r) => r.includes('/auth/')),
  ['POST /auth/refresh', 'GET /auth/me'],
);
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lub.session'));
  s.accessToken = s.accessToken.slice(0, -4) + 'AAAA';
  localStorage.setItem('lub.session', JSON.stringify(s));
});
requests.length = 0;
await page.reload();
await page.getByText('Browser Test').waitFor();
await page.waitForFunction(
  () => !JSON.parse(localStorage.getItem('lub.session')).accessToken.endsWith('AAAA'),
);
assert.deepEqual(
  requests.filter((r) => r.includes('/auth/')),
  ['GET /auth/me', 'POST /auth/refresh', 'GET /auth/me'],
);
ok('expired and refused access tokens are renewed without signing out');

// Staff reset -> forced change
const api = async (method, path, token, body) => {
  const r = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  assert.ok(r.ok, `${method} ${path} ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
};
const admin = (
  await api('POST', '/auth/login', null, { phoneNumber: SEED_ADMIN_PHONE, password: SEED_ADMIN_PASSWORD })
).tokens.accessToken;
const userId = (await stored()).user.id;
const reset = await api('POST', `/admin/users/${userId}/reset-password`, admin, {
  reason: 'Browser test: user forgot the password',
});
const temporary = reset.temporaryPassword ?? reset.password;
assert.ok(temporary, JSON.stringify(Object.keys(reset)));
await page.reload();
await page.waitForURL(`${WEB}/sign-in`);
await page.getByText('You were signed out. Please sign in again.').waitFor();
assert.equal(await stored(), null);
await shot('6-signed-out-notice');
await page.getByLabel('Phone number').fill(phone);
await page.getByLabel('Password').fill('first-pass1');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByText('The phone number or password is incorrect.').waitFor();
await shot('7-wrong-password');
await page.getByLabel('Password').fill(temporary);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL(`${WEB}/change-password`);
await page.getByRole('heading', { name: 'Choose a new password' }).waitFor();
await shot('8-forced-change');
await page.goto(WEB);
await page.waitForURL(`${WEB}/change-password`);
await page.getByLabel('Temporary password').fill(temporary);
await page.getByLabel('New password', { exact: true }).fill('second-pass2');
await page.getByLabel('Repeat new password').fill('second-pass2');
await page.getByRole('button', { name: 'Save new password' }).click();
// The forced change was reached from the home page, so that is where the user returns.
await page.waitForURL(`${WEB}/`);
await page.getByRole('link', { name: /Win a Samsung Galaxy A55/ }).waitFor();
assert.equal((await stored()).user.mustChangePassword, false);
ok('staff reset: signed out with a notice, old password refused, forced change, then the site opens');

// Sign out, sign in with the new password
await page.getByRole('link', { name: 'Account' }).click();
const refreshToken = (await stored()).refreshToken;
await page.getByRole('button', { name: 'Sign out', exact: true }).click();
await page.waitForURL(`${WEB}/sign-in`);
assert.equal(await stored(), null);
const reuse = await fetch(`${API}/auth/refresh`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ refreshToken }),
});
assert.equal(reuse.status, 401, 'signed-out refresh token is dead on the server');
await page.getByLabel('Phone number').fill(phone);
await page.getByLabel('Password').fill('second-pass2');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByRole('link', { name: 'Account' }).waitFor();
ok('sign out revokes the session on the server; sign in with the new password works');

// Unknown auction, and desktop layout
await page.goto(`${WEB}/auctions/00000000-0000-4000-8000-000000000000`);
await page.getByRole('heading', { name: 'Auction not found' }).waitFor();
problems.splice(0, problems.length, ...problems.filter((p) => !/404|401|409|403/.test(p)));
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(WEB);
await page.getByRole('link', { name: /Win a Samsung Galaxy A55/ }).waitFor();
await shot('9-list-desktop');
ok('unknown auction shows not found');

console.log('console/page problems:', problems);
await context.close();
await browser.close();
assert.deepEqual(problems, []);
