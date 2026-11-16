import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, unwrap } from '../api/client';
import { errorMessage, isApiError } from '../api/errors';
import type { components } from '../api/schema';
import { useAuth } from '../auth/useAuth';
import { newIdempotencyKey } from '../bids/amounts';
import { isUnconfirmed } from '../bids/queries';
import { formatMinor, toMinor } from '../lib/money';
import { notificationKeys } from '../notifications/queries';
import { walletKeys } from './queries';

export type DepositOptions = components['schemas']['DepositOptionsDto'];
export type Deposit = components['schemas']['DepositDto'];

/** Amounts offered as one-tap choices, in major units; only those inside the limits are shown. */
const QUICK_AMOUNTS = ['100', '200', '500', '1000'];

/** How often the result page asks whether the payment has been confirmed. */
export const DEPOSIT_POLL_MS = 3_000;
const SLOW_POLL_MS = 15_000;
/** After this long without a confirmation the page asks less often. */
const FAST_POLL_FOR_MS = 120_000;

export const depositKeys = {
  options: ['deposit-options'] as const,
  all: (userId: string | undefined) => ['deposits', userId] as const,
  list: (userId: string | undefined) => ['deposits', userId, 'list'] as const,
  one: (userId: string | undefined, id: string) => ['deposits', userId, 'one', id] as const,
};

/** A deposit the provider has not confirmed or refused yet. */
export const isWaiting = (deposit: Pick<Deposit, 'status'>): boolean =>
  deposit.status === 'PENDING' || deposit.status === 'INITIATED';

/** Whether money can be added online, and the limits. */
export function useDepositOptions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: depositKeys.options,
    queryFn: () => unwrap(api.GET('/api/v1/wallet/deposit-options')),
    enabled: !!user && !user.mustChangePassword,
    staleTime: 5 * 60_000,
  });
}

/** My latest deposits, newest first. */
export function useMyDeposits(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: depositKeys.list(user?.id),
    queryFn: () => unwrap(api.GET('/api/v1/wallet/deposits', { params: { query: { limit: 10 } } })),
    enabled: enabled && !!user,
  });
}

/**
 * One deposit. While it is waiting the server is asked again every few seconds: each read makes the server
 * check with the payment provider, which is what credits the wallet.
 */
export function useDeposit(id: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [since] = useState(() => Date.now());
  const query = useQuery({
    queryKey: depositKeys.one(user?.id, id),
    queryFn: () => unwrap(api.GET('/api/v1/wallet/deposits/{id}', { params: { path: { id } } })),
    enabled: !!user,
    // The interval below asks again anyway, so a failed read is not retried on top of it.
    retry: false,
    refetchInterval: (q) => {
      if (q.state.data && !isWaiting(q.state.data)) return false;
      if (isApiError(q.state.error, 'NOT_FOUND', 'VALIDATION_FAILED')) return false;
      return Date.now() - since < FAST_POLL_FOR_MS ? DEPOSIT_POLL_MS : SLOW_POLL_MS;
    },
  });

  // The balance and the history change the moment the deposit is confirmed.
  const status = query.data?.status;
  useEffect(() => {
    if (status === undefined || status === 'PENDING' || status === 'INITIATED') return;
    void queryClient.invalidateQueries({ queryKey: walletKeys.all(user?.id) });
    void queryClient.invalidateQueries({ queryKey: depositKeys.list(user?.id) });
    void queryClient.invalidateQueries({ queryKey: notificationKeys.all(user?.id) });
  }, [status, queryClient, user?.id]);

  return query;
}

/**
 * Opens a payment. A request whose answer never arrived is sent again with the same key when the user retries
 * the same amount, so the server returns the first deposit and does not open a second payment.
 */
export function useStartDeposit() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const attempt = useRef<{ key: string; amountMinor: string } | null>(null);

  return useMutation({
    mutationFn: async (amountMinor: string): Promise<Deposit> => {
      if (attempt.current?.amountMinor !== amountMinor) {
        attempt.current = { key: newIdempotencyKey(), amountMinor };
      }
      try {
        const deposit = await unwrap(
          api.POST('/api/v1/wallet/deposits', {
            params: { header: { 'Idempotency-Key': attempt.current.key } },
            body: { amountMinor },
          }),
        );
        attempt.current = null;
        return deposit;
      } catch (error) {
        if (!isUnconfirmed(error)) attempt.current = null;
        throw error;
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: depositKeys.all(user?.id) });
    },
  });
}

export type DepositAmount = { ok: true; minor: bigint } | { ok: false; message: string };

/** Checks what a person typed against the limits the server gave. The server checks again. */
export function parseDepositAmount(input: string, options: DepositOptions): DepositAmount {
  const show = (minor: string) => formatMinor(minor, options.currency, options.minorUnits);
  if (input.trim() === '') return { ok: false, message: 'Enter how much you want to add.' };
  const minor = toMinor(input.replace(/,/g, ''), options.minorUnits);
  if (minor === null) {
    return { ok: false, message: 'Enter an amount in numbers, for example 500 or 250.50.' };
  }
  if (minor < BigInt(options.minAmountMinor)) {
    return { ok: false, message: `The smallest amount you can add is ${show(options.minAmountMinor)}.` };
  }
  if (minor > BigInt(options.maxAmountMinor)) {
    return {
      ok: false,
      message: `The largest amount you can add at once is ${show(options.maxAmountMinor)}.`,
    };
  }
  return { ok: true, minor };
}

/** The one-tap amounts that fit inside the limits. */
export function quickAmounts(options: DepositOptions): string[] {
  return QUICK_AMOUNTS.filter((amount) => parseDepositAmount(amount, options).ok);
}

const THIS_MACHINE = ['localhost', '127.0.0.1', '[::1]'];

/**
 * The payment page may only be an https address: the server's answer is not followed anywhere else. The one
 * exception is the backend's local Chapa simulator, a plain-http page on this machine, and only while the
 * site itself is open on this machine.
 */
export function checkoutAddress(
  deposit: Pick<Deposit, 'checkoutUrl'>,
  siteHost: string = window.location.hostname,
): string | null {
  if (!deposit.checkoutUrl) return null;
  try {
    const url = new URL(deposit.checkoutUrl);
    if (url.protocol === 'https:') return deposit.checkoutUrl;
    const local = url.protocol === 'http:' && THIS_MACHINE.includes(url.hostname);
    return local && THIS_MACHINE.includes(siteHost) ? deposit.checkoutUrl : null;
  } catch {
    return null;
  }
}

/** What to tell someone whose deposit could not be started. No money has moved at that point. */
export function depositErrorMessage(error: unknown, options: DepositOptions): string {
  if (!isApiError(error)) return errorMessage(error);
  const show = (minor: string) => formatMinor(minor, options.currency, options.minorUnits);
  switch (error.code) {
    case 'DEPOSIT_AMOUNT_INVALID':
      return `You can add between ${show(options.minAmountMinor)} and ${show(options.maxAmountMinor)} at a time.`;
    case 'DEPOSIT_LIMIT_REACHED':
      return 'You have several payments that are not finished yet. Finish one of them, or wait for them to expire, then try again.';
    case 'WALLET_FROZEN':
      return 'Your wallet is frozen, so money cannot be added online. Please contact support.';
    case 'FORBIDDEN':
      return 'This account cannot add money.';
    case 'PAYMENTS_UNAVAILABLE':
      return 'Paying in online is not available right now. Please try again later.';
    case 'PAYMENT_PROVIDER_ERROR':
      return 'Chapa could not open the payment. No money was taken. Please try again in a moment.';
    case 'RATE_LIMITED':
    case 'PASSWORD_CHANGE_REQUIRED':
    case 'NETWORK_ERROR':
    case 'SERVICE_BUSY':
      return errorMessage(error);
    default:
      return 'The payment could not be started. No money was taken. Please try again.';
  }
}
