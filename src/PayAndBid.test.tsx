import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { session } from './auth/session';
import { leaveTo } from './lib/leave';
import {
  aDeposit,
  aSubmission,
  aUser,
  aWallet,
  anAuction,
  apiError,
  depositOptions,
  fakeApi,
  myBids,
  tokens,
} from './test/fakeApi';
import { renderApp } from './test/renderApp';

vi.mock('./lib/leave', () => ({ leaveTo: vi.fn() }));

const AUCTION = anAuction({ product: { ...anAuction().product, description: 'A brand new phone, 256 GB.' } });
const ID = AUCTION.id;
const DEPOSIT = aDeposit();
const ME = 'GET /api/v1/auth/me';
const WALLET = 'GET /api/v1/wallet';
const OPTIONS = 'GET /api/v1/wallet/deposit-options';
const LIST = 'GET /api/v1/auctions';
const DETAIL = `GET /api/v1/auctions/${ID}`;
const MINE = 'GET /api/v1/bids/mine';
const PLACE = `POST /api/v1/auctions/${ID}/bids`;
const START = 'POST /api/v1/wallet/deposits';
const ONE = `GET /api/v1/wallet/deposits/${DEPOSIT.id}`;
const UNREAD = 'GET /api/v1/notifications/unread-count';

type Handlers = Parameters<typeof fakeApi>[0];

/** Signed in, on the auction list, with one running auction and payments through Chapa switched on. */
function signedIn(overrides: Handlers = {}) {
  session.start(aUser(), tokens());
  return fakeApi({
    [ME]: [200, aUser()],
    [WALLET]: [200, aWallet()],
    [OPTIONS]: [200, depositOptions()],
    [LIST]: [200, { items: [AUCTION], total: 1, page: 1, limit: 12 }],
    [DETAIL]: [200, AUCTION],
    [MINE]: [200, myBids([])],
    [UNREAD]: [200, { unread: 0 }],
    ...overrides,
  });
}

async function openSheet(user: ReturnType<typeof renderApp>['user']) {
  await user.click(await screen.findByRole('button', { name: 'Pay ETB 75 & bid' }));
  return screen.getByRole('dialog', { name: 'Samsung Galaxy A55 auction' });
}

describe('pay and bid', () => {
  it('sends a visitor to sign in first', async () => {
    fakeApi({ [LIST]: [200, { items: [AUCTION], total: 1, page: 1, limit: 12 }] });
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Pay ETB 75 & bid' })).toHaveAttribute('href', '/sign-in');
  });

  it('places the bid from the wallet when the balance covers it', async () => {
    const fake = signedIn({ [PLACE]: [201, aSubmission(['400'])] });
    const { user } = renderApp('/');
    const sheet = await openSheet(user);

    expect(within(sheet).getByText('A brand new phone, 256 GB.')).toBeInTheDocument();
    expect(within(sheet).getByRole('radio', { name: /Wallet/ })).toBeChecked();
    await user.type(within(sheet).getByLabelText('Your bid amount'), '4');
    await user.click(within(sheet).getByRole('button', { name: 'Pay ETB 75 & bid' }));

    expect(await within(sheet).findByText('Bid placed')).toBeInTheDocument();
    expect(fake.callsTo(PLACE)[0].body).toEqual({ amountsMinor: ['400'] });
    expect(fake.callsTo(START)).toHaveLength(0);
  });

  it('sends the payment request to the phone and waits on this page until the bids are placed', async () => {
    let reads = 0;
    const charged = aDeposit({ amountMinor: '15000', checkoutUrl: null, chargeMethod: 'telebirr' });
    const bid = { auctionId: ID, amountsMinor: ['400', '700'], amounts: ['4.00', '7.00'], error: null };
    const fake = signedIn({
      [WALLET]: [200, aWallet({ availableMinor: '1000', available: '10.00' })],
      [START]: [201, charged],
      // Pending at first, then the payer approves on the phone.
      [ONE]: () =>
        ++reads < 2
          ? [200, { ...charged, bid: { ...bid, state: 'WAITING', submissionId: null } }]
          : [200, { ...charged, status: 'SUCCEEDED', bid: { ...bid, state: 'PLACED', submissionId: 's' } }],
    });
    const { user } = renderApp('/');
    const sheet = await openSheet(user);

    expect(within(sheet).getByRole('radio', { name: /Wallet/ })).toBeDisabled();
    expect(within(sheet).getByRole('radio', { name: /telebirr/ })).toBeChecked();
    expect(within(sheet).getByRole('radio', { name: /M-Pesa/ })).toBeInTheDocument();
    // The account's own number, ready to change.
    const phone = within(sheet).getByLabelText('telebirr phone number');
    expect(phone).toHaveValue('0911234567');
    await user.clear(phone);
    await user.type(phone, '+251 922 334455');

    await user.click(within(sheet).getByRole('switch', { name: 'Bid on several amounts' }));
    for (const amount of ['4', '7']) {
      await user.type(within(sheet).getByLabelText('Add an amount'), amount);
      await user.click(within(sheet).getByRole('button', { name: 'Add' }));
    }
    await user.click(within(sheet).getByRole('button', { name: 'Pay ETB 150 & bid' }));

    expect(await within(sheet).findByText('Approve the payment on your phone')).toBeInTheDocument();
    expect(fake.callsTo(START)[0].body).toEqual({
      amountMinor: '15000',
      bid: { auctionId: ID, amountsMinor: ['400', '700'] },
      charge: { method: 'telebirr', phoneNumber: '0922334455' },
    });
    expect(await within(sheet).findByText('2 bids placed', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(
      within(sheet).getByText('You paid ETB 150 with telebirr and bid ETB 4, ETB 7. Good luck!'),
    ).toBeInTheDocument();
    expect(leaveTo).not.toHaveBeenCalled();
    expect(fake.callsTo(PLACE)).toHaveLength(0);
  }, 10_000);

  it('asks for a phone number that can be charged', async () => {
    const fake = signedIn({ [WALLET]: [200, aWallet({ availableMinor: '0', available: '0.00' })] });
    const { user } = renderApp('/');
    const sheet = await openSheet(user);
    await user.click(within(sheet).getByRole('radio', { name: /M-Pesa/ }));
    await user.type(within(sheet).getByLabelText('Your bid amount'), '4');
    await user.clear(within(sheet).getByLabelText('M-Pesa phone number'));
    await user.type(within(sheet).getByLabelText('M-Pesa phone number'), '0111');
    await user.click(within(sheet).getByRole('button', { name: 'Pay ETB 75 & bid' }));
    expect(within(sheet).getByText('Enter your M-Pesa number, such as 0911223344.')).toBeInTheDocument();
    expect(fake.callsTo(START)).toHaveLength(0);
  });

  it('says when the phone declined, and lets the payer try again', async () => {
    const charged = aDeposit({ amountMinor: '7500', checkoutUrl: null, chargeMethod: 'telebirr' });
    signedIn({
      [WALLET]: [200, aWallet({ availableMinor: '0', available: '0.00' })],
      [START]: [201, charged],
      [ONE]: [200, { ...charged, status: 'FAILED' }],
    });
    const { user } = renderApp('/');
    const sheet = await openSheet(user);
    await user.type(within(sheet).getByLabelText('Your bid amount'), '4');
    await user.click(within(sheet).getByRole('button', { name: 'Pay ETB 75 & bid' }));

    expect(await within(sheet).findByText('Payment not completed')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Try again' }));
    expect(within(sheet).getByRole('button', { name: 'Pay ETB 75 & bid' })).toBeInTheDocument();
  });

  it("falls back to Chapa's page only when no mobile wallet can be charged here", async () => {
    const fake = signedIn({
      [WALLET]: [200, aWallet({ availableMinor: '0', available: '0.00' })],
      [OPTIONS]: [200, depositOptions({ directChargeMethods: [] })],
      [START]: [201, DEPOSIT],
    });
    const { user } = renderApp('/');
    const sheet = await openSheet(user);
    expect(within(sheet).getByRole('radio', { name: /Chapa/ })).toBeChecked();
    await user.type(within(sheet).getByLabelText('Your bid amount'), '4');
    await user.click(within(sheet).getByRole('button', { name: 'Pay ETB 75 & bid' }));
    await vi.waitFor(() => expect(leaveTo).toHaveBeenCalledWith(DEPOSIT.checkoutUrl));
    expect(fake.callsTo(START)[0].body).toEqual({
      amountMinor: '7500',
      bid: { auctionId: ID, amountsMinor: ['400'] },
    });
  });

  it('checks the amount before paying, and explains a refusal without server wording', async () => {
    const fake = signedIn({ [PLACE]: apiError(409, 'DUPLICATE_BID', { amountsMinor: ['400'] }) });
    const { user } = renderApp('/');
    const sheet = await openSheet(user);

    await user.click(within(sheet).getByRole('button', { name: 'Pay ETB 75 & bid' }));
    expect(within(sheet).getByText('Enter your bid amount.')).toBeInTheDocument();
    await user.type(within(sheet).getByLabelText('Your bid amount'), '4.5');
    await user.click(within(sheet).getByRole('button', { name: 'Pay ETB 75 & bid' }));
    expect(within(sheet).getByText(/steps of ETB 1/)).toBeInTheDocument();
    expect(fake.callsTo(PLACE)).toHaveLength(0);

    await user.clear(within(sheet).getByLabelText('Your bid amount'));
    await user.type(within(sheet).getByLabelText('Your bid amount'), '4');
    await user.click(within(sheet).getByRole('button', { name: 'Pay ETB 75 & bid' }));
    const alert = await within(sheet).findByRole('alert');
    expect(alert).toHaveTextContent('You have already bid ETB 4');
    expect(alert).not.toHaveTextContent('server wording');
  });

  it('closes with Escape and gives the keyboard back to the button', async () => {
    signedIn();
    const { user } = renderApp('/');
    await openSheet(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay ETB 75 & bid' })).toHaveFocus();
  });

  it('is offered on the auction page too', async () => {
    signedIn();
    const { user } = renderApp(`/auctions/${ID}`);
    expect(await openSheet(user)).toBeInTheDocument();
  });
});

describe('coming back from Chapa after pay and bid', () => {
  const bid = { auctionId: ID, amountsMinor: ['400'], amounts: ['4.00'], submissionId: null, error: null };

  it('says the bid is placed once the payment is confirmed', async () => {
    signedIn({
      [ONE]: [
        200,
        aDeposit({
          status: 'SUCCEEDED',
          amountMinor: '7500',
          bid: { ...bid, state: 'PLACED', submissionId: 'x' },
        }),
      ],
    });
    renderApp(`/wallet/deposits/${DEPOSIT.id}`);

    expect(await screen.findByRole('heading', { name: 'Your bid is placed' })).toBeInTheDocument();
    expect(screen.getByText('You paid ETB 75 and bid ETB 4. Good luck!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the auction' })).toHaveAttribute(
      'href',
      `/auctions/${ID}`,
    );
  });

  it('says the money is in the wallet when the bids were refused after payment', async () => {
    signedIn({
      [ONE]: [
        200,
        aDeposit({
          status: 'SUCCEEDED',
          amountMinor: '7500',
          bid: { ...bid, state: 'REFUSED', error: 'Bidding on this auction has closed' },
        }),
      ],
    });
    renderApp(`/wallet/deposits/${DEPOSIT.id}`);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Payment received, but the bids were not placed');
    expect(alert).toHaveTextContent('Bidding on this auction has closed. Your ETB 75 is in your wallet');
  });

  it('names the bids while the payment is still waiting', async () => {
    signedIn({ [ONE]: [200, aDeposit({ amountMinor: '7500', bid: { ...bid, state: 'WAITING' } })] });
    renderApp(`/wallet/deposits/${DEPOSIT.id}`);
    expect(
      await screen.findByText('Your bid of ETB 4 will be placed as soon as the payment is confirmed.'),
    ).toBeInTheDocument();
  });
});
