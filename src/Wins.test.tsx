import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { session } from './auth/session';
import {
  aDelivery,
  aNotification,
  aPublicWinner,
  aUser,
  aWallet,
  aWin,
  apiError,
  fakeApi,
  myWins,
  notifications,
  tokens,
} from './test/fakeApi';
import { renderApp } from './test/renderApp';

const ME = 'GET /api/v1/auth/me';
const WALLET = 'GET /api/v1/wallet';
const UNREAD = 'GET /api/v1/notifications/unread-count';
const WINS = 'GET /api/v1/winners/mine';
const WINNERS = 'GET /api/v1/winners';
const INBOX = 'GET /api/v1/notifications';
const READ_ALL = 'POST /api/v1/notifications/read-all';
const WIN_ID = aWin().id;
const SAVE = `PUT /api/v1/winners/mine/${WIN_ID}/delivery-details`;

type Reply = [number, unknown?];
type Handlers = Parameters<typeof fakeApi>[0];

function signedIn(overrides: Handlers = {}) {
  session.start(aUser(), tokens());
  return fakeApi({
    [ME]: [200, aUser()],
    [WALLET]: [200, aWallet()],
    [UNREAD]: [200, { unread: 0 }],
    ...overrides,
  });
}

const SENT = aDelivery({
  recipientName: 'Abebe Kebede',
  recipientPhone: '+251911234567',
  address: { city: 'Addis Ababa' },
});

const steps = (card: HTMLElement) =>
  within(within(card).getByRole('list', { name: 'Progress' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('my wins', () => {
  it('asks a confirmed winner for delivery details, checks them, and shows what was saved', async () => {
    let saved = false;
    const fake = signedIn({
      [WINS]: (): Reply => [200, myWins([aWin(saved ? { delivery: SENT } : {})])],
      [SAVE]: (): Reply => {
        saved = true;
        return [200, aWin({ delivery: SENT })];
      },
    });
    const { user } = renderApp('/wins');

    const card = await screen.findByRole('article', { name: 'Samsung Galaxy A55' });
    expect(card).toHaveTextContent('Details needed');
    expect(card).toHaveTextContent('Won with ETB 4 in Samsung Galaxy A55 auction');
    expect(steps(card)).toEqual([
      '✓Won (done)',
      '✓Win confirmed (done)',
      '3Delivery details confirmed (next)',
      '4On its way',
      '5Delivered',
    ]);

    await user.click(within(card).getByRole('button', { name: 'Send delivery details' }));
    // The account's own name and number are offered as a start.
    expect(screen.getByLabelText("Recipient's full name")).toHaveValue(aUser().fullName ?? '');
    expect(screen.getByLabelText("Recipient's phone number")).toHaveValue(aUser().phoneNumber);

    await user.clear(screen.getByLabelText("Recipient's full name"));
    await user.click(screen.getByRole('button', { name: 'Save delivery details' }));
    expect(screen.getByLabelText("Recipient's full name")).toBeInvalid();
    expect(screen.getByLabelText('City or town')).toBeInvalid();
    expect(screen.getByText('Enter the city or town.')).toBeInTheDocument();
    expect(fake.callsTo(SAVE)).toHaveLength(0);

    await user.type(screen.getByLabelText("Recipient's full name"), 'Abebe Kebede');
    await user.clear(screen.getByLabelText("Recipient's phone number"));
    await user.type(screen.getByLabelText("Recipient's phone number"), '+251 911 234 567');
    await user.type(screen.getByLabelText('City or town'), 'Addis Ababa');
    // Only these three are asked: the rest of the address is arranged on the phone.
    expect(screen.queryByLabelText(/^Region/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Sub-city/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Woreda/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^House number/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Landmark/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save delivery details' }));

    expect(await screen.findByText('Your delivery details were saved.')).toBeInTheDocument();
    expect(fake.callsTo(SAVE)[0].body).toEqual({
      recipientName: 'Abebe Kebede',
      recipientPhone: '+251911234567',
      address: { city: 'Addis Ababa' },
    });
    expect(card).toHaveTextContent('Arranging delivery');
    expect(card).toHaveTextContent('Abebe Kebede');
    expect(card).toHaveTextContent('Addis Ababa');
    expect(screen.queryByRole('form', { name: 'Delivery details' })).not.toBeInTheDocument();

    // Changing them starts from what was saved.
    await user.click(within(card).getByRole('button', { name: 'Change delivery details' }));
    expect(screen.getByLabelText('City or town')).toHaveValue('Addis Ababa');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form', { name: 'Delivery details' })).not.toBeInTheDocument();
  });

  it('keeps the form open and explains when staff confirmed the details meanwhile', async () => {
    signedIn({
      [WINS]: [200, myWins([aWin({ delivery: SENT })])],
      [SAVE]: apiError(409, 'DELIVERY_INVALID_STATE'),
    });
    const { user } = renderApp('/wins');
    await user.click(await screen.findByRole('button', { name: 'Change delivery details' }));
    await user.click(screen.getByRole('button', { name: 'Save delivery details' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('can no longer be changed here');
    expect(screen.queryByText(/server wording/)).not.toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Delivery details' })).toBeInTheDocument();
  });

  it('shows each stage without a form once the details cannot be changed', async () => {
    const locked = (id: string, productName: string, overrides: Parameters<typeof aWin>[0]) =>
      aWin({ id, productName, canEditDeliveryDetails: false, ...overrides });
    signedIn({
      [WINS]: [
        200,
        myWins([
          locked('a', 'Waiting', { verificationStatus: 'PENDING_VERIFICATION', delivery: null }),
          locked('b', 'Refused', { verificationStatus: 'REJECTED', delivery: null }),
          locked('c', 'Sent', { delivery: { ...SENT, status: 'DISPATCHED', trackingInfo: 'EMS 1234' } }),
          locked('d', 'Arrived', { delivery: { ...SENT, status: 'DELIVERED' } }),
          locked('e', 'Held', { delivery: { ...SENT, status: 'DISPUTED' } }),
        ]),
      ],
    });
    renderApp('/wins');

    const waiting = await screen.findByRole('article', { name: 'Waiting' });
    expect(waiting).toHaveTextContent('Being checked');
    expect(steps(waiting)[1]).toBe('2Win confirmed (next)');

    const refused = screen.getByRole('article', { name: 'Refused' });
    expect(refused).toHaveTextContent('We could not confirm this win.');
    expect(within(refused).queryByRole('list', { name: 'Progress' })).not.toBeInTheDocument();

    const sent = screen.getByRole('article', { name: 'Sent' });
    expect(sent).toHaveTextContent('Tracking: EMS 1234');
    expect(steps(sent)[3]).toBe('✓On its way (done)');
    expect(steps(sent)[4]).toBe('5Delivered (next)');

    expect(screen.getByRole('article', { name: 'Arrived' })).toHaveTextContent('Your prize was delivered.');
    const held = screen.getByRole('article', { name: 'Held' });
    expect(held).toHaveTextContent('On hold');
    expect(within(held).queryByRole('list', { name: 'Progress' })).not.toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /delivery details/ })).not.toBeInTheDocument();
  });

  it('says so when there are no wins, and offers to retry when loading fails', async () => {
    let fail = true;
    signedIn({ [WINS]: (): Reply => (fail ? apiError(503, 'SERVICE_BUSY') : [200, myWins([])]) });
    const { user } = renderApp('/wins');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('You have not won an auction yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See running auctions' })).toHaveAttribute('href', '/');
  });

  it('is for signed-in users only', async () => {
    fakeApi({});
    const { address } = renderApp('/wins');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(address()).toBe('/sign-in');
  });
});

describe('recent winners', () => {
  it('lists published winners to a visitor, a page at a time', async () => {
    const fake = fakeApi({
      [WINNERS]: (call): Reply => [
        200,
        call.query.get('page') === '2'
          ? { items: [aPublicWinner({ productName: 'Older prize' })], total: 21, page: 2, limit: 20 }
          : { items: [aPublicWinner()], total: 21, page: 1, limit: 20 },
      ],
    });
    const { user, address } = renderApp('/winners');

    expect(await screen.findByRole('heading', { name: 'Samsung Galaxy A55' })).toBeInTheDocument();
    const row = screen.getAllByRole('listitem')[0];
    expect(row).toHaveTextContent('+2519****4567 won with ETB 4');
    expect(fake.calls.every((call) => call.authorization === null)).toBe(true);

    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(await screen.findByRole('heading', { name: 'Older prize' })).toBeInTheDocument();
    expect(address()).toBe('/winners?page=2');
  });

  it('opens the whole draw of a winner, and Back closes it', async () => {
    const winner = aPublicWinner({ amountMinor: '106', amount: '1.06' });
    const fake = fakeApi({
      [WINNERS]: [200, { items: [winner], total: 1, page: 1, limit: 20 }],
      [`${WINNERS}/${winner.id}`]: [
        200,
        {
          ...winner,
          bidFeeMinor: '2500',
          bidFee: '25.00',
          totalBids: 9,
          distinctAmounts: 4,
          uniqueAmounts: 2,
          histogram: [
            { amountMinor: '1', amount: '0.01', count: 5 },
            { amountMinor: '106', amount: '1.06', count: 1 },
            { amountMinor: '107', amount: '1.07', count: 2 },
            { amountMinor: '200', amount: '2.00', count: 1 },
          ],
        },
      ],
    });
    const { user, address } = renderApp('/winners');

    await user.click(await screen.findByRole('button', { name: 'See the draw for Samsung Galaxy A55' }));

    const sheet = await screen.findByRole('dialog', { name: 'Draw ended' });
    expect(address()).toBe(`/winners?winner=${winner.id}`);
    expect(sheet).toHaveTextContent('+2519****4567');
    expect(await within(sheet).findByText('ETB 25')).toBeInTheDocument();
    expect(sheet).toHaveTextContent('Winning amount: ETB 1.06');
    const rows = () =>
      within(sheet)
        .getAllByRole('listitem')
        .map((row) => row.textContent);
    expect(rows()).toEqual(['ETB 0.015 bids', 'ETB 1.06Winner1 bid', 'ETB 1.072 bids', 'ETB 2Unique1 bid']);

    await user.click(within(sheet).getByRole('button', { name: 'Most picked' }));
    expect(rows()[0]).toBe('ETB 0.015 bids');
    expect(rows()[1]).toBe('ETB 1.072 bids');
    expect(fake.calls.every((call) => call.authorization === null)).toBe(true);

    await user.click(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(address()).toBe('/winners');
  });

  it('says so when nobody has been announced yet', async () => {
    fakeApi({ [WINNERS]: [200, { items: [], total: 0, page: 1, limit: 20 }] });
    renderApp('/winners');
    expect(await screen.findByText('No winners have been announced yet.')).toBeInTheDocument();
  });
});

describe('notifications', () => {
  const bid = aNotification({ id: 'n-bid' });
  const won = aNotification({
    id: 'n-won',
    type: 'WINNER_ANNOUNCEMENT',
    title: 'Your win is confirmed',
    body: 'Please send your delivery details.',
  });
  const old = aNotification({
    id: 'n-old',
    title: 'Wallet credited',
    type: 'DEPOSIT_SUCCEEDED',
    data: {},
    read: true,
  });

  it('shows the unread count on the bell and marks one as read when it is opened', async () => {
    const read = new Set<string>();
    const inbox = () => [won, bid, old].map((n) => (read.has(n.id) ? { ...n, read: true } : n));
    const fake = signedIn({
      [UNREAD]: (): Reply => [200, { unread: 2 - read.size }],
      [INBOX]: (): Reply => [200, notifications(inbox())],
      'POST /api/v1/notifications/n-won/read': (): Reply => {
        read.add('n-won');
        return [200, { ...won, read: true }];
      },
      [WINS]: [200, myWins([aWin()])],
    });
    const { user, address } = renderApp('/');

    await user.click(await screen.findByRole('link', { name: 'Notifications: 2 unread' }));
    expect(await screen.findByText('2 unread.')).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem').map((row) => row.textContent);
    expect(rows[0]).toContain('Your win is confirmed (unread)');
    expect(rows[2]).toContain('Wallet credited');
    expect(rows[2]).not.toContain('(unread)');

    await user.click(screen.getByRole('link', { name: /Your win is confirmed/ }));
    expect(await screen.findByRole('heading', { name: 'My wins' })).toBeInTheDocument();
    expect(address()).toBe('/wins');
    expect(fake.callsTo('POST /api/v1/notifications/n-won/read')).toHaveLength(1);
    expect(await screen.findByRole('link', { name: 'Notifications: 1 unread' })).toBeInTheDocument();
  });

  it('marks everything as read', async () => {
    let allRead = false;
    const fake = signedIn({
      [UNREAD]: (): Reply => [200, { unread: allRead ? 0 : 2 }],
      [INBOX]: (): Reply => [
        200,
        notifications(allRead ? [won, bid, old].map((n) => ({ ...n, read: true })) : [won, bid, old]),
      ],
      [READ_ALL]: (): Reply => {
        allRead = true;
        return [200, { updated: 2 }];
      },
    });
    const { user } = renderApp('/notifications');

    await user.click(await screen.findByRole('button', { name: 'Mark all as read' }));
    expect(await screen.findByText('You have read everything.')).toBeInTheDocument();
    expect(fake.callsTo(READ_ALL)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
    expect(screen.queryByText(/\(unread\)/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Notifications' })).toBeInTheDocument());
  });

  it('can show only the unread ones', async () => {
    const fake = signedIn({
      [INBOX]: (call): Reply => [
        200,
        call.query.get('unreadOnly') === 'true' ? notifications([], 0) : notifications([old], 0),
      ],
    });
    const { user, address } = renderApp('/notifications');
    expect(await screen.findByText('Wallet credited')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Unread' }));
    expect(await screen.findByText('You have no unread notifications.')).toBeInTheDocument();
    expect(address()).toBe('/notifications?show=unread');
    expect(screen.getByRole('button', { name: 'Unread' })).toHaveAttribute('aria-pressed', 'true');
    expect(fake.callsTo(INBOX).map((call) => call.query.get('unreadOnly'))).toEqual([null, 'true']);
  });

  it('puts the mark back when the server refuses it', async () => {
    const plain = aNotification({
      id: 'n-plain',
      type: 'PASSWORD_RESET',
      title: 'Your password was reset',
      data: null,
    });
    const lost = aNotification({ id: 'n-lost', type: 'AUCTION_RESULT', title: 'Auction ended', data: {} });
    signedIn({
      [UNREAD]: [200, { unread: 2 }],
      [INBOX]: [200, notifications([plain, lost])],
      'POST /api/v1/notifications/n-lost/read': apiError(503, 'SERVICE_BUSY'),
    });
    const { user } = renderApp('/notifications');

    // No auction to open: the row is a button that only marks it as read.
    await user.click(await screen.findByRole('button', { name: /Auction ended/ }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Auction ended/ })).toHaveTextContent(
        'Auction ended (unread)',
      ),
    );
    expect(screen.getByRole('link', { name: /Your password was reset/ })).toHaveAttribute('href', '/account');
  });

  it('does not ask for the unread count while a new password must be chosen', async () => {
    const forced = aUser({ mustChangePassword: true });
    session.start(forced, tokens());
    const fake = fakeApi({ [ME]: [200, forced] });
    const { address } = renderApp('/notifications');
    expect(await screen.findByRole('heading', { name: /new password/i })).toBeInTheDocument();
    expect(address()).toBe('/change-password');
    expect(fake.callsTo(UNREAD)).toHaveLength(0);
    expect(fake.callsTo(INBOX)).toHaveLength(0);
  });
});
