import { describe, expect, it, vi } from 'vitest';
import { api, unwrap } from '../api/client';
import { ApiError } from '../api/errors';
import { aUser, apiError, fakeApi, tokens } from '../test/fakeApi';
import { session } from './session';

const ME = 'GET /api/v1/auth/me';
const REFRESH = 'POST /api/v1/auth/refresh';
const getMe = () => unwrap(api.GET('/api/v1/auth/me'));

describe('session', () => {
  it('sends the access token and keeps the session in the browser', async () => {
    const fake = fakeApi({ [ME]: [200, aUser()] });
    session.start(aUser(), tokens('one'));

    await getMe();

    expect(fake.calls[0].authorization).toBe('Bearer access-one');
    expect(JSON.parse(localStorage.getItem('lub.session')!)).toMatchObject({ refreshToken: 'refresh-one' });
  });

  it('sends no token when nobody is signed in', async () => {
    const fake = fakeApi({ [ME]: apiError(401, 'UNAUTHORIZED') });
    await expect(getMe()).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].authorization).toBeNull();
  });

  it('renews an access token that is about to expire before using it', async () => {
    const fake = fakeApi({ [REFRESH]: [200, tokens('two')], [ME]: [200, aUser()] });
    session.start(aUser(), tokens('one', 10));

    await getMe();

    expect(fake.calls.map((c) => c.path)).toEqual(['/api/v1/auth/refresh', '/api/v1/auth/me']);
    expect(fake.calls[0].body).toEqual({ refreshToken: 'refresh-one' });
    expect(fake.calls[1].authorization).toBe('Bearer access-two');
    expect(session.get()).toMatchObject({ accessToken: 'access-two', refreshToken: 'refresh-two' });
  });

  it('renews once when several requests need it at the same time', async () => {
    const fake = fakeApi({ [REFRESH]: [200, tokens('two')], [ME]: [200, aUser()] });
    session.start(aUser(), tokens('one', 10));

    await Promise.all([getMe(), getMe(), getMe()]);

    expect(fake.callsTo(REFRESH)).toHaveLength(1);
    expect(fake.callsTo(ME).map((c) => c.authorization)).toEqual(Array(3).fill('Bearer access-two'));
  });

  it('renews and repeats a request whose token the server no longer accepts, with the same body', async () => {
    const fake = fakeApi({
      [REFRESH]: [200, tokens('two')],
      'POST /api/v1/auth/change-password': (call) =>
        call.authorization === 'Bearer access-two'
          ? [200, { user: aUser(), tokens: tokens('three') }]
          : apiError(401, 'UNAUTHORIZED'),
    });
    session.start(aUser(), tokens('one'));
    const body = { currentPassword: 'old-pass-1', newPassword: 'new-pass-2' };

    await unwrap(api.POST('/api/v1/auth/change-password', { body }));

    const attempts = fake.callsTo('POST /api/v1/auth/change-password');
    expect(attempts.map((c) => c.authorization)).toEqual(['Bearer access-one', 'Bearer access-two']);
    expect(attempts.map((c) => c.body)).toEqual([body, body]);
    expect(fake.callsTo(REFRESH)).toHaveLength(1);
  });

  it('repeats a refused request only once', async () => {
    const fake = fakeApi({ [REFRESH]: [200, tokens('two')], [ME]: apiError(401, 'UNAUTHORIZED') });
    session.start(aUser(), tokens('one'));

    await expect(getMe()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    expect(fake.callsTo(ME)).toHaveLength(2);
    expect(fake.callsTo(REFRESH)).toHaveLength(1);
  });

  it('does not treat another 401, such as a wrong current password, as a stale token', async () => {
    const fake = fakeApi({ 'POST /api/v1/auth/change-password': apiError(401, 'INVALID_CREDENTIALS') });
    session.start(aUser(), tokens('one'));

    await expect(
      unwrap(api.POST('/api/v1/auth/change-password', { body: { currentPassword: 'x', newPassword: 'y' } })),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    expect(fake.calls).toHaveLength(1);
    expect(session.get()).not.toBeNull();
  });

  it('ends the session when the refresh token is refused, and says why once', async () => {
    fakeApi({ [REFRESH]: apiError(401, 'INVALID_REFRESH_TOKEN'), [ME]: apiError(401, 'UNAUTHORIZED') });
    session.start(aUser(), tokens('one'));

    await expect(getMe()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    expect(session.get()).toBeNull();
    expect(localStorage.getItem('lub.session')).toBeNull();
    expect(session.takeSignOutReason()).toBe('expired');
    expect(session.takeSignOutReason()).toBeNull();
  });

  it.each([
    ['ACCOUNT_SUSPENDED', 'suspended'],
    ['ACCOUNT_BLOCKED', 'blocked'],
  ])('ends the session when the server answers %s', async (code, reason) => {
    fakeApi({ [ME]: apiError(403, code) });
    session.start(aUser(), tokens('one'));

    await expect(getMe()).rejects.toMatchObject({ code });

    expect(session.get()).toBeNull();
    expect(session.takeSignOutReason()).toBe(reason);
  });

  it.each([
    ['is busy', apiError(503, 'SERVICE_BUSY'), { status: 503, code: 'SERVICE_BUSY' }],
    ['limits requests', apiError(429, 'RATE_LIMITED'), { status: 429, code: 'RATE_LIMITED' }],
  ])('keeps the session when renewal fails because the server %s', async (_name, reply, expected) => {
    fakeApi({ [REFRESH]: reply });
    session.start(aUser(), tokens('one', 10));

    await expect(getMe()).rejects.toMatchObject(expected);

    expect(session.get()).toMatchObject({ refreshToken: 'refresh-one' });
  });

  it('keeps the session when the server cannot be reached, and can renew afterwards', async () => {
    fakeApi({});
    session.start(aUser(), tokens('one', 10));
    await expect(getMe()).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(session.get()).not.toBeNull();

    const fake = fakeApi({ [REFRESH]: [200, tokens('two')], [ME]: [200, aUser()] });
    await getMe();
    expect(fake.callsTo(ME)[0].authorization).toBe('Bearer access-two');
  });

  it('marks the user as having to change the password when the server says so', async () => {
    fakeApi({ [ME]: apiError(403, 'PASSWORD_CHANGE_REQUIRED') });
    session.start(aUser(), tokens('one'));
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);

    await expect(getMe()).rejects.toBeInstanceOf(ApiError);

    expect(session.get()?.user.mustChangePassword).toBe(true);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('uses the tokens another tab stored instead of spending the old refresh token again', async () => {
    const fake = fakeApi({ [REFRESH]: [200, tokens('never')], [ME]: [200, aUser()] });
    session.start(aUser(), tokens('one', 10));
    // Another tab renewed the session; this tab has not heard about it yet.
    const stored = JSON.parse(localStorage.getItem('lub.session')!) as Record<string, unknown>;
    localStorage.setItem(
      'lub.session',
      JSON.stringify({
        ...stored,
        accessToken: 'access-other',
        refreshToken: 'refresh-other',
        accessExpiresAt: Date.now() + 900_000,
      }),
    );

    await getMe();

    expect(fake.callsTo(REFRESH)).toHaveLength(0);
    expect(fake.callsTo(ME)[0].authorization).toBe('Bearer access-other');
  });
});
