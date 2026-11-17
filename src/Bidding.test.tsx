import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { session } from './auth/session';
import {
  aMyBid,
  aSubmission,
  aTransaction,
  aUser,
  aWallet,
  anAuction,
  apiError,
  fakeApi,
  myBids,
  myResult,
  tokens,
} from './test/fakeApi';
import { renderApp } from './test/renderApp';

const ID = anAuction().id;
const ME = 'GET /api/v1/auth/me';
const WALLET = 'GET /api/v1/wallet';
const HISTORY = 'GET /api/v1/wallet/transactions';
const DETAIL = `GET /api/v1/auctions/${ID}`;
const MINE = 'GET /api/v1/bids/mine';
const PLACE = `POST /api/v1/auctions/${ID}/bids`;
const RESULT = `GET /api/v1/auctions/${ID}/result`;
const MY_RESULT = `GET /api/v1/auctions/${ID}/result/mine`;

type Reply = [number, unknown?];
type Handlers = Parameters<typeof fakeApi>[0];

/** A signed-in user looking at a running auction, with a wallet of ETB 1,000 and no bids yet. */
function signedIn(overrides: Handlers = {}) {
  session.start(aUser(), tokens());
  return fakeApi({
    [ME]: [200, aUser()],
    [WALLET]: [200, aWallet()],
    [DETAIL]: [200, anAuction()],
    [MINE]: [200, myBids([])],
    ...overrides,
  });
}

async function add(user: ReturnType<typeof renderApp>['user'], amount: string) {
  const field = await screen.findByLabelText('Bid amount (ETB)');
  await user.clear(field);
  await user.type(field, amount);
  await user.click(screen.getByRole('button', { name: 'Add' }));
}

const toPlace = () => within(screen.getByRole('list', { name: 'Bids to place' })).getAllByRole('listitem');

describe('wallet', () => {
  it('shows the balance and the history, and loads older entries on request', async () => {
    const fake = signedIn({
      [HISTORY]: (call): Reply =>
        call.query.get('cursor') === '17'
          ? [
              200,
              {
                items: [aTransaction({ type: 'DEPOSIT', direction: 'CREDIT', amountMinor: '50000' })],
                nextCursor: null,
              },
            ]
          : [
              200,
              {
                items: [
                  aTransaction({ description: 'Bid fee: 1 bid in "Samsung Galaxy A55 auction"' }),
                  aTransaction({
                    type: 'ADJUSTMENT',
                    direction: 'CREDIT',
                    amountMinor: '100000',
                    balanceAfterMinor: '100000',
                    description: 'internal staff note',
                    status: 'REVERSED',
                  }),
                ],
                nextCursor: '17',
              },
            ],
    });
    const { user } = renderApp('/wallet');

    const balance = await screen.findByRole('region', { name: 'Balance' });
    expect(balance).toHaveTextContent('ETB 1,000');
    expect(balance).not.toHaveTextContent('On hold');

    const rows = await screen.findAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Bid fees');
    expect(rows[0]).toHaveTextContent('Bid fee: 1 bid in "Samsung Galaxy A55 auction"');
    expect(rows[0]).toHaveTextContent('−ETB 75');
    expect(rows[0]).toHaveTextContent('Balance ETB 925');
    expect(rows[1]).toHaveTextContent('Adjustment by support');
    expect(rows[1]).toHaveTextContent('Reversed');
    expect(rows[1]).toHaveTextContent('+ETB 1,000');
    expect(screen.queryByText(/internal staff note/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show older' }));
    expect(await screen.findByText('Deposit')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Show older' })).not.toBeInTheDocument();
    expect(fake.callsTo(HISTORY).map((c) => c.query.get('cursor'))).toEqual([null, '17']);
  });

  it('says so when the wallet is frozen or has money on hold, or is empty', async () => {
    signedIn({
      [WALLET]: [200, aWallet({ isFrozen: true, heldMinor: '25000', held: '250.00' })],
      [HISTORY]: [200, { items: [], nextCursor: null }],
    });
    renderApp('/wallet');
    expect(await screen.findByText(/Your wallet is frozen/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Balance' })).toHaveTextContent('On hold: ETB 250');
    expect(await screen.findByText('Nothing has gone in or out of your wallet yet.')).toBeInTheDocument();
  });

  it('offers to try again when the wallet cannot be loaded', async () => {
    let healthy = false;
    signedIn({
      [WALLET]: (): Reply => (healthy ? [200, aWallet()] : apiError(503, 'SERVICE_BUSY')),
      [HISTORY]: [200, { items: [], nextCursor: null }],
    });
    const { user } = renderApp('/wallet');
    expect(await screen.findByRole('alert')).toHaveTextContent('The service is busy right now');
    healthy = true;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Balance' })).toHaveTextContent('ETB 1,000');
  });

  it('is not open to visitors, and the header shows the balance once signed in', async () => {
    fakeApi({});
    const visitor = renderApp('/wallet');
    await waitFor(() => expect(visitor.address()).toBe('/sign-in'));
    visitor.unmount();

    signedIn({ [HISTORY]: [200, { items: [], nextCursor: null }] });
    renderApp('/wallet');
    expect(await screen.findByRole('link', { name: 'Balance: ETB 1,000' })).toHaveAttribute(
      'href',
      '/wallet',
    );
    for (const name of ['Home', 'My bids', 'Wallet', 'Account']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
  });
});

describe('placing bids', () => {
  it('shows visitors no bid form', async () => {
    fakeApi({ [DETAIL]: [200, anAuction()] });
    renderApp(`/auctions/${ID}`);
    expect(await screen.findByRole('link', { name: 'Sign in to bid' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Bid amount (ETB)')).not.toBeInTheDocument();
  });

  it('collects amounts, shows the cost, asks to confirm, pays and reports what was placed', async () => {
    let paid = false;
    const fake = signedIn({
      [WALLET]: (): Reply => [
        200,
        paid ? aWallet({ availableMinor: '77500', available: '775.00' }) : aWallet(),
      ],
      [PLACE]: (): Reply => {
        paid = true;
        return [201, aSubmission(['400', '700', '1200'])];
      },
    });
    const { user } = renderApp(`/auctions/${ID}`);

    await add(user, '7');
    await add(user, '4');
    await add(user, '12.00');
    expect(toPlace().map((li) => li.textContent)).toEqual(['ETB 4×', 'ETB 7×', 'ETB 12×']);
    expect(screen.getByText(/3 bids × ETB 75 =/)).toHaveTextContent('ETB 225');
    expect(fake.callsTo(PLACE)).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Review 3 bids' }));
    expect(screen.getByRole('heading', { name: 'Place 3 bids?' })).toBeInTheDocument();
    expect(
      screen.getByText(/ETB 225 will be taken from your wallet \(balance ETB 1,000\)/),
    ).toBeInTheDocument();
    expect(fake.callsTo(PLACE)).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Pay ETB 225 and bid' }));
    expect(
      await screen.findByText(/3 bids placed: ETB 4, ETB 7, ETB 12\. ETB 225 was taken/),
    ).toBeInTheDocument();

    const [call] = fake.callsTo(PLACE);
    expect(call.body).toEqual({ amountsMinor: ['400', '700', '1200'] });
    expect(call.idempotencyKey).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
    expect(call.authorization).toBe('Bearer access-one');
    expect(fake.callsTo(PLACE)).toHaveLength(1);
    // The form is empty again and the header shows the new balance.
    expect(screen.queryByRole('list', { name: 'Bids to place' })).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Balance: ETB 775' })).toBeInTheDocument();
  });

  it('explains amounts the auction does not accept and never sends them', async () => {
    const fake = signedIn({ [MINE]: [200, myBids([aMyBid('900')])] });
    const { user } = renderApp(`/auctions/${ID}`);
    const problems: [string, RegExp][] = [
      ['abc', /Enter an amount such as 4 or 4\.50/],
      ['0.50', /The lowest allowed bid is ETB 1\./],
      ['1001', /The highest allowed bid is ETB 1,000\./],
      ['4.50', /Bids go up in steps of ETB 1, starting at ETB 1\./],
      ['9', /You have already bid ETB 9 in this auction\./],
    ];
    await screen.findByText('Your bids in this auction (1)');
    for (const [typed, message] of problems) {
      await add(user, typed);
      expect(screen.getByLabelText('Bid amount (ETB)')).toHaveAccessibleDescription(message);
      expect(screen.queryByRole('list', { name: 'Bids to place' })).not.toBeInTheDocument();
    }
    await add(user, '4');
    await add(user, '4.00');
    expect(screen.getByLabelText('Bid amount (ETB)')).toHaveAccessibleDescription(
      /ETB 4 is already in your list/,
    );
    expect(toPlace()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Remove ETB 4' }));
    expect(screen.queryByRole('list', { name: 'Bids to place' })).not.toBeInTheDocument();
    expect(fake.callsTo(PLACE)).toHaveLength(0);
  });

  it('adds a range, leaving out amounts already bid, and refuses one that is too long', async () => {
    signedIn({
      [DETAIL]: [200, anAuction({ maxBidsPerRequest: 5 })],
      [MINE]: [200, myBids([aMyBid('500')])],
    });
    const { user } = renderApp(`/auctions/${ID}`);
    await screen.findByText('Your bids in this auction (1)');
    await user.click(screen.getByRole('button', { name: 'Add a range of amounts' }));

    await user.type(screen.getByLabelText('From'), '1');
    await user.type(screen.getByLabelText('To'), '50');
    await user.click(screen.getByRole('button', { name: 'Add range' }));
    expect(screen.getByRole('alert')).toHaveTextContent('That range is too long. You can add 5 more bids.');

    await user.clear(screen.getByLabelText('From'));
    await user.clear(screen.getByLabelText('To'));
    await user.type(screen.getByLabelText('From'), '7');
    await user.type(screen.getByLabelText('To'), '3');
    await user.click(screen.getByRole('button', { name: 'Add range' }));
    expect(toPlace().map((li) => li.textContent)).toEqual(['ETB 3×', 'ETB 4×', 'ETB 6×', 'ETB 7×']);

    await add(user, '20');
    await add(user, '21');
    expect(screen.getByLabelText('Bid amount (ETB)')).toHaveAccessibleDescription(
      /You can place at most 5 bids at a time/,
    );
    expect(toPlace()).toHaveLength(5);
  });

  it('does not let a wallet that is too small or frozen go on to pay', async () => {
    signedIn({ [WALLET]: [200, aWallet({ availableMinor: '10000', available: '100.00' })] });
    const first = renderApp(`/auctions/${ID}`);
    await add(first.user, '4');
    expect(screen.getByRole('button', { name: 'Review 1 bid' })).toBeEnabled();
    await add(first.user, '5');
    expect(screen.getByText(/Your wallet has ETB 100, which does not cover ETB 150/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review 2 bids' })).toBeDisabled();
    first.unmount();

    signedIn({ [WALLET]: [200, aWallet({ isFrozen: true })] });
    const second = renderApp(`/auctions/${ID}`);
    await add(second.user, '4');
    expect(screen.getByText(/Your wallet is frozen, so you cannot bid/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review 1 bid' })).toBeDisabled();
  });

  it('returns to the list and marks the amounts when the server refuses them', async () => {
    const fake = signedIn({
      [PLACE]: apiError(409, 'DUPLICATE_BID', { amountsMinor: ['700'] }),
    });
    const { user } = renderApp(`/auctions/${ID}`);
    await add(user, '4');
    await add(user, '7');
    await user.click(screen.getByRole('button', { name: 'Review 2 bids' }));
    await user.click(screen.getByRole('button', { name: 'Pay ETB 150 and bid' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You have already bid ETB 7 in this auction. Remove it and try again. Nothing was charged.',
    );
    expect(screen.queryByText(/server wording/)).not.toBeInTheDocument();
    const [four, seven] = toPlace();
    expect(four.className).not.toMatch(/red/);
    expect(seven.className).toMatch(/red/);

    // Changing the list clears the complaint; the next attempt is a new request with a new key.
    await user.click(screen.getByRole('button', { name: 'Remove ETB 7' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review 1 bid' }));
    await user.click(screen.getByRole('button', { name: 'Pay ETB 75 and bid' }));
    await waitFor(() => expect(fake.callsTo(PLACE)).toHaveLength(2));
    const [one, two] = fake.callsTo(PLACE);
    expect(two.body).toEqual({ amountsMinor: ['400'] });
    expect(two.idempotencyKey).not.toBe(one.idempotencyKey);
  });

  it.each<[string, Reply, RegExp]>([
    [
      'the wallet is short',
      apiError(422, 'INSUFFICIENT_FUNDS', { currency: 'ETB', requiredMinor: '7500', availableMinor: '2000' }),
      /These bids cost ETB 75, but your wallet has ETB 20\. Nothing was charged\./,
    ],
    ['the wallet is frozen', apiError(403, 'WALLET_FROZEN'), /Your wallet is frozen/],
    [
      'bidding has closed',
      apiError(409, 'AUCTION_CLOSED'),
      /Bidding on this auction has closed.*nothing was charged/,
    ],
    [
      'the amount is out of range',
      apiError(422, 'BID_AMOUNT_INVALID', { invalidAmountsMinor: ['400'] }),
      /This auction does not accept ETB 4\. Nothing was charged\./,
    ],
    [
      'the per-person limit is reached',
      apiError(422, 'BID_LIMIT_EXCEEDED', { maxBidsPerUser: 10, placed: 9, remaining: 1 }),
      /You can place 1 more bid in this auction/,
    ],
    ['the account is staff', apiError(403, 'FORBIDDEN'), /This account cannot place bids/],
    ['there were too many requests', apiError(429, 'RATE_LIMITED'), /Too many attempts/],
    ['the refusal is unknown', apiError(418, 'SOMETHING_NEW'), /could not be placed\. Nothing was charged/],
  ])('says what happened when %s', async (_name, reply, message) => {
    signedIn({ [PLACE]: reply });
    const { user } = renderApp(`/auctions/${ID}`);
    await add(user, '4');
    await user.click(screen.getByRole('button', { name: 'Review 1 bid' }));
    await user.click(screen.getByRole('button', { name: 'Pay ETB 75 and bid' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText(/server wording/)).not.toBeInTheDocument();
  });

  it('retries a request whose answer was lost with the same key, so it cannot be charged twice', async () => {
    const replies: (Reply | 'offline')[] = [
      'offline',
      apiError(503, 'SERVICE_BUSY'),
      [201, aSubmission(['400'])],
    ];
    const fake = signedIn({
      [PLACE]: (): Reply => {
        const reply = replies.shift();
        if (!reply || reply === 'offline') throw new TypeError('Failed to fetch');
        return reply;
      },
    });
    const { user } = renderApp(`/auctions/${ID}`);
    await add(user, '4');
    await user.click(screen.getByRole('button', { name: 'Review 1 bid' }));
    await user.click(screen.getByRole('button', { name: 'Pay ETB 75 and bid' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not confirm that your bids were placed. Try again: you will not be charged twice.',
    );
    // Still on the confirmation, with the same bid ready to be sent again.
    expect(screen.getByRole('heading', { name: 'Place 1 bid?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fake.callsTo(PLACE)).toHaveLength(2));
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/1 bid placed: ETB 4\./)).toBeInTheDocument();

    const keys = fake.callsTo(PLACE).map((c) => c.idempotencyKey);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);

    // A later bid of the same amount is a new request.
    await add(user, '4');
    await user.click(screen.getByRole('button', { name: 'Review 1 bid' }));
    await user.click(screen.getByRole('button', { name: 'Pay ETB 75 and bid' }));
    await waitFor(() => expect(fake.callsTo(PLACE)).toHaveLength(4));
    expect(fake.callsTo(PLACE)[3].idempotencyKey).not.toBe(keys[0]);
  });

  it('shows staff and people who used up their bids a notice, not the form', async () => {
    session.start(aUser({ roles: ['USER', 'SUPPORT'] }), tokens());
    fakeApi({
      [ME]: [200, aUser({ roles: ['USER', 'SUPPORT'] })],
      [WALLET]: [200, aWallet()],
      [DETAIL]: [200, anAuction()],
      [MINE]: [200, myBids([])],
    });
    const staff = renderApp(`/auctions/${ID}`);
    expect(await screen.findByText('Staff accounts cannot place bids.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Bid amount (ETB)')).not.toBeInTheDocument();
    staff.unmount();
    session.end(null);

    signedIn({
      [DETAIL]: [200, anAuction({ maxBidsPerUser: 2 })],
      [MINE]: [200, myBids([aMyBid('400'), aMyBid('300')])],
    });
    renderApp(`/auctions/${ID}`);
    expect(await screen.findByText(/You have placed all 2 bids allowed per person/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Bid amount (ETB)')).not.toBeInTheDocument();
    expect(screen.getByText('Your bids in this auction (2)')).toBeInTheDocument();
  });
});

describe('my result', () => {
  const ended = anAuction({ status: 'COMPLETED' });
  const publicResult = {
    auctionId: ID,
    outcome: 'WINNER_FOUND',
    currency: 'ETB',
    minorUnits: 2,
    winningAmountMinor: '400',
    winningAmount: '4.00',
    totalBids: 12,
    appliedNoUniquePolicy: null,
    bidFeesRefundedAt: null,
    computedAt: '2026-01-02T12:00:00.000Z',
  };
  const bid = (amountMinor: string, outcome: 'WINNING' | 'UNIQUE_NOT_LOWEST' | 'NOT_UNIQUE') => ({
    id: `77777777-7777-4777-8777-${amountMinor.padStart(12, '0')}`,
    amountMinor,
    amount: `${Number(amountMinor) / 100}.00`,
    outcome,
    createdAt: '2026-01-02T10:00:00.000Z',
  });

  it('tells the winner, and shows how each bid did', async () => {
    signedIn({
      [DETAIL]: [200, ended],
      [RESULT]: [200, publicResult],
      [MY_RESULT]: [
        200,
        myResult({
          won: true,
          bids: [bid('100', 'NOT_UNIQUE'), bid('400', 'WINNING'), bid('900', 'UNIQUE_NOT_LOWEST')],
        }),
      ],
    });
    renderApp(`/auctions/${ID}`);
    expect(await screen.findByRole('heading', { name: 'You won with ETB 4!' })).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(['ETB 1Also bid by others', 'ETB 4Won', 'ETB 9Unique, but not the lowest']);
    expect(screen.queryByLabelText('Bid amount (ETB)')).not.toBeInTheDocument();
  });

  it('tells a bidder who did not win, and one whose fees were refunded', async () => {
    signedIn({
      [DETAIL]: [200, ended],
      [RESULT]: [200, publicResult],
      [MY_RESULT]: [200, myResult({ bids: [bid('100', 'NOT_UNIQUE')] })],
    });
    const lost = renderApp(`/auctions/${ID}`);
    expect(await screen.findByText('None of your bids won this time.')).toBeInTheDocument();
    lost.unmount();

    signedIn({
      [DETAIL]: [200, ended],
      [RESULT]: [
        200,
        { ...publicResult, outcome: 'NO_UNIQUE_BID', winningAmountMinor: null, winningAmount: null },
      ],
      [MY_RESULT]: [
        200,
        myResult({
          outcome: 'NO_UNIQUE_BID',
          winningAmountMinor: null,
          winningAmount: null,
          appliedNoUniquePolicy: 'REFUND_BID_FEES',
          bidFeesRefundedAt: '2026-01-02T12:00:05.000Z',
          bids: [bid('100', 'NOT_UNIQUE')],
        }),
      ],
    });
    renderApp(`/auctions/${ID}`);
    expect(
      await screen.findByText('Nobody won. Your bid fees were returned to your wallet.'),
    ).toBeInTheDocument();
  });

  it('shows nothing extra to someone who did not bid, and waits while the result is not ready', async () => {
    signedIn({ [DETAIL]: [200, ended], [RESULT]: [200, publicResult], [MY_RESULT]: [200, myResult()] });
    const none = renderApp(`/auctions/${ID}`);
    expect(await screen.findByText(/Winning bid: the lowest amount bid exactly once/)).toBeInTheDocument();
    expect(screen.queryByText(/Your bids in this auction/)).not.toBeInTheDocument();
    none.unmount();

    signedIn({
      [DETAIL]: [200, ended],
      [RESULT]: apiError(409, 'RESULT_NOT_AVAILABLE'),
      [MY_RESULT]: apiError(409, 'RESULT_NOT_AVAILABLE'),
      [MINE]: [200, myBids([aMyBid('400', { auctionStatus: 'COMPLETED' })])],
    });
    renderApp(`/auctions/${ID}`);
    expect(await screen.findByText('Your bids in this auction (1)')).toBeInTheDocument();
    expect(screen.getByText('The result will appear here shortly.')).toBeInTheDocument();
  });
});

describe('my bids', () => {
  it('lists bids newest first under their auction, a page at a time', async () => {
    const other = { auctionId: '88888888-8888-4888-8888-888888888888', auctionTitle: 'Laptop auction' };
    const fake = signedIn({
      [MINE]: (call): Reply =>
        call.query.get('page') === '2'
          ? [200, { ...myBids([aMyBid('100', { ...other, auctionStatus: 'CANCELLED' })], 21), page: 2 }]
          : [
              200,
              myBids(
                [aMyBid('700'), aMyBid('400'), aMyBid('300', { ...other, auctionStatus: 'COMPLETED' })],
                21,
              ),
            ],
    });
    const { user, address } = renderApp('/bids');

    expect(await screen.findByText('21 bids in total, newest first.')).toBeInTheDocument();
    const phone = screen.getByRole('link', { name: 'Samsung Galaxy A55 auction' });
    expect(phone).toHaveAttribute('href', `/auctions/${ID}`);
    const groups = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(groups).toEqual(['Samsung Galaxy A55 auction', 'Laptop auction']);
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Ended')).toBeInTheDocument();
    expect(screen.getByText('ETB 7')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    expect(address()).toBe('/bids?page=2');
    expect(fake.callsTo(MINE).at(-1)?.query.get('limit')).toBe('20');
  });

  it('invites someone with no bids to the auctions, and is not open to visitors', async () => {
    signedIn();
    const mine = renderApp('/bids');
    expect(await screen.findByText('You have not placed any bids yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See running auctions' })).toHaveAttribute('href', '/');
    mine.unmount();
    session.end(null);

    fakeApi({});
    const visitor = renderApp('/bids');
    await waitFor(() => expect(visitor.address()).toBe('/sign-in'));
  });
});
