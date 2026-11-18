import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { session } from './auth/session';
import { leaveTo } from './lib/leave';
import {
  aDeposit,
  apiError,
  aTransaction,
  aUser,
  aWallet,
  depositOptions,
  fakeApi,
  tokens,
} from './test/fakeApi';
import { renderApp } from './test/renderApp';

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

type Handlers = Parameters<typeof fakeApi>[0];

/** Signed in, with mobile wallets charged in the site and a 100% bonus up to ETB 10,000 for 7 days. */
function signedIn(overrides: Handlers = {}) {
  session.start(aUser(), tokens());
  vi.mocked(leaveTo).mockClear();
  return fakeApi({
    [ME]: [200, aUser()],
    [WALLET]: [200, aWallet({ availableMinor: '0', available: '0.00' })],
    [HISTORY]: [200, { items: [], nextCursor: null }],
    [OPTIONS]: [200, depositOptions()],
    [DEPOSITS]: [200, { items: [], total: 0, page: 1, limit: 10 }],
    [UNREAD]: [200, { unread: 0 }],
    ...overrides,
  });
}

describe('topping up the wallet', () => {
  it('shows the bonus a top-up earns, sends the request to the phone and says when the money is in', async () => {
    let reads = 0;
    const charged = aDeposit({
      amountMinor: '50000',
      checkoutUrl: null,
      chargeMethod: 'mpesa',
      bonusMinor: '50000',
      bonus: '500.00',
    });
    const fake = signedIn({
      [START]: [201, charged],
      [ONE]: () => (++reads < 2 ? [200, charged] : [200, { ...charged, status: 'SUCCEEDED' }]),
    });
    const { user } = renderApp('/wallet');

    await user.click(await screen.findByRole('button', { name: 'Top up wallet' }));
    const sheet = screen.getByRole('dialog', { name: 'Top up wallet' });
    expect(within(sheet).getByText('Get a 100% bonus on this top-up')).toBeInTheDocument();
    expect(
      within(sheet).getByText('Top up ETB 10,000 to get the full ETB 10,000 bonus.'),
    ).toBeInTheDocument();

    await user.type(within(sheet).getByLabelText('Amount'), '500');
    expect(within(sheet).getByText("You'll get ETB 500 bonus (100%)")).toBeInTheDocument();
    expect(within(sheet).getByText('Valid for 7 days')).toBeInTheDocument();

    await user.click(within(sheet).getByRole('radio', { name: /M-Pesa/ }));
    expect(within(sheet).getByLabelText('M-Pesa phone number')).toHaveValue('0911234567');
    await user.click(within(sheet).getByRole('button', { name: 'Top up ETB 500' }));

    expect(await within(sheet).findByText('Approve the payment on your phone')).toBeInTheDocument();
    expect(fake.callsTo(START)[0].body).toEqual({
      amountMinor: '50000',
      charge: { method: 'mpesa', phoneNumber: '0911234567' },
    });
    expect(await within(sheet).findByText('Money added', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(within(sheet).getByText('ETB 500 is in your wallet, plus a ETB 500 bonus.')).toBeInTheDocument();
    expect(leaveTo).not.toHaveBeenCalled();
  }, 10_000);

  it.each([
    [{ directCharge: true }, /could not be sent to 0911234567\. Check that it is your telebirr number/],
    [{ directCharge: true, unavailable: true }, /Paying with telebirr is not available right now/],
  ])('says why the request did not reach the phone (%o)', async (details, message) => {
    signedIn({ [START]: apiError(502, 'PAYMENT_PROVIDER_ERROR', details) });
    const { user } = renderApp('/wallet?topup=1');
    const sheet = await screen.findByRole('dialog', { name: 'Top up wallet' });
    await user.type(within(sheet).getByLabelText('Amount'), '100');
    await user.click(within(sheet).getByRole('radio', { name: /telebirr/ }));
    await user.click(within(sheet).getByRole('button', { name: 'Top up ETB 100' }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(message);
  });

  describe("through Chapa's inline service", () => {
    const INLINE = 'POST /v1/inline/charge';
    const NOT_SENT = `POST /api/v1/wallet/deposits/${DEPOSIT.id}/charge-not-sent`;
    const pending = aDeposit({
      amountMinor: '10000',
      amount: '100.00',
      checkoutUrl: null,
      chargeMethod: 'telebirr',
    });

    async function payWithTelebirr(user: ReturnType<typeof renderApp>['user']) {
      const sheet = await screen.findByRole('dialog', { name: 'Top up wallet' });
      await user.type(within(sheet).getByLabelText('Amount'), '100');
      await user.click(within(sheet).getByRole('radio', { name: /telebirr/ }));
      await user.click(within(sheet).getByRole('button', { name: 'Top up ETB 100' }));
      return sheet;
    }

    it('sends the phone request from the browser with the public key and the deposit reference', async () => {
      const fake = signedIn({
        [OPTIONS]: [200, depositOptions({ inlinePublicKey: 'CHAPUBK-test-public' })],
        [START]: [201, pending],
        [INLINE]: [
          200,
          { status: 'success', message: 'Charge initiated', data: { meta: { ref_id: 'CHx1' } } },
        ],
        [ONE]: [200, pending],
      });
      const { user } = renderApp('/wallet?topup=1');
      const sheet = await payWithTelebirr(user);

      expect(await within(sheet).findByText('Approve the payment on your phone')).toBeInTheDocument();
      const [call] = fake.callsTo(INLINE);
      expect(call.authorization).toBe('Bearer CHAPUBK-test-public');
      for (const field of ['tx_ref', 'amount', 'mobile', 'payment_method'])
        expect(call.body).toContain(`name="${field}"`);
      expect(call.body).toContain(pending.reference);
      expect(call.body).toContain('100.00');
      expect(fake.callsTo(NOT_SENT)).toHaveLength(0);
    });

    it('tells the server and the payer when Chapa will not send it', async () => {
      const fake = signedIn({
        [OPTIONS]: [200, depositOptions({ inlinePublicKey: 'CHAPUBK-test-public' })],
        [START]: [201, pending],
        [INLINE]: [400, { status: 'failed', message: 'You are not allowed for direct charges', data: null }],
        [NOT_SENT]: [200, { ...pending, status: 'FAILED', requestNotSent: true }],
      });
      const { user } = renderApp('/wallet?topup=1');
      const sheet = await payWithTelebirr(user);

      expect(await within(sheet).findByRole('alert')).toHaveTextContent(
        /Paying with telebirr is not available right now/,
      );
      expect(fake.callsTo(NOT_SENT)[0].body).toEqual({ reason: 'You are not allowed for direct charges' });
    });

    it('leaves the phone request to the server when there is no public key', async () => {
      const fake = signedIn({ [START]: [201, pending], [ONE]: [200, pending] });
      const { user } = renderApp('/wallet?topup=1');
      const sheet = await payWithTelebirr(user);
      expect(await within(sheet).findByText('Approve the payment on your phone')).toBeInTheDocument();
      expect(fake.callsTo(INLINE)).toHaveLength(0);
    });
  });

  it('opens straight away from a link elsewhere on the site', async () => {
    signedIn();
    renderApp('/wallet?topup=1');
    expect(await screen.findByRole('dialog', { name: 'Top up wallet' })).toBeInTheDocument();
  });

  it('says nothing about a bonus when there is none', async () => {
    signedIn({ [OPTIONS]: [200, depositOptions({ bonusPercent: 0 })] });
    const { user } = renderApp('/wallet');
    await user.click(await screen.findByRole('button', { name: 'Top up wallet' }));
    const sheet = screen.getByRole('dialog', { name: 'Top up wallet' });
    expect(within(sheet).queryByText(/bonus/i)).not.toBeInTheDocument();
  });
});

describe('the bonus in the wallet', () => {
  it('shows the bonus and when it expires, and marks bonus movements in the history', async () => {
    signedIn({
      [WALLET]: [200, aWallet({ bonusMinor: '42500', bonusExpiresAt: '2026-01-09T10:00:00.000Z' })],
      [HISTORY]: [
        200,
        {
          items: [
            aTransaction({ balance: 'BONUS', amountMinor: '7500', balanceAfterMinor: '42500' }),
            aTransaction({ type: 'BONUS', direction: 'CREDIT', balance: 'BONUS', amountMinor: '50000' }),
          ],
          nextCursor: null,
        },
      ],
    });
    renderApp('/wallet');

    const balance = await screen.findByRole('region', { name: 'Balance' });
    expect(balance).toHaveTextContent('Bonus ETB 425');
    expect(balance).toHaveTextContent('expires');
    // The header counts the bonus: ETB 1,000 + ETB 425.
    expect(screen.getByRole('link', { name: 'Balance: ETB 1,425' })).toBeInTheDocument();

    const rows = await screen.findAllByRole('listitem');
    const fee = rows.find((row) => row.textContent?.includes('Bid fees'));
    expect(fee).toHaveTextContent('Bonus');
    expect(fee).toHaveTextContent('Bonus ETB 425');
    expect(screen.getByText('Top-up bonus')).toBeInTheDocument();
  });
});
