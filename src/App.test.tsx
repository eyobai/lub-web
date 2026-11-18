import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { session } from './auth/session';
import { aPage, aUser, anAuction, apiError, fakeApi, tokens } from './test/fakeApi';
import { renderApp } from './test/renderApp';

const AUCTIONS = 'GET /api/v1/auctions';
const ME = 'GET /api/v1/auth/me';
const LOGIN = 'POST /api/v1/auth/login';
const REGISTER = 'POST /api/v1/auth/register';
const CHANGE = 'POST /api/v1/auth/change-password';
const LOGOUT = 'POST /api/v1/auth/logout';
const ID = '22222222-2222-4222-8222-222222222222';
const DETAIL = `GET /api/v1/auctions/${ID}`;

const empty = { [AUCTIONS]: [200, aPage([])] as [number, unknown] };

describe('registration', () => {
  it('creates the account, signs the user in and opens the site', async () => {
    const fake = fakeApi({
      ...empty,
      [REGISTER]: [
        201,
        {
          userId: aUser().id,
          phoneNumber: aUser().phoneNumber,
          verificationRequired: false,
          user: aUser(),
          tokens: tokens(),
        },
      ],
      [ME]: [200, aUser()],
    });
    const { user, address } = renderApp('/register');

    await user.type(screen.getByLabelText('Phone number'), '0911 234 567');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.type(screen.getByLabelText('Repeat password'), 'secret123');
    await user.type(screen.getByLabelText(/Full name/), ' Abebe Kebede ');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(address()).toBe('/'));
    expect(fake.callsTo(REGISTER)[0].body).toEqual({
      phoneNumber: '0911 234 567',
      password: 'secret123',
      fullName: 'Abebe Kebede',
    });
    expect(session.get()?.refreshToken).toBe('refresh-one');
    expect(screen.getByRole('link', { name: 'Account' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('checks the form before sending anything', async () => {
    const fake = fakeApi(empty);
    const { user } = renderApp('/register');

    await user.type(screen.getByLabelText('Phone number'), '12345');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.type(screen.getByLabelText('Repeat password'), 'different');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByLabelText('Phone number')).toHaveAccessibleDescription(
      /valid Ethiopian mobile number/,
    );
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/at least 8 characters/);
    expect(screen.getByLabelText('Repeat password')).toHaveAccessibleDescription(/do not match/);
    expect(screen.getByLabelText('Phone number')).toBeInvalid();
    expect(fake.calls).toHaveLength(0);
  });

  it('shows a number that is already registered on the phone field, in our own words', async () => {
    fakeApi({ ...empty, [REGISTER]: apiError(409, 'PHONE_ALREADY_REGISTERED') });
    const { user, address } = renderApp('/register');

    await user.type(screen.getByLabelText('Phone number'), '0911234567');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.type(screen.getByLabelText('Repeat password'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Phone number')).toHaveAccessibleDescription(/already has an account/),
    );
    expect(screen.queryByText(/server wording/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
    expect(address()).toBe('/register');
    expect(session.get()).toBeNull();
  });

  it('does not sign anyone in when the server asks for an SMS code', async () => {
    fakeApi({
      ...empty,
      [REGISTER]: [
        201,
        {
          userId: aUser().id,
          phoneNumber: aUser().phoneNumber,
          verificationRequired: true,
          verificationToken: 'v',
        },
      ],
    });
    const { user } = renderApp('/register');

    await user.type(screen.getByLabelText('Phone number'), '0911234567');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.type(screen.getByLabelText('Repeat password'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/phone verification/);
    expect(session.get()).toBeNull();
  });
});

describe('signing in', () => {
  it('signs in and returns to the page the user was sent from', async () => {
    const fake = fakeApi({
      ...empty,
      [LOGIN]: [200, { user: aUser(), tokens: tokens() }],
      [ME]: [200, aUser()],
    });
    const { user, address } = renderApp('/account');
    await waitFor(() => expect(address()).toBe('/sign-in'));

    await user.type(screen.getByLabelText('Phone number'), '0911234567');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(address()).toBe('/account'));
    expect(fake.callsTo(LOGIN)[0].body).toEqual({ phoneNumber: '0911234567', password: 'secret123' });
    expect(fake.callsTo(LOGIN)[0].authorization).toBeNull();
    expect(await screen.findByText('+251911234567')).toBeInTheDocument();
  });

  it.each([
    [apiError(401, 'INVALID_CREDENTIALS'), /phone number or password is incorrect/],
    [apiError(429, 'ACCOUNT_LOCKED', { retryAfterSeconds: 900 }), /Try again in 15 minutes/],
    [apiError(403, 'ACCOUNT_SUSPENDED'), /suspended/],
    [apiError(429, 'RATE_LIMITED'), /Too many attempts/],
    [apiError(503, 'SERVICE_BUSY'), /busy/],
    [apiError(500, 'INTERNAL_ERROR'), /Something went wrong/],
  ])('explains a refusal and lets the user try again', async (reply, message) => {
    fakeApi({ ...empty, [LOGIN]: reply });
    const { user } = renderApp('/sign-in');

    await user.type(screen.getByLabelText('Phone number'), '0911234567');
    await user.type(screen.getByLabelText('Password'), 'wrong-pass1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText(/server wording/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(session.get()).toBeNull();
  });

  it('says so when the server cannot be reached', async () => {
    fakeApi(empty);
    const { user } = renderApp('/sign-in');

    await user.type(screen.getByLabelText('Phone number'), '0911234567');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/);
  });
});

describe('a returning user', () => {
  it('is still signed in after reloading the page, and the stored details are refreshed', async () => {
    fakeApi({ ...empty, [ME]: [200, aUser({ fullName: 'Renamed By Support' })] });
    session.start(aUser(), tokens());

    renderApp('/account');

    expect(screen.getByText('Abebe Kebede')).toBeInTheDocument();
    expect(await screen.findByText('Renamed By Support')).toBeInTheDocument();
  });

  it('is asked to sign in again, with the reason, when the session was ended elsewhere', async () => {
    fakeApi({
      ...empty,
      [ME]: apiError(401, 'UNAUTHORIZED'),
      'POST /api/v1/auth/refresh': apiError(401, 'INVALID_REFRESH_TOKEN'),
    });
    session.start(aUser(), tokens());
    const { address } = renderApp('/account');

    await waitFor(() => expect(address()).toBe('/sign-in'));
    expect(await screen.findByRole('status')).toHaveTextContent(/signed out/);
    expect(screen.queryByText('+251911234567')).not.toBeInTheDocument();
  });

  it('signs out: the server is told, the device forgets the session', async () => {
    const fake = fakeApi({ ...empty, [ME]: [200, aUser()], [LOGOUT]: [204] });
    session.start(aUser(), tokens());
    const { user, address } = renderApp('/account');

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(address()).toBe('/sign-in'));
    expect(fake.callsTo(LOGOUT)[0].body).toEqual({ refreshToken: 'refresh-one' });
    expect(localStorage.getItem('lub.session')).toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('is signed out on this device even when the server cannot be told', async () => {
    fakeApi({ ...empty, [ME]: [200, aUser()] });
    session.start(aUser(), tokens());
    const { user, address } = renderApp('/account');

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(address()).toBe('/sign-in'));
    expect(session.get()).toBeNull();
  });
});

describe('forced password change', () => {
  const mustChange = aUser({ mustChangePassword: true });

  it.each(['/', `/auctions/${ID}`, '/account'])(
    'sends a user who must change the password there from %s',
    async (path) => {
      const fake = fakeApi({ [ME]: [200, mustChange] });
      session.start(mustChange, tokens());
      const { address } = renderApp(path);

      await waitFor(() => expect(address()).toBe('/change-password'));
      expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();
      expect(fake.callsTo(AUCTIONS)).toHaveLength(0);
    },
  );

  it('stores the new session and lets the user continue once a new password is chosen', async () => {
    const fake = fakeApi({
      ...empty,
      [ME]: [200, mustChange],
      [CHANGE]: [200, { user: aUser(), tokens: tokens('two') }],
    });
    session.start(mustChange, tokens());
    const { user, address } = renderApp('/account');
    await waitFor(() => expect(address()).toBe('/change-password'));

    await user.type(screen.getByLabelText('Temporary password'), 'Temp-pass-1234');
    await user.type(screen.getByLabelText('New password'), 'my-own-pass1');
    await user.type(screen.getByLabelText('Repeat new password'), 'my-own-pass1');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));

    await waitFor(() => expect(address()).toBe('/account'));
    expect(fake.callsTo(CHANGE)[0].body).toEqual({
      currentPassword: 'Temp-pass-1234',
      newPassword: 'my-own-pass1',
    });
    expect(session.get()).toMatchObject({ refreshToken: 'refresh-two', user: { mustChangePassword: false } });
  });

  it('keeps the user there when the temporary password is wrong', async () => {
    fakeApi({ [ME]: [200, mustChange], [CHANGE]: apiError(401, 'INVALID_CREDENTIALS') });
    session.start(mustChange, tokens());
    const { user, address } = renderApp('/change-password');

    await user.type(screen.getByLabelText('Temporary password'), 'not-it-1');
    await user.type(screen.getByLabelText('New password'), 'my-own-pass1');
    await user.type(screen.getByLabelText('Repeat new password'), 'my-own-pass1');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Temporary password')).toHaveAccessibleDescription(
        /temporary password is incorrect/,
      ),
    );
    expect(address()).toBe('/change-password');
    expect(session.get()?.user.mustChangePassword).toBe(true);
  });

  it('is applied when support resets the password while the user is browsing', async () => {
    fakeApi({ ...empty, [ME]: apiError(403, 'PASSWORD_CHANGE_REQUIRED') });
    session.start(aUser(), tokens());
    const { address } = renderApp('/account');

    await waitFor(() => expect(address()).toBe('/change-password'));
  });
});

describe('auction list', () => {
  it('shows running auctions first, with fee, bid count and time left', async () => {
    const fake = fakeApi({ [AUCTIONS]: [200, aPage([anAuction()])] });
    renderApp('/');

    const card = await screen.findByRole('article', { name: 'Samsung Galaxy A55 auction' });
    // A live auction's card is not a link itself: Pay & bid is its one action (for a visitor, it leads to sign in).
    expect(
      within(card)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Pay ETB 75 & bid']);
    expect(within(card).getByRole('link', { name: 'Pay ETB 75 & bid' })).toHaveAttribute('href', '/sign-in');
    expect(within(card).getByText('ETB 75')).toBeInTheDocument();
    expect(within(card).getByText('1,234')).toBeInTheDocument();
    expect(within(card).getByText('Worth ETB 65,000')).toBeInTheDocument();
    expect(within(card).getByText(/^0[12]:\d\d:\d\d$/)).toBeInTheDocument();
    expect(Object.fromEntries(fake.callsTo(AUCTIONS)[0].query)).toEqual({
      status: 'ACTIVE',
      sort: 'closesAt',
      order: 'asc',
      page: '1',
      limit: '12',
    });
    expect(fake.callsTo(AUCTIONS)[0].authorization).toBeNull();
  });

  it('switches to upcoming auctions and keeps the choice in the address; finished ones are on the winners page', async () => {
    const fake = fakeApi({
      [AUCTIONS]: (call) => [
        200,
        aPage(
          call.query.get('status') === 'SCHEDULED'
            ? [anAuction({ status: 'SCHEDULED', title: 'Coming soon' })]
            : [],
        ),
      ],
    });
    const { user, address } = renderApp('/');
    expect(await screen.findByText(/No auctions are running/)).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Live', 'Upcoming']);

    await user.click(screen.getByRole('tab', { name: 'Upcoming' }));

    expect(await screen.findByRole('article', { name: 'Coming soon' })).toBeInTheDocument();
    expect(address()).toBe('/?show=upcoming');
    expect(screen.getByRole('tab', { name: 'Upcoming' })).toHaveAttribute('aria-selected', 'true');
    expect(Object.fromEntries(fake.calls.at(-1)!.query)).toMatchObject({ status: 'SCHEDULED', order: 'asc' });
  });

  it('pages through a long list', async () => {
    const fake = fakeApi({ [AUCTIONS]: [200, aPage([anAuction()], 30)] });
    const { user, address } = renderApp('/?page=2');

    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
    expect(fake.callsTo(AUCTIONS)[0].query.get('page')).toBe('2');

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Page 3 of 3')).toBeInTheDocument();
    expect(address()).toBe('/?page=3');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('offers to try again when the list cannot be loaded', { timeout: 10_000 }, async () => {
    let fail = true;
    const fake = fakeApi({
      [AUCTIONS]: () => (fail ? apiError(503, 'SERVICE_BUSY') : [200, aPage([anAuction()])]),
    });
    const { user } = renderApp('/');

    // A busy server is asked twice more before the page gives up.
    expect(await screen.findByRole('alert', {}, { timeout: 6000 })).toHaveTextContent(/busy/);
    expect(fake.callsTo(AUCTIONS)).toHaveLength(3);
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('article', { name: 'Samsung Galaxy A55 auction' })).toBeInTheDocument();
  });

  it('gives an ended auction a way to its details instead of Pay & bid', async () => {
    fakeApi({ [AUCTIONS]: [200, aPage([anAuction({ status: 'COMPLETED' })])] });
    renderApp('/');
    const card = await screen.findByRole('article', { name: 'Samsung Galaxy A55 auction' });
    expect(within(card).getByRole('link', { name: 'See details' })).toHaveAttribute(
      'href',
      `/auctions/${ID}`,
    );
    expect(within(card).queryByRole('link', { name: /Pay/ })).not.toBeInTheDocument();
  });
});

describe('top-up bonus banner', () => {
  const OPTIONS = 'GET /api/v1/wallet/deposit-options';
  const options = (over: object = {}) => ({
    enabled: true,
    provider: 'chapa',
    testMode: false,
    currency: 'ETB',
    minorUnits: 2,
    minAmountMinor: '1000',
    maxAmountMinor: '5000000',
    directChargeMethods: [],
    bonusPercent: 100,
    bonusMaxMinor: '1000000',
    bonusValidDays: 7,
    ...over,
  });

  it('shows a visitor the bonus the server applies, and leads to registration', async () => {
    fakeApi({ [AUCTIONS]: [200, aPage([])], [OPTIONS]: [200, options()] });
    renderApp('/');
    const banner = await screen.findByRole('link', { name: /100% bonus on every top-up, up to ETB 10,000/ });
    expect(banner).toHaveAttribute('href', '/register');
    expect(banner).toHaveTextContent('Join now');
  });

  it('is not shown while the bonus is off', async () => {
    fakeApi({ [AUCTIONS]: [200, aPage([])], [OPTIONS]: [200, options({ bonusPercent: 0 })] });
    renderApp('/');
    expect(await screen.findByText(/No auctions are running/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /bonus on every top-up/ })).not.toBeInTheDocument();
  });
});

describe('auction detail', () => {
  it('shows the rules of a running auction and invites a visitor to sign in', async () => {
    fakeApi({ [DETAIL]: [200, anAuction({ maxBidsPerUser: 50 })] });
    renderApp(`/auctions/${ID}`);

    expect(await screen.findByRole('heading', { name: 'Samsung Galaxy A55 auction' })).toBeInTheDocument();
    const rules = screen.getByRole('heading', { name: 'Bidding rules' }).parentElement!;
    expect(within(rules).getByText('Fee per bid').nextSibling).toHaveTextContent('ETB 75');
    expect(within(rules).getByText('Lowest allowed bid').nextSibling).toHaveTextContent('ETB 1');
    expect(within(rules).getByText('Highest allowed bid').nextSibling).toHaveTextContent('ETB 1,000');
    expect(within(rules).getByText('Bids per person').nextSibling).toHaveTextContent('50');
    expect(within(rules).getByText(/every bid fee is refunded/)).toBeInTheDocument();
    expect(screen.getByText('Closes in')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in to bid' })).toHaveAttribute('href', '/sign-in');
    // Free-form specifications: plain values only.
    expect(screen.getByText('256 GB')).toBeInTheDocument();
    expect(screen.getByText('5G').nextSibling).toHaveTextContent('Yes');
    expect(screen.queryByText('nested')).not.toBeInTheDocument();
  });

  it('shows the winning amount of a finished auction', async () => {
    fakeApi({
      [DETAIL]: [200, anAuction({ status: 'COMPLETED' })],
      [`${DETAIL}/result`]: [
        200,
        {
          auctionId: ID,
          outcome: 'WINNER_FOUND',
          currency: 'ETB',
          minorUnits: 2,
          winningAmountMinor: '400',
          winningAmount: '4.00',
          totalBids: 12,
          appliedNoUniquePolicy: null,
          bidFeesRefundedAt: null,
          computedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    renderApp(`/auctions/${ID}`);

    expect(await screen.findByText('ETB 4')).toBeInTheDocument();
    expect(screen.getByText('Out of 12 bids.')).toBeInTheDocument();
    expect(screen.queryByText('Closes in')).not.toBeInTheDocument();
  });

  it('says that a finished auction had no unique bid and that fees were refunded', async () => {
    fakeApi({
      [DETAIL]: [200, anAuction({ status: 'COMPLETED' })],
      [`${DETAIL}/result`]: [
        200,
        {
          auctionId: ID,
          outcome: 'NO_UNIQUE_BID',
          currency: 'ETB',
          minorUnits: 2,
          winningAmountMinor: null,
          winningAmount: null,
          totalBids: 6,
          appliedNoUniquePolicy: 'REFUND_BID_FEES',
          bidFeesRefundedAt: '2026-01-01T00:00:05.000Z',
          computedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    renderApp(`/auctions/${ID}`);

    expect(await screen.findByText(/ended without a winner/)).toBeInTheDocument();
    expect(screen.getByText(/Every bid fee was refunded/)).toBeInTheDocument();
  });

  it('waits for a result that is not computed yet', async () => {
    fakeApi({
      [DETAIL]: [200, anAuction({ status: 'COMPLETED' })],
      [`${DETAIL}/result`]: apiError(409, 'RESULT_NOT_AVAILABLE'),
    });
    renderApp(`/auctions/${ID}`);

    expect(await screen.findByText(/result will appear here shortly/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([`/auctions/${ID}`, '/auctions/not-an-id'])('says that %s does not exist', async (path) => {
    const fake = fakeApi({ [DETAIL]: apiError(404, 'NOT_FOUND') });
    renderApp(path);

    expect(await screen.findByRole('heading', { name: 'Auction not found' })).toBeInTheDocument();
    if (path.endsWith('not-an-id')) expect(fake.calls).toHaveLength(0);
  });
});

describe('unknown address', () => {
  it('shows a not-found page', () => {
    fakeApi({});
    renderApp('/nowhere');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
