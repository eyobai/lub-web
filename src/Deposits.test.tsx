import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { session } from './auth/session';
import { leaveTo } from './lib/leave';
import { aDeposit, aUser, aWallet, apiError, depositOptions, fakeApi, tokens } from './test/fakeApi';
import { renderApp } from './test/renderApp';
import {
  checkoutAddress,
  DEPOSIT_POLL_MS,
  depositErrorMessage,
  parseDepositAmount,
  quickAmounts,
} from './wallet/deposits';

vi.mock('./lib/leave', () => ({ leaveTo: vi.fn() }));

const DEPOSIT = aDeposit();
const ME = 'GET /api/v1/auth/me';
const WALLET = 'GET /api/v1/wallet';
const HISTORY = 'GET /api/v1/wallet/transactions';
const OPTIONS = 'GET /api/v1/wallet/deposit-options';
const DEPOSITS = 'GET /api/v1/wallet/deposits';
const START = 'POST /api/v1/wallet/deposits';
const ONE = `GET /api/v1/wallet/deposits/${DEPOSIT.id}`;
const UNREAD = 'GET /api/v1/notifications/unread-count';

type Reply = [number, unknown?];
type Handlers = Parameters<typeof fakeApi>[0];
const page = (items: unknown[]) => ({ items, total: items.length, page: 1, limit: 10 });

/**
 * A signed-in user with ETB 1,000, on a site where money can be added through Chapa's checkout page (no mobile
 * wallet charged in the site), so these tests follow the hand-over to Chapa.
 */
function signedIn(overrides: Handlers = {}) {
  session.start(aUser(), tokens());
  vi.mocked(leaveTo).mockClear();
  return fakeApi({
    [ME]: [200, aUser()],
    [WALLET]: [200, aWallet()],
    [HISTORY]: [200, { items: [], nextCursor: null }],
    [OPTIONS]: [200, depositOptions({ directChargeMethods: [] })],
    [DEPOSITS]: [200, page([])],
    [UNREAD]: [200, { unread: 0 }],
    ...overrides,
  });
}

/** Opens the top-up sheet if it is not open yet. */
async function openTopUp(user: ReturnType<typeof renderApp>['user']) {
  if (!screen.queryByRole('dialog'))
    await user.click(await screen.findByRole('button', { name: 'Top up wallet' }));
  return screen.getByRole('dialog', { name: 'Top up wallet' });
}

async function pay(user: ReturnType<typeof renderApp>['user'], amount: string) {
  await openTopUp(user);
  const field = await screen.findByLabelText('Amount');
  await user.clear(field);
  if (amount) await user.type(field, amount);
  await user.click(screen.getByRole('button', { name: 'Continue to payment' }));
}

describe('deposit amounts', () => {
  const options = depositOptions();

  it.each([
    ['500', 50000n],
    ['250.50', 25050n],
    [' 10 ', 1000n],
    ['50,000', 5000000n],
    ['0010', 1000n],
  ])('reads %j as %s santim', (input, minor) => {
    expect(parseDepositAmount(input, options)).toEqual({ ok: true, minor });
  });

  it.each([
    ['', 'Enter how much you want to add.'],
    ['abc', 'Enter an amount in numbers, for example 500 or 250.50.'],
    ['-5', 'Enter an amount in numbers, for example 500 or 250.50.'],
    ['1e3', 'Enter an amount in numbers, for example 500 or 250.50.'],
    ['12.345', 'Enter an amount in numbers, for example 500 or 250.50.'],
    ['9.99', 'The smallest amount you can add is ETB 10.'],
    ['0', 'The smallest amount you can add is ETB 10.'],
    ['50000.01', 'The largest amount you can add at once is ETB 50,000.'],
  ])('refuses %j', (input, message) => {
    expect(parseDepositAmount(input, options)).toEqual({ ok: false, message });
  });

  it('offers only the common amounts that are inside the limits', () => {
    expect(quickAmounts(options)).toEqual(['10', '100', '250', '500', '1000', '10000']);
    expect(quickAmounts(depositOptions({ minAmountMinor: '15000', maxAmountMinor: '50000' }))).toEqual([
      '250',
      '500',
    ]);
  });

  it('follows the payment address only when it is https', () => {
    expect(checkoutAddress({ checkoutUrl: 'https://checkout.chapa.co/x' })).toBe(
      'https://checkout.chapa.co/x',
    );
    for (const checkoutUrl of [
      null,
      '',
      'http://checkout.chapa.co/x',
      'javascript:alert(1)',
      'not an address',
    ]) {
      expect(checkoutAddress({ checkoutUrl })).toBeNull();
    }
  });

  it('never shows server wording for a refusal', () => {
    for (const code of [
      'DEPOSIT_AMOUNT_INVALID',
      'DEPOSIT_LIMIT_REACHED',
      'PAYMENT_PROVIDER_ERROR',
      'SOMETHING_NEW',
    ]) {
      const [status, body] = apiError(422, code);
      const error = Object.assign(new Error(), { status, ...(body as object) });
      expect(depositErrorMessage(error, options)).not.toContain('server wording');
    }
  });
});

describe('adding money on the wallet page', () => {
  it('opens a payment for the amount typed and hands over to the payment page', async () => {
    const fake = signedIn({ [START]: [201, DEPOSIT] });
    const { user } = renderApp('/wallet');

    await pay(user, '500');

    await waitFor(() => expect(leaveTo).toHaveBeenCalledWith(DEPOSIT.checkoutUrl));
    const [call] = fake.callsTo(START);
    expect(call.body).toEqual({ amountMinor: '50000' });
    expect(call.idempotencyKey).toMatch(/^[\w-]{16,}$/);
    expect(screen.getByRole('button', { name: 'Opening Chapa…' })).toBeDisabled();
    expect(screen.queryByText(/Test mode/)).not.toBeInTheDocument();
  });

  it('fills the amount from a one-tap choice, and says when the site is in test mode', async () => {
    const fake = signedIn({
      [OPTIONS]: [200, depositOptions({ testMode: true, directChargeMethods: [] })],
      [START]: [201, DEPOSIT],
    });
    const { user } = renderApp('/wallet');

    await openTopUp(user);
    await user.click(await screen.findByRole('button', { name: /^ETB 1,000\s*\+ETB 1,000$/ }));
    expect(screen.getByLabelText('Amount')).toHaveValue('1000');
    expect(screen.getByText(/Test mode: payments here are practice only/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue to payment' }));

    await waitFor(() => expect(fake.callsTo(START)).toHaveLength(1));
    expect(fake.callsTo(START)[0].body).toEqual({ amountMinor: '100000' });
  });

  it.each([
    ['', 'Enter how much you want to add.'],
    ['5', 'The smallest amount you can add is ETB 10.'],
    ['60000', 'The largest amount you can add at once is ETB 50,000.'],
    ['ten', 'Enter an amount in numbers, for example 500 or 250.50.'],
  ])('does not ask the server for %j', async (amount, message) => {
    const fake = signedIn();
    const { user } = renderApp('/wallet');

    await pay(user, amount);

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toBeInvalid();
    expect(fake.callsTo(START)).toHaveLength(0);
    expect(leaveTo).not.toHaveBeenCalled();
  });

  it.each([
    ['DEPOSIT_AMOUNT_INVALID', 422, 'You can add between ETB 10 and ETB 50,000 at a time.'],
    ['DEPOSIT_LIMIT_REACHED', 429, /You have several payments that are not finished yet/],
    ['PAYMENT_PROVIDER_ERROR', 502, /Chapa could not open the payment\. No money was taken/],
    ['PAYMENTS_UNAVAILABLE', 503, /Paying in online is not available right now/],
    ['WALLET_FROZEN', 403, /Your wallet is frozen, so money cannot be added online/],
    ['FORBIDDEN', 403, 'This account cannot add money.'],
  ])('explains a refusal with %s and stays on the page', async (code, status, message) => {
    signedIn({ [START]: apiError(status, code) });
    const { user, address } = renderApp('/wallet');

    await pay(user, '500');

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(leaveTo).not.toHaveBeenCalled();
    expect(address()).toBe('/wallet?topup=1');
    expect(screen.getByRole('button', { name: 'Continue to payment' })).toBeEnabled();
  });

  it('sends the same key again when the answer was lost, and a new key for a new amount', async () => {
    let reachable = false;
    const fake = signedIn({
      [START]: (): Reply => (reachable ? [201, DEPOSIT] : apiError(503, 'SERVICE_BUSY')),
    });
    const { user } = renderApp('/wallet');

    await pay(user, '500');
    expect(await screen.findByRole('alert')).toHaveTextContent('The service is busy right now');
    await user.click(screen.getByRole('button', { name: 'Continue to payment' }));
    await waitFor(() => expect(fake.callsTo(START)).toHaveLength(2));
    await pay(user, '600');
    await waitFor(() => expect(fake.callsTo(START)).toHaveLength(3));
    reachable = true;
    await user.click(screen.getByRole('button', { name: 'Continue to payment' }));
    await waitFor(() => expect(leaveTo).toHaveBeenCalledTimes(1));

    const keys = fake.callsTo(START).map((c) => c.idempotencyKey);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys[3]).toBe(keys[2]);
  });

  it('does not follow a payment address that is not https', async () => {
    signedIn({ [START]: [201, aDeposit({ checkoutUrl: 'http://evil.example/pay' })] });
    const { user } = renderApp('/wallet');

    await pay(user, '500');

    expect(
      await screen.findByText(/The payment page could not be opened\. No money was taken/),
    ).toBeInTheDocument();
    expect(leaveTo).not.toHaveBeenCalled();
  });

  it('lists payments that were started and not finished, with a way back to each', async () => {
    signedIn({
      [DEPOSITS]: [
        200,
        page([
          aDeposit(),
          aDeposit({ id: '77777777-7777-4777-8777-000000000002', status: 'SUCCEEDED', amountMinor: '20000' }),
          aDeposit({ id: '77777777-7777-4777-8777-000000000003', status: 'EXPIRED', amountMinor: '30000' }),
        ]),
      ],
    });
    renderApp('/wallet');

    const heading = await screen.findByRole('heading', { name: 'Payments not finished' });
    const rows = within(heading.parentElement as HTMLElement).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('ETB 500');
    expect(within(rows[0]).getByRole('link', { name: 'View payment' })).toHaveAttribute(
      'href',
      `/wallet/deposits/${DEPOSIT.id}`,
    );
  });

  it('says to contact support when paying in online is switched off', async () => {
    signedIn({ [OPTIONS]: [200, depositOptions({ enabled: false, provider: null })] });
    renderApp('/wallet');

    expect(await screen.findByText(/Paying in online is not available yet/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Add money' })).not.toBeInTheDocument();
  });

  it('does not offer to add money to a frozen wallet', async () => {
    signedIn({ [WALLET]: [200, aWallet({ isFrozen: true })] });
    renderApp('/wallet');

    expect(
      await screen.findByText(/Your wallet is frozen\. You cannot bid or add money online/),
    ).toBeInTheDocument();
    await screen.findByText('Nothing has gone in or out of your wallet yet.');
    expect(screen.queryByRole('heading', { name: 'Add money' })).not.toBeInTheDocument();
  });
});

describe('the page Chapa sends the user back to', () => {
  const PATH = `/wallet/deposits/${DEPOSIT.id}`;

  it('waits for the server to confirm the payment, whatever the address says, then shows the money arrived', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let paid = false;
    const fake = signedIn({
      [ONE]: (): Reply => [200, paid ? aDeposit({ status: 'SUCCEEDED', checkoutUrl: null }) : DEPOSIT],
      [WALLET]: (): Reply => [
        200,
        paid ? aWallet({ availableMinor: '150000', available: '1500.00' }) : aWallet(),
      ],
    });
    renderApp(`${PATH}?status=success&trx_ref=${DEPOSIT.reference}`);

    expect(await screen.findByRole('heading', { name: 'Waiting for your payment' })).toBeInTheDocument();
    expect(screen.queryByText(/was added to your wallet/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open the payment page/ })).toHaveAttribute(
      'href',
      DEPOSIT.checkoutUrl,
    );
    expect(document.title).toBe('Payment · LeyuBid');

    await vi.advanceTimersByTimeAsync(DEPOSIT_POLL_MS);
    await waitFor(() => expect(fake.callsTo(ONE).length).toBeGreaterThanOrEqual(2));
    expect(screen.getByRole('heading', { name: 'Waiting for your payment' })).toBeInTheDocument();

    paid = true;
    await vi.advanceTimersByTimeAsync(DEPOSIT_POLL_MS);

    expect(await screen.findByRole('heading', { name: 'Payment received' })).toBeInTheDocument();
    expect(screen.getByText('ETB 500 was added to your wallet.')).toBeInTheDocument();
    expect(screen.getByText(DEPOSIT.reference)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Balance: ETB 1,500' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to wallet' })).toHaveAttribute('href', '/wallet');

    const asked = fake.callsTo(ONE).length;
    await vi.advanceTimersByTimeAsync(DEPOSIT_POLL_MS * 3);
    expect(fake.callsTo(ONE)).toHaveLength(asked);
  });

  it.each([
    ['FAILED', 'Payment not completed', /did not go through, so no money was added/],
    ['CANCELLED', 'Payment cancelled', /was cancelled, so no money was added/],
    ['EXPIRED', 'Payment expired', /was not finished in time, so no money was added/],
  ] as const)('says no money was added when the payment is %s', async (status, title, text) => {
    signedIn({ [ONE]: [200, aDeposit({ status, checkoutUrl: null, failureReason: 'server wording' })] });
    renderApp(PATH);

    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(text);
    expect(screen.queryByText(/server wording/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/wallet');
    expect(screen.getByText(/give them the reference below/)).toBeInTheDocument();
  });

  it("says so when the payment is not this user's or does not exist", async () => {
    const fake = signedIn({ [ONE]: apiError(404, 'NOT_FOUND') });
    renderApp(PATH);

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not find this payment.');
    expect(screen.getByRole('link', { name: 'Back to wallet' })).toHaveAttribute('href', '/wallet');
    expect(fake.callsTo(ONE)).toHaveLength(1);
  });

  it('offers to try again when the server cannot be reached', async () => {
    let healthy = false;
    signedIn({ [ONE]: (): Reply => (healthy ? [200, DEPOSIT] : apiError(503, 'SERVICE_BUSY')) });
    const { user } = renderApp(PATH);

    expect(await screen.findByRole('alert')).toHaveTextContent('The service is busy right now');
    healthy = true;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Waiting for your payment' })).toBeInTheDocument();
  });

  it('asks a visitor to sign in first', async () => {
    fakeApi({});
    const { address } = renderApp(PATH);
    await waitFor(() => expect(address()).toBe('/sign-in'));
  });
});
