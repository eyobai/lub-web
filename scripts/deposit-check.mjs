// Drives "Add money" in a real browser against a running backend and a simulated Chapa. Local use only.
// No real Chapa is contacted: this script answers the two Chapa calls the backend makes, and stands in for
// Chapa's payment page in the browser.
//
// Needs: this site (npm run preview) and the backend started with
//   PAYMENT_PROVIDER=chapa CHAPA_SECRET_KEY=CHASECK_TEST-local-simulated CHAPA_WEBHOOK_SECRET=<16+ characters>
//   CHAPA_BASE_URL=http://127.0.0.1:4010 WEB_APP_URL=<WEB_URL>
// Settings: WEB_URL (default http://localhost:5173), API_BASE_URL (default http://localhost:3000),
//   FAKE_CHAPA_PORT (default 4010), CHROME_CDP_URL (attach to a running Chrome instead of starting one).
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const WEB = (process.env.WEB_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
const API = `${(process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/api/v1`;
const PORT = Number(process.env.FAKE_CHAPA_PORT ?? 4010);
const CHECKOUT = 'https://checkout.chapa.co/checkout/payment/';
const SHOTS = 'test-results';
mkdirSync(SHOTS, { recursive: true });
const ok = (name) => console.log('PASS', name);

// ── The simulated Chapa: initialize and verify, as documented at developer.chapa.co ──
const payments = new Map();
const chapa = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const { pathname } = new URL(req.url, 'http://chapa');
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'POST' && pathname === '/v1/transaction/initialize') {
    const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    payments.set(request.tx_ref, { request, status: null });
    return send(200, {
      message: 'Hosted Link',
      status: 'success',
      data: { checkout_url: CHECKOUT + request.tx_ref },
    });
  }
  const payment = payments.get(decodeURIComponent(pathname.replace('/v1/transaction/verify/', '')));
  if (req.method !== 'GET' || !payment?.status) {
    return send(404, {
      message: 'Invalid transaction or Transaction not found',
      status: 'failed',
      data: null,
    });
  }
  const { request, status } = payment;
  return send(200, {
    message: 'Payment details',
    status: 'success',
    data: {
      currency: request.currency,
      amount: Number(request.amount),
      mode: 'test',
      status,
      reference: status === 'success' ? `AP${request.tx_ref.slice(4, 14)}` : null,
      tx_ref: request.tx_ref,
    },
  });
});
await new Promise((resolve) => chapa.listen(PORT, '127.0.0.1', resolve));

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
  const text = await r.text();
  assert.ok(r.ok, `${method} ${path} ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
async function accessibilityFaults(target) {
  await target.evaluate(AXE);
  const { violations } = await target.evaluate(() =>
    window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }),
  );
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const browser = process.env.CHROME_CDP_URL
  ? await chromium.connectOverCDP(process.env.CHROME_CDP_URL)
  : await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
page.on('pageerror', (e) => problems.push(String(e)));
// Chapa's payment page: never reached for real.
await context.route(`${CHECKOUT}**`, (route) =>
  route.fulfill({ contentType: 'text/html', body: '<title>Chapa</title><h1>Simulated Chapa checkout</h1>' }),
);
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const balance = () => page.getByRole('region', { name: 'Balance' });

try {
  const options = await (async () => {
    const phoneNumber = `09${Math.floor(10000000 + Math.random() * 89999999)}`;
    const password = `Deposit-${randomUUID()}`;
    await api('POST', '/auth/register', null, { phoneNumber, password });
    await page.goto(`${WEB}/sign-in`);
    await page.getByLabel('Phone number').fill(phoneNumber);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('link', { name: 'Wallet', exact: true }).first().click();
    await page.getByRole('heading', { name: 'Add money' }).waitFor();
    return true;
  })();
  assert.ok(options);
  await page.getByText('Test mode: payments here are practice only').waitFor();
  assert.match(await balance().innerText(), /ETB 0/);
  assert.deepEqual(await accessibilityFaults(page), []);
  await shot('20-add-money');
  ok('wallet page offers Add money and says the site is in test mode');

  await page.getByLabel('Amount (ETB)').fill('5');
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.getByText('The smallest amount you can add is ETB 10.').waitFor();
  assert.equal(payments.size, 0);
  ok('an amount under the minimum is refused before anything is sent');

  // Pay ETB 500: handed over to the payment page, then sent back before Chapa has confirmed.
  await page.getByLabel('Amount (ETB)').fill('500');
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.waitForURL(`${CHECKOUT}**`);
  const [[txRef, first]] = [...payments];
  assert.equal(page.url(), CHECKOUT + txRef);
  assert.equal(first.request.amount, '500.00');
  assert.equal(first.request.currency, 'ETB');
  assert.match(first.request.return_url, new RegExp(`^${WEB}/wallet/deposits/[0-9a-f-]{36}$`));
  ok('Continue to payment opens a Chapa payment for ETB 500 and leaves for its checkout page');

  await page.goto(`${first.request.return_url}?status=success`);
  await page.getByRole('heading', { name: 'Waiting for your payment' }).waitFor();
  await page.getByText(txRef).waitFor();
  assert.deepEqual(await accessibilityFaults(page), []);
  await shot('21-payment-waiting');
  ok('back on the site before Chapa confirms: waiting, whatever the address says');

  first.status = 'success';
  await page.getByRole('heading', { name: 'Payment received' }).waitFor({ timeout: 60_000 });
  await page.getByText('ETB 500 was added to your wallet.').waitFor();
  assert.deepEqual(await accessibilityFaults(page), []);
  await shot('22-payment-received');
  await page.getByRole('link', { name: 'Go to wallet' }).click();
  await page.getByText('Deposit', { exact: true }).waitFor();
  assert.match(await balance().innerText(), /ETB 500/);
  await shot('23-wallet-after-deposit');
  ok('once Chapa confirms, the page updates by itself and the wallet shows ETB 500 and the deposit');

  await page.goto(first.request.return_url);
  await page.getByRole('heading', { name: 'Payment received' }).waitFor();
  await page.getByRole('link', { name: 'Go to wallet' }).click();
  await page.getByText('Deposit', { exact: true }).waitFor();
  assert.equal(await page.getByText('Deposit', { exact: true }).count(), 1);
  assert.match(await balance().innerText(), /ETB 500/);
  ok('opening the result page again does not add the money twice');

  // A second payment that the payer abandons at Chapa.
  await page.getByLabel('Amount (ETB)').fill('200');
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.waitForURL(`${CHECKOUT}**`);
  const second = [...payments.values()][1];
  await page.goto(`${WEB}/wallet`);
  await page.getByRole('heading', { name: 'Payments not finished' }).waitFor();
  await shot('24-payment-not-finished');
  second.status = 'failed';
  await page.getByRole('link', { name: 'View payment' }).click();
  await page.getByRole('heading', { name: 'Payment not completed' }).waitFor({ timeout: 60_000 });
  assert.deepEqual(await accessibilityFaults(page), []);
  await shot('25-payment-failed');
  await page.getByRole('link', { name: 'Try again' }).click();
  await page.getByRole('heading', { name: 'Add money' }).waitFor();
  assert.match(await balance().innerText(), /ETB 500/);
  ok('an unfinished payment is listed on the wallet page; when it fails, no money is added');

  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${WEB}/wallet`);
    await page.getByRole('heading', { name: 'Add money' }).waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `the wallet page is ${overflow}px too wide at ${width}px`);
    await shot(`26-add-money-${width}`);
  }
  ok('the wallet page fits at 320 and 1280 pixels wide');

  assert.deepEqual(problems, []);
  ok('no browser console errors');
} catch (error) {
  await shot('deposit-check-failure').catch(() => {});
  console.error('URL', page.url(), '\nconsole', problems);
  throw error;
} finally {
  await context.close();
  await browser.close();
  chapa.close();
  chapa.closeAllConnections();
}
