# LUB Auction — website

The user-facing website of the Lowest Unique Bid auction platform. It is a separate project from the
backend (`lub-auction-backend`) and talks to it only through the HTTP API.

Built with React, TypeScript, Vite and Tailwind CSS. Mobile-first: it is meant to be used in a phone browser.

## What is built so far

| Area                   | Pages                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Account                | Register (phone number + password, no SMS), sign in, sign out, sign out everywhere, change password |
| Session                | Stays signed in across reloads and tabs; access tokens are renewed in the background                |
| Forced password change | After a staff password reset the user must choose a new password before anything else               |
| Auctions               | Public list (live / upcoming / ended, paged) and auction detail with rules, countdown and result    |
| Wallet                 | Balance, money on hold, frozen notice, history (newest first, older entries on request)             |
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

Wins and notifications notes:

- A winner can send delivery details once staff have confirmed the win, and change them until staff
  confirm the details. After that the form is gone and the page says to contact support.
- A notification opens the page it is about (my wins, the auction, the wallet, the account) and is marked
  as read. The unread count is refreshed every minute.

Not built yet: paying in and withdrawing (the backend has no payment provider yet).
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
  lib/        money, clock, validation helpers
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
the wallet, placing bids, the result, notifications, delivery details for a win, and recent winners.
It needs the backend, this site (`npm run preview` or `npm run dev`) and the demo data, plus
`SEED_ADMIN_PHONE` / `SEED_ADMIN_PASSWORD`. It writes screenshots to `test-results/`.
Local use only: it creates accounts and resets a password.

## Deployment

`npm run build` produces static files in `dist/`. Serve them from any static host with:

- every unknown path answered with `index.html` (the site uses client-side routes such as `/auctions/<id>`);
- HTTPS;
- `VITE_API_BASE_URL` set at build time to the public backend address;
- the site's address added to the backend's `CORS_ORIGINS`.

Alternatively, put the API behind the site's own address with a reverse proxy (`/api` → backend) and build
with `VITE_API_BASE_URL=/`. Then no CORS setting is needed. To try this locally:

```bash
VITE_API_BASE_URL=/ npm run build
API_PROXY_TARGET=http://localhost:3000 npm run preview
```

The build adds a Content-Security-Policy to `index.html` that only allows requests to the configured backend.
