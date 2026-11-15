// Fills a local backend with demo auctions so the site has something to show:
//   two running auctions, one upcoming, and one that ends after ~25 seconds with the ETB 4 example result.
//
// Usage (backend running, bootstrap admin created with `npm run seed` in the backend):
//   SEED_ADMIN_PHONE=+2519... SEED_ADMIN_PASSWORD=... node scripts/seed-demo.mjs
// Never run this against a real deployment: it credits demo wallets.
import { randomUUID } from 'node:crypto';

const API = `${(process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/api/v1`;
const { SEED_ADMIN_PHONE, SEED_ADMIN_PASSWORD } = process.env;
if (!SEED_ADMIN_PHONE || !SEED_ADMIN_PASSWORD)
  throw new Error('Set SEED_ADMIN_PHONE and SEED_ADMIN_PASSWORD');

async function call(method, path, { token, body, idempotent } = {}) {
  const response = await fetch(API + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(idempotent ? { 'idempotency-key': randomUUID() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const inMinutes = (m) => new Date(Date.now() + m * 60_000).toISOString();
const admin = (
  await call('POST', '/auth/login', {
    body: { phoneNumber: SEED_ADMIN_PHONE, password: SEED_ADMIN_PASSWORD },
  })
).tokens.accessToken;

async function auction(product, title, overrides) {
  const created = await call('POST', '/admin/products', { token: admin, body: product });
  return call('POST', '/admin/auctions', {
    token: admin,
    body: {
      productId: created.id,
      title,
      bidFeeMinor: '7500',
      minBidMinor: '100',
      maxBidMinor: '100000',
      bidStepMinor: '100',
      noUniqueBidPolicy: 'REFUND_BID_FEES',
      opensAt: inMinutes(1),
      closesAt: inMinutes(60 * 24 * 3),
      ...overrides,
    },
  });
}
const activate = (a) => call('POST', `/admin/auctions/${a.id}/activate`, { token: admin });

const phone = await auction(
  {
    name: 'Samsung Galaxy A55',
    brand: 'Samsung',
    model: 'SM-A556E',
    marketValueMinor: '6500000',
    description: 'Brand new, sealed, with a one-year warranty.',
    specifications: { Storage: '256 GB', Memory: '8 GB', 'Screen size (in)': 6.6, '5G': true },
  },
  'Win a Samsung Galaxy A55',
  { description: 'The lowest bid that nobody else placed takes the phone home.' },
);
await activate(phone);

const tv = await auction(
  { name: 'LG 55" 4K Smart TV', brand: 'LG', model: '55UR7800', marketValueMinor: '9800000' },
  'LG 55-inch 4K Smart TV',
  { bidFeeMinor: '10000', closesAt: inMinutes(90), maxBidsPerUser: 50, noUniqueBidPolicy: 'NO_WINNER' },
);
await activate(tv);

const laptop = await auction(
  { name: 'HP Pavilion 15', brand: 'HP', model: '15-eg3000', marketValueMinor: '12000000' },
  'HP Pavilion 15 laptop',
  { opensAt: inMinutes(60 * 5), closesAt: inMinutes(60 * 24 * 5) },
);
await call('POST', `/admin/auctions/${laptop.id}/schedule`, { token: admin });

// The example from the brief: ETB 1 ×5, 2 ×3, 3 ×2, 4 ×1, 5 ×1 -> ETB 4 wins.
const quick = await auction(
  { name: 'JBL Flip 6 speaker', brand: 'JBL', model: 'Flip 6', marketValueMinor: '1500000' },
  'JBL Flip 6 speaker',
  {
    opensAt: new Date(Date.now() + 2_000).toISOString(),
    closesAt: new Date(Date.now() + 25_000).toISOString(),
  },
);
await activate(quick);
const bidsPerBidder = [
  ['100', '200', '300', '400'],
  ['100', '200', '300', '500'],
  ['100', '200'],
  ['100'],
  ['100'],
];
const run = Date.now().toString().slice(-6);
for (const [index, amountsMinor] of bidsPerBidder.entries()) {
  const registered = await call('POST', '/auth/register', {
    body: { phoneNumber: `+2519${index + 1}${run}0`.padEnd(13, '0'), password: `Demo-pass-${randomUUID()}` },
  });
  await call('POST', `/admin/wallets/${registered.userId}/adjustments`, {
    token: admin,
    idempotent: true,
    body: { direction: 'CREDIT', amountMinor: '100000', reason: 'Demo data: starting balance' },
  });
  await call('POST', `/auctions/${quick.id}/bids`, {
    token: registered.tokens.accessToken,
    idempotent: true,
    body: { amountsMinor },
  });
}

console.log(`Running:  ${phone.id}  ${tv.id}`);
console.log(`Upcoming: ${laptop.id}`);
console.log(`Ends in about 25 seconds, expected winning bid ETB 4: ${quick.id}`);
