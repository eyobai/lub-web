# LUB Auction — website

The user-facing website of the Lowest Unique Bid auction platform. It is a separate project from the
backend (`lub-auction-backend`) and talks to it only through the HTTP API.

Built with React, TypeScript, Vite and Tailwind CSS. Mobile-first: it is meant to be used in a phone browser.

## What is built

| Area                   | Pages                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Account                | Register (phone number + password, no SMS), sign in, sign out, sign out everywhere, change password |
| Session                | Stays signed in across reloads and tabs; access tokens are renewed in the background                |
| Forced password change | After a staff password reset the user must choose a new password before anything else               |
| Auctions               | Public list (live / upcoming / ended, paged) and auction detail with rules, countdown and result    |
| Wallet                 | Balance, money on hold, frozen notice, history (newest first, older entries on request)             |
| Add money              | Amount form on the wallet page, hand-over to Chapa's payment page, payment result page              |
| Bidding                | One or several amounts per request, a range of amounts, the total fee, a confirmation before paying |
| My bids and results    | All my bids by auction; on an ended auction, whether I won and how each of my bids did              |
| My wins                | My wins with their progress (confirmed, details, on its way, delivered), tracking, delivery details |
| Recent winners         | Public list of published wins; the winner's phone number is masked by the server                    |
| Notifications          | List (all / unread), unread count in the header, mark one or all as read                            |

Bidding notes:

- Amounts are checked in the browser against the auction's range and step before anything is sent, and
  money is handled as whole minor units (never floating point). The server checks everything again.
- Every request carries an `Idempotency-Key`. If the answer is lost (no connection, server error) the
  same key is sent again on retry, so a bid cannot be charged twice.
- A request is all or nothing: if the server refuses one amount, nothing is placed or charged, and the
  page marks the refused amounts.

Add money notes:

- The wallet page asks the server whether deposits are on, the limits and whether Chapa is in test mode
  (`GET /wallet/deposit-options`). With deposits off, or a frozen wallet, the form is not shown.
- "Continue to payment" opens the payment on the server and then leaves the site for the checkout address
  the server returns. Only an `https` address is followed.
- Chapa sends the user back to `/wallet/deposits/:id`. That page shows what the server says about the
  payment and nothing else: `status=success` in the address is ignored. While the payment is not confirmed
  it asks the server again every 3 seconds (every 15 seconds after two minutes).
- The wallet is credited by the server once it has confirmed the payment with Chapa. The site never adds
  money itself.
- Payments started and not finished are listed on the wallet page, so closing the tab does not lose them.
- Retrying "Continue to payment" for the same amount reuses one `Idempotency-Key`, so a lost answer cannot
  open two payments.

Wins and notifications notes:

- A winner can send delivery details once staff have confirmed the win, and change them until staff
  confirm the details. After that the form is gone and the page says to contact support.
- A notification opens the page it is about (my wins, the auction, the wallet, the account) and is marked
  as read. The unread count is refreshed every minute.

Across the whole site:

- **Tab titles**: every page names the browser tab, for example "Wallet · LUB Auction"; an auction page uses
  the auction's title.
- **Moving between pages**: a new page starts at its top with the keyboard and screen reader placed on it.
  Going back returns to where the user was.
- **Offline**: a notice appears while the device has no connection. Pages already seen stay readable, and
  data is fetched again when the connection returns.
- **A page that fails**: a fault in one page shows "Something went wrong" with a reload button in place of
  that page; the header and navigation keep working.
- **Home screen**: the site has a web app manifest and icons, so "Add to Home screen" on a phone gives it its
  own icon and opens it without the browser's address bar. It does not work without a connection.

Not built yet: withdrawing money (the backend has no withdrawals yet).
The admin screens will be a separate project.

## Running it

Requires Node.js 22 and a running backend.

```bash
cp .env.example .env        # set VITE_API_BASE_URL to the backend address
npm install
npm run dev                 # http://localhost:5173
```

The backend must allow this site's address: add it to `CORS_ORIGINS` in the backend's `.env`
(`http://localhost:5173` for local work).

### Demo data

An empty backend shows an empty auction list. To fill a **local** backend with a few auctions:

```bash
# in the backend, once: create the bootstrap admin
SEED_ADMIN_PHONE=+251900000001 SEED_ADMIN_PASSWORD='<12+ characters>' npm run seed
# in this project
SEED_ADMIN_PHONE=+251900000001 SEED_ADMIN_PASSWORD='<the same>' npm run seed:demo
```

It creates two running auctions, one upcoming auction, and one that ends after about 25 seconds with the
bids from the brief (ETB 1 ×5, 2 ×3, 3 ×2, 4 ×1, 5 ×1), so the result page shows ETB 4.

## Commands

| Command             | What it does                                                            |
| ------------------- | ----------------------------------------------------------------------- |
| `npm run dev`       | Development server                                                      |
| `npm run build`     | Type check and production build into `dist/`                            |
| `npm run preview`   | Serve the production build locally                                      |
| `npm test`          | Unit and page tests (Vitest, Testing Library)                           |
| `npm run check`     | Type check, lint, format check, tests and build                         |
| `npm run api:types` | Regenerate `src/api/schema.d.ts` from `api/openapi.json`                |
| `npm run seed:demo` | Demo auctions on a local backend                                        |
| `npm run test:live` | Drives the site in a real browser against a running backend (see below) |
| `npm run test:pay`  | Drives "Add money" in a real browser against a simulated Chapa          |

## Keeping in step with the backend

`api/openapi.json` is a copy of the backend's `docs/openapi.json`, and every request and response type in
this project is generated from it. When the backend API changes:

```bash
cp ../lub-auction-backend/docs/openapi.json api/openapi.json
npm run api:types
npm run check               # the type check points at every place that needs updating
```

## How it is organised

```
src/
  api/        typed API client, error handling, generated types
  auth/       session storage and renewal, sign-in state, route guards
  auctions/   auction queries and auction components
  components/ app shell and shared UI pieces
  pages/      one file per page
  bids/       bid form, amount checks, bid queries
  wallet/     wallet queries, deposit queries and amount checks, the Add money form
  wins/       win and winner queries, delivery form and its checks
  notifications/ notification queries and where each one leads
  lib/        money, clock, validation helpers, tab title, online state
  test/       test helpers (fake API, app renderer)
```

Things worth knowing:

- **Money** arrives from the API as decimal strings and is formatted as text. It is never converted to a
  JavaScript number, so large amounts cannot lose precision.
- **Countdowns** use the server's clock (`serverTime` in auction responses), not the device clock, so a phone
  with a wrong time still shows the right time left. The server alone decides whether an auction is open.
- **Session**: the access and refresh tokens are kept in the browser's local storage. Tokens are renewed
  shortly before they expire and once more if the server refuses one. Renewal is coordinated across tabs,
  because the backend treats a refresh token used twice as stolen and ends every session.
- **Signed out by the server**: a revoked session, or a suspended or blocked account, signs the user out with
  a notice. A busy server, a rate limit or a lost connection never signs anyone out.
- **Error messages** shown to users are written in this project and chosen by the API's error code; the
  server's own wording is not displayed.
- **Product images** are links supplied by staff. Only `http(s)` links are shown, without a referrer.

## Live browser check

`npm run test:live` registers a new user and walks through the site in Chrome: auction list and detail,
registration, staying signed in, token renewal, a staff password reset with the forced change, sign out,
the wallet, placing bids, the result, notifications, delivery details for a win, recent winners, tab
titles, and losing the connection. It then runs the axe-core accessibility rules (WCAG 2.1 A and AA) on
15 pages and fails on any fault.
It needs the backend, this site (`npm run preview` or `npm run dev`) and the demo data, plus
`SEED_ADMIN_PHONE` / `SEED_ADMIN_PASSWORD`. It writes screenshots to `test-results/`.
Local use only: it creates accounts and resets a password.

## Deployment

`npm run build` produces static files in `dist/`. There is no server-side part: any static host works.

### Recommended: the site and the API on one address

Put a reverse proxy in front of both, so `https://example.com/` is the site and `https://example.com/api/`
is the backend. No CORS setting is needed, and visitors only ever talk to one address.

1. Build with `VITE_API_BASE_URL=/ npm run build`.
2. Copy `dist/` to the server.
3. Configure the web server as in [`deploy/nginx.conf.example`](deploy/nginx.conf.example).
4. Run the backend with `TRUST_PROXY=true`, so its rate limits see the visitor's address and not the proxy's.

To try the same arrangement locally without nginx:

```bash
VITE_API_BASE_URL=/ npm run build
API_PROXY_TARGET=http://localhost:3000 npm run preview
```

### Alternative: the site on a static host, the API elsewhere

1. Build with `VITE_API_BASE_URL=https://api.example.com npm run build` (no trailing slash, no `/api/v1`).
2. Add the site's address to the backend's `CORS_ORIGINS`.
3. Configure the host as described below.

`VITE_API_BASE_URL` is fixed into the files at build time. Changing the backend address means building again.

### What the web server must do

| Requirement                                      | Why                                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| HTTPS only                                       | Passwords and sign-in tokens are sent on every request                                        |
| Unknown paths answer with `index.html`           | Pages such as `/auctions/<id>` exist only in the browser; without this a reload gives a 404   |
| `/assets/*` cached for a year, `immutable`       | Those file names change with their content                                                    |
| `index.html` sent with `Cache-Control: no-cache` | Otherwise visitors keep an old release until their cache expires                              |
| `X-Frame-Options: DENY`                          | Stops other sites from showing this one inside a frame; it cannot be set from the page itself |
| `X-Content-Type-Options: nosniff`                | Files are only ever treated as the type the server declares                                   |
| gzip or brotli compression                       | The scripts are 117 kB compressed and about 385 kB without                                    |

The build adds a Content-Security-Policy to `index.html`: scripts and styles only from the site itself, and
requests only to the site and the configured backend.

### Releasing a new version

1. `npm run check` passes.
2. Build, then upload `dist/assets/` first and `index.html` last, and keep the previous release's files in
   `assets/` for a day. A visitor with the site open still has the old `index.html`, which asks for the old
   files.
3. Open the site, sign in, and check the browser console for errors.

If the backend API changed, release the backend first; see "Keeping in step with the backend".

## Size and loading

Measured on the production build:

| File          | Compressed | Contents                       |
| ------------- | ---------- | ------------------------------ |
| `vendor-*.js` | 94 kB      | React and the other libraries  |
| `index-*.js`  | 23 kB      | The site's own code, all pages |
| `index-*.css` | 6 kB       | Styles                         |

The libraries are a separate file so that a release which only changes the site's code leaves them cached.
The pages are deliberately not split into one file each: all of them together are 23 kB, and splitting
would make each first visit to a page wait for another download.

### Add money check

`npm run test:pay` registers a new user and walks through adding money in Chrome: an amount under the
minimum, the hand-over to the payment page, coming back before the payment is confirmed, the page updating
by itself once it is, the wallet balance and history, opening the result page twice, and a payment that
fails. It contacts no real Chapa: the script answers the two Chapa calls the backend makes and stands in
for Chapa's payment page in the browser. Start the backend for it with:

```
PAYMENT_PROVIDER=chapa
CHAPA_SECRET_KEY=CHASECK_TEST-local-simulated
CHAPA_WEBHOOK_SECRET=<any 16 or more characters>
CHAPA_BASE_URL=http://127.0.0.1:4010
WEB_APP_URL=http://localhost:5173
```

It does not cover Chapa's webhook (the backend's own tests do) or Chapa's real payment page.

### Trying Add money by hand, without a Chapa account

The backend has a stand-in for Chapa with a clickable checkout page: `npm run chapa:sim` in the backend
project (its README has the `.env` lines). The site follows that plain-http payment page only while the
site itself is open on `localhost`; anywhere else, a payment page must be https.

## Hand-off notes

What has and has not been checked:

- **Checked**: 176 unit and page tests; the live browser check in Chrome against the real backend, at phone
  size (390 px wide); layouts at 320, 390 and 1280 px; automated accessibility rules on 15 pages; adding
  money against a simulated Chapa (`npm run test:pay`); the
  example nginx configuration (without its HTTPS part) with nginx 1.28.
- **Not checked**: Safari, Firefox and Samsung Internet; real phones; a screen reader used by a person
  (automated rules find only part of what a person would); slow or unreliable mobile networks beyond a
  simulated loss of connection; the HTTPS part of the nginx example.

Known limits:

- English only.
- Adding money goes through Chapa and has only been run against a simulated Chapa, not Chapa itself.
  Real payments need the backend's live-mode steps first (see the backend's deployment notes).
- No withdrawing money.
- No "forgot password": staff reset a password and the user must then choose a new one.
- The unread notification count is refreshed every minute, not instantly, and there are no push notifications.
- Sign-in tokens are kept in the browser's local storage. The Content-Security-Policy above is what protects
  them, so do not add third-party scripts (analytics, chat widgets) without reviewing it.
- Notification texts are written by the backend and shown as they arrive.

Before going live:

- Replace every secret in the backend's `.env` and follow the backend's own deployment notes.
- Decide the support contact shown to users; the pages currently say "contact support" without a number.
- Replace the placeholder icon (`public/favicon.svg`, `public/icon-*.png`, `public/apple-touch-icon.png`).
- Try the site on the phones and browsers your users have.
