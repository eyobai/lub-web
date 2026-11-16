// Drives the site in a real browser against a running backend. Local use only: it registers a user and
// resets that user's password through the admin API.
//
// Needs: the backend, this site (npm run preview), demo data (npm run seed:demo), and
//   SEED_ADMIN_PHONE / SEED_ADMIN_PASSWORD   the bootstrap admin
//   WEB_URL (default http://localhost:5173), API_BASE_URL (default http://localhost:3000)
//   CHROME_CDP_URL                           attach to a running Chrome instead of starting one
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

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
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
/** Automated accessibility rules (WCAG 2.1 A and AA) that the page on screen breaks. */
async function accessibilityFaults(target) {
  await target.evaluate(AXE);
  const { violations } = await target.evaluate(() =>
    window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }),
  );
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

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
  // The API may be on its own address or behind the site's address.
  const { pathname } = new URL(r.url());
  if (pathname.startsWith('/api/v1/')) requests.push(`${r.method()} ${pathname.replace('/api/v1', '')}`);
});
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
// What a phone shows without scrolling; a full-page capture draws the fixed tab bar mid-page.
const view = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
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
const api = async (method, path, token, body) => {
  const r = await fetch(API + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  assert.ok(r.ok, `${method} ${path} ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
};
const admin = (
  await api('POST', '/auth/login', null, { phoneNumber: SEED_ADMIN_PHONE, password: SEED_ADMIN_PASSWORD })
).tokens.accessToken;
// The demo data's upcoming auction opens after five hours; make a new one if it already has.
let upcoming = (await api('GET', '/auctions?status=SCHEDULED&limit=1')).items[0];
if (!upcoming) {
  const laptop = await api('POST', '/admin/products', admin, {
    name: 'HP Pavilion 15',
    marketValueMinor: '12000000',
  });
  upcoming = await api('POST', '/admin/auctions', admin, {
    productId: laptop.id,
    title: 'HP Pavilion 15 laptop',
    bidFeeMinor: '7500',
    minBidMinor: '100',
    maxBidMinor: '100000',
    bidStepMinor: '100',
    noUniqueBidPolicy: 'REFUND_BID_FEES',
    opensAt: new Date(Date.now() + 5 * 3_600_000).toISOString(),
    closesAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  });
  await api('POST', `/admin/auctions/${upcoming.id}/schedule`, admin);
}

// Auction list
await page.goto(WEB);
await page.getByRole('link', { name: /Win a Samsung Galaxy A55/ }).waitFor();
assert.ok((await page.locator('main ul > li').count()) >= 2);
assert.match(await page.locator('time').first().textContent(), /^(\d+d \d\dh \d\dm|\d\d:\d\d:\d\d)$/);
await shot('1-list-live');
ok('list: running auctions with a countdown');

await page.getByRole('tab', { name: 'Upcoming' }).click();
await page.getByText('Opens in').first().waitFor();
await page
  .getByRole('link', { name: new RegExp(upcoming.title) })
  .first()
  .waitFor();
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

// Wallet and bidding. A short auction where another bidder also picks ETB 1 and ETB 2, so ETB 3 wins.
const product = await api('POST', '/admin/products', admin, {
  name: 'Browser test prize',
  marketValueMinor: '500000',
});
const quick = await api('POST', '/admin/auctions', admin, {
  productId: product.id,
  title: `Browser test ${phone.slice(-4)}`,
  bidFeeMinor: '7500',
  minBidMinor: '100',
  maxBidMinor: '100000',
  bidStepMinor: '100',
  noUniqueBidPolicy: 'REFUND_BID_FEES',
  opensAt: new Date(Date.now() + 2_000).toISOString(),
  closesAt: new Date(Date.now() + 50_000).toISOString(),
});
await api('POST', `/admin/auctions/${quick.id}/activate`, admin);
const credit = (id, amountMinor) =>
  api('POST', `/admin/wallets/${id}/adjustments`, admin, {
    direction: 'CREDIT',
    amountMinor,
    reason: 'Browser test: starting balance',
  });
const rival = await api('POST', '/auth/register', null, {
  phoneNumber: `09${Math.floor(10000000 + Math.random() * 89999999)}`,
  password: `Rival-${randomUUID()}`,
});
await credit(rival.userId, '50000');
await api('POST', `/auctions/${quick.id}/bids`, rival.tokens.accessToken, { amountsMinor: ['100', '200'] });

await page.getByRole('link', { name: 'Wallet', exact: true }).click();
await page.getByText('Nothing has gone in or out of your wallet yet.').waitFor();
assert.match(await page.getByRole('region', { name: 'Balance' }).innerText(), /ETB 0/);
await page.goto(`${WEB}/auctions/${quick.id}`);
// Under a day the countdown shows seconds, so it must move.
const left = await page.locator('time').first().textContent();
await page.waitForTimeout(2100);
assert.notEqual(await page.locator('time').first().textContent(), left, 'countdown ticks');
await page.getByLabel('Bid amount (ETB)').fill('3');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.getByText('Your wallet has ETB 0, which does not cover ETB 75').waitFor();
assert.ok(await page.getByRole('button', { name: 'Review 1 bid' }).isDisabled());
ok('wallet starts empty, and an empty wallet cannot go on to pay');

await credit(userId, '50000');
await page.reload();
await page.getByRole('link', { name: 'Balance: ETB 500' }).waitFor();
await page.getByLabel('Bid amount (ETB)').fill('1');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.getByRole('button', { name: 'Add a range of amounts' }).click();
await page.getByLabel('From', { exact: true }).fill('2');
await page.getByLabel('To', { exact: true }).fill('4');
await page.getByRole('button', { name: 'Add range' }).click();
await page.getByText('4 bids × ETB 75 =').waitFor();
await page.getByRole('list', { name: 'Bids to place' }).scrollIntoViewIfNeeded();
await view('10-bid-form');
await page.getByRole('button', { name: 'Review 4 bids' }).click();
await page.getByRole('heading', { name: 'Place 4 bids?' }).waitFor();
await view('11-bid-confirm');
await page.getByRole('button', { name: 'Pay ETB 300 and bid' }).click();
await page
  .getByText('4 bids placed: ETB 1, ETB 2, ETB 3, ETB 4. ETB 300 was taken from your wallet.')
  .waitFor();
await page.getByRole('link', { name: 'Balance: ETB 200' }).waitFor();
await page.getByText('Your bids in this auction (4)').waitFor();
assert.equal(requests.filter((r) => r === `POST /auctions/${quick.id}/bids`).length, 1);
await view('12-bid-placed');
await page.getByLabel('Bid amount (ETB)').fill('3');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.getByText('You have already bid ETB 3 in this auction.').waitFor();
ok('place four bids (one typed, a range of three): charged once, balance and my bids update');

await page.getByRole('link', { name: 'Wallet', exact: true }).click();
await page.getByText('Bid fees').waitFor();
const history = await page.locator('main').innerText();
assert.match(history, /Bid fees[\s\S]*−ETB 300[\s\S]*Balance ETB 200/);
assert.match(history, /Adjustment by support[\s\S]*\+ETB 500/);
assert.doesNotMatch(history, /Browser test: starting balance/, 'the staff note is not shown');
await view('13-wallet');
await page.getByRole('link', { name: 'My bids' }).click();
await page.getByText('4 bids in total, newest first.').waitFor();
await view('14-my-bids');
await page.getByRole('link', { name: quick.title }).click();
await page.waitForURL(`${WEB}/auctions/${quick.id}`);
ok('wallet history and my bids show the bids');

await page.getByRole('heading', { name: 'You won with ETB 3!' }).waitFor({ timeout: 90_000 });
const outcome = await page.locator('main').innerText();
assert.match(outcome, /ETB 1\s*Also bid by others/);
assert.match(outcome, /ETB 3\s*Won/);
assert.match(outcome, /ETB 4\s*Unique, but not the lowest/);
assert.match(outcome, /Out of 6 bids\./);
await page.getByRole('heading', { name: 'You won with ETB 3!' }).scrollIntoViewIfNeeded();
await view('15-my-result');
ok('when the auction closes the page shows the win and how each bid did');

// Notifications, my wins and delivery details, recent winners
const bell = page.getByRole('link', { name: /^Notifications/ });
await page.getByRole('link', { name: /^Notifications: \d+ unread$/ }).waitFor({ timeout: 45_000 });
await bell.click();
await page.getByRole('link', { name: /You won!/ }).waitFor();
assert.match(await page.locator('main').innerText(), /Bids placed[\s\S]*4 bids/);
await view('16-notifications');
const unreadBefore = Number((await bell.getAttribute('aria-label')).match(/\d+/)[0]);
await page.getByRole('link', { name: /You won!/ }).click();
await page.waitForURL(`${WEB}/wins`);
const card = page.getByRole('article', { name: 'Browser test prize' });
await card.getByText('Being checked').waitFor();
await page.getByRole('link', { name: `Notifications: ${unreadBefore - 1} unread` }).waitFor();
assert.equal(await card.getByRole('button').count(), 0, 'no delivery form before the win is confirmed');
ok('the bell counts unread notifications; opening "You won!" marks it read and leads to my wins');

const win = (await api('GET', `/admin/winners?userId=${userId}`, admin)).items[0];
await api('POST', `/admin/winners/${win.id}/verify`, admin, { note: 'Browser test' });
await page.reload();
await card.getByText('Details needed').waitFor();
await card.getByRole('button', { name: 'Send delivery details' }).click();
assert.equal(await page.getByLabel("Recipient's full name").inputValue(), 'Browser Test');
await page.getByLabel("Recipient's phone number").fill('12345');
await page.getByRole('button', { name: 'Save delivery details' }).click();
await page.getByText('Enter a valid phone number, for example 0911 234 567.').waitFor();
await page.getByText('Enter the city or town.').waitFor();
await page.getByLabel("Recipient's phone number").fill('0911 234 567');
await page.getByLabel('City or town').fill('Addis Ababa');
await page.getByLabel('Sub-city').fill('Bole');
await page.getByLabel('Woreda').fill('03');
await page.getByLabel('Landmark').fill('Near Edna Mall');
await shot('17-delivery-form');
await page.getByRole('button', { name: 'Save delivery details' }).click();
await page.getByText('Your delivery details were saved.').waitFor();
await card.getByText('Arranging delivery').waitFor();
assert.match(await card.innerText(), /Browser Test[\s\S]*0911234567[\s\S]*Woreda 03, Bole, Addis Ababa/);
const kept = (await api('GET', `/admin/winners/${win.id}`, admin)).delivery;
assert.equal(kept.recipientPhone, '0911234567');
assert.deepEqual(
  { city: kept.address.city, subCity: kept.address.subCity, landmark: kept.address.landmark },
  { city: 'Addis Ababa', subCity: 'Bole', landmark: 'Near Edna Mall' },
);
await shot('18-my-wins');
ok('a confirmed winner sends delivery details: checked in the browser, saved by the server, shown back');

await api('PATCH', `/admin/winners/${win.id}/delivery`, admin, { trackingInfo: 'EMS waybill 123456' });
for (const status of ['CONTACTED', 'VERIFIED', 'DISPATCHED']) {
  await api('POST', `/admin/winners/${win.id}/delivery/status`, admin, { status });
}
await api('POST', `/admin/winners/${win.id}/publish`, admin);
await page.reload();
await card.getByText('On its way', { exact: true }).first().waitFor();
await card.getByText('EMS waybill 123456').waitFor();
assert.equal(
  await card.getByRole('button').count(),
  0,
  'details cannot be changed once staff confirmed them',
);
await shot('19-win-dispatched');
await bell.click();
await page
  .getByRole('link', { name: /Prize delivery update/ })
  .first()
  .waitFor();
await page.getByRole('button', { name: 'Mark all as read' }).click();
await page.getByText('You have read everything.').waitFor();
await page.getByRole('link', { name: 'Notifications', exact: true }).waitFor();
await page.reload();
await page.getByText('You have read everything.').waitFor();
ok('delivery progress and tracking appear on my wins; mark all as read clears the bell');

await page.getByRole('link', { name: 'Winners', exact: true }).click();
await page.getByRole('heading', { name: 'Browser test prize' }).first().waitFor();
const topWinner = await page.getByRole('listitem').first().innerText();
assert.match(topWinner, /won with ETB 3/);
assert.match(topWinner, new RegExp(quick.title));
assert.ok(!topWinner.includes(phone.slice(1)), "the winner's full phone number is not shown");
await shot('20-recent-winners');
ok('a published win appears on recent winners with the phone number masked');

// Tab titles, moving between pages, and losing the connection
assert.equal(await page.title(), 'Recent winners · LUB Auction');
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.getByRole('link', { name: 'Wallet', exact: true }).click();
await page.getByRole('heading', { name: 'Wallet' }).waitFor();
assert.equal(await page.title(), 'Wallet · LUB Auction');
assert.equal(await page.evaluate(() => window.scrollY), 0);
assert.equal(await page.evaluate(() => document.activeElement?.id), 'main');
await page.goto(`${WEB}/auctions/${quick.id}`);
await page.waitForFunction((title) => document.title === `${title} · LUB Auction`, quick.title);
ok('each page names the tab, and a new page starts at the top with the keyboard on it');

await context.setOffline(true);
await page.getByText('You are offline.').waitFor();
await page.getByRole('link', { name: 'My bids', exact: true }).click();
await page.getByRole('heading', { name: 'My bids' }).waitFor();
await view('21-offline');
await context.setOffline(false);
await page.getByText('You are offline.').waitFor({ state: 'detached' });
await page.getByRole('heading', { name: quick.title }).first().waitFor();
problems.splice(0, problems.length, ...problems.filter((p) => !/ERR_INTERNET_DISCONNECTED/.test(p)));
ok('offline: a notice appears, pages still open, and the data returns with the connection');

// Accessibility rules on every page, signed in and as a visitor
const faults = {};
for (const path of [
  '/',
  `/auctions/${phoneId}`,
  `/auctions/${quick.id}`,
  '/winners',
  '/bids',
  '/wallet',
  '/wins',
  '/notifications',
  '/account',
  '/change-password',
  '/no-such-page',
]) {
  await page.goto(`${WEB}${path}`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page
    .getByText(/^Loading .*…$/)
    .first()
    .waitFor({ state: 'detached' });
  const found = await accessibilityFaults(page);
  if (found.length) faults[path] = found;
}
const visitorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const visitor = await visitorContext.newPage();
for (const path of ['/', '/sign-in', '/register', '/winners']) {
  await visitor.goto(`${WEB}${path}`);
  await visitor.getByRole('heading', { level: 1 }).waitFor();
  await visitor
    .getByText(/^Loading .*…$/)
    .first()
    .waitFor({ state: 'detached' });
  const found = await accessibilityFaults(visitor);
  if (found.length) faults[`visitor ${path}`] = found;
}
await visitorContext.close();
assert.deepEqual(faults, {});
ok('no automated accessibility faults on 15 pages');

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
