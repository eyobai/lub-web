import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, unwrap } from '../api/client';
import { errorMessage, isApiError } from '../api/errors';
import type { components } from '../api/schema';
import { useAuth } from '../auth/useAuth';
import { newIdempotencyKey } from '../bids/amounts';
import { bidKeys, isUnconfirmed } from '../bids/queries';
import { formatMinor, toMinor } from '../lib/money';
import { notificationKeys } from '../notifications/queries';
import { walletKeys } from './queries';
import { sendInlineCharge } from './inline';
import { t } from '../i18n/i18n';

export type DepositOptions = components['schemas']['DepositOptionsDto'];
export type Deposit = components['schemas']['DepositDto'];

/** Amounts offered as one-tap choices, in major units; only those inside the limits are shown. */
const QUICK_AMOUNTS = ['10', '100', '250', '500', '1000', '10000'];

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

/** When the server leaves the phone request to the browser (Chapa inline), sends it. */
async function sendFromBrowser(
  queryClient: ReturnType<typeof useQueryClient>,
  deposit: Deposit,
  charge: { method: string; phoneNumber: string } | undefined,
): Promise<void> {
  const publicKey = queryClient.getQueryData<DepositOptions>(depositKeys.options)?.inlinePublicKey;
  if (!publicKey || !charge || deposit.status !== 'PENDING' || deposit.chargeMethod !== charge.method) return;
  await sendInlineCharge(publicKey, deposit, charge);
}

/** Whether money can be added online, the limits and the bonus. Public: visitors see the bonus offer too. */
export function useDepositOptions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: depositKeys.options,
    queryFn: () => unwrap(api.GET('/api/v1/wallet/deposit-options')),
    enabled: !user?.mustChangePassword,
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
      if (q.state.data && !isWaiting(q.state.data) && !bidsPending(q.state.data)) return false;
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

  // Pay and bid: the bids appear, and the bid count changes, once they are placed.
  const bidState = query.data?.bid?.state;
  useEffect(() => {
    if (bidState !== 'PLACED' && bidState !== 'REFUSED') return;
    void queryClient.invalidateQueries({ queryKey: walletKeys.all(user?.id) });
    void queryClient.invalidateQueries({ queryKey: bidKeys.all(user?.id) });
    void queryClient.invalidateQueries({ queryKey: ['auctions'] });
  }, [bidState, queryClient, user?.id]);

  return query;
}

/** Pay and bid: paid, but the bids are not placed yet. The server places them on the next read. */
export const bidsPending = (deposit: Pick<Deposit, 'status' | 'bid'>): boolean =>
  deposit.status === 'SUCCEEDED' && deposit.bid?.state === 'WAITING';

/**
 * Pay and bid: opens a Chapa payment for exactly these bids. Once it is confirmed the money goes into the wallet
 * and the server places the bids from it. A retry of the same bids reuses the key, so only one payment opens.
 */
export function useStartBidPayment(auctionId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const attempt = useRef<{ key: string; request: string } | null>(null);

  return useMutation({
    mutationFn: async ({
      amountMinor,
      amountsMinor,
      charge,
    }: {
      amountMinor: string;
      amountsMinor: string[];
      /** Pay on the phone without leaving the site; without it Chapa's checkout page is used. */
      charge?: { method: string; phoneNumber: string };
    }) => {
      const request = `${amountMinor}|${amountsMinor.join(',')}|${charge?.method ?? ''}|${charge?.phoneNumber ?? ''}`;
      if (attempt.current?.request !== request) attempt.current = { key: newIdempotencyKey(), request };
      try {
        const deposit = await unwrap(
          api.POST('/api/v1/wallet/deposits', {
            params: { header: { 'Idempotency-Key': attempt.current.key } },
            body: { amountMinor, bid: { auctionId, amountsMinor }, charge },
          }),
        );
        attempt.current = null;
        await sendFromBrowser(queryClient, deposit, charge);
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

/**
 * Opens a payment. A request whose answer never arrived is sent again with the same key when the user retries
 * the same amount, so the server returns the first deposit and does not open a second payment.
 */
export function useStartDeposit() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const attempt = useRef<{ key: string; request: string } | null>(null);

  return useMutation({
    mutationFn: async ({
      amountMinor,
      charge,
    }: {
      amountMinor: string;
      /** Pay on the phone without leaving the site; without it Chapa's checkout page is used. */
      charge?: { method: string; phoneNumber: string };
    }): Promise<Deposit> => {
      const request = `${amountMinor}|${charge?.method ?? ''}|${charge?.phoneNumber ?? ''}`;
      if (attempt.current?.request !== request) attempt.current = { key: newIdempotencyKey(), request };
      try {
        const deposit = await unwrap(
          api.POST('/api/v1/wallet/deposits', {
            params: { header: { 'Idempotency-Key': attempt.current.key } },
            body: { amountMinor, charge },
          }),
        );
        attempt.current = null;
        await sendFromBrowser(queryClient, deposit, charge);
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
  if (input.trim() === '') return { ok: false, message: t('Enter how much you want to add.') };
  const minor = toMinor(input.replace(/,/g, ''), options.minorUnits);
  if (minor === null) {
    return { ok: false, message: t('Enter an amount in numbers, for example 500 or 250.50.') };
  }
  if (minor < BigInt(options.minAmountMinor)) {
    return {
      ok: false,
      message: t('The smallest amount you can add is {amount}.', { amount: show(options.minAmountMinor) }),
    };
  }
  if (minor > BigInt(options.maxAmountMinor)) {
    return {
      ok: false,
      message: t('The largest amount you can add at once is {amount}.', {
        amount: show(options.maxAmountMinor),
      }),
    };
  }
  return { ok: true, minor };
}

/** The one-tap amounts that fit inside the limits. */
export function quickAmounts(options: DepositOptions): string[] {
  return QUICK_AMOUNTS.filter((amount) => parseDepositAmount(amount, options).ok);
}

/** The payment page may only be an https address: the server's answer is not followed anywhere else. */
export function checkoutAddress(deposit: Pick<Deposit, 'checkoutUrl'>): string | null {
  if (!deposit.checkoutUrl) return null;
  try {
    return new URL(deposit.checkoutUrl).protocol === 'https:' ? deposit.checkoutUrl : null;
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
      return t('You can add between {min} and {max} at a time.', {
        min: show(options.minAmountMinor),
        max: show(options.maxAmountMinor),
      });
    case 'DEPOSIT_LIMIT_REACHED':
      return t(
        'You have several payments that are not finished yet. Finish one of them, or wait for them to expire, then try again.',
      );
    case 'WALLET_FROZEN':
      return t('Your wallet is frozen, so money cannot be added online. Please contact support.');
    case 'FORBIDDEN':
      return t('This account cannot add money.');
    case 'PAYMENTS_UNAVAILABLE':
      return t('Paying in online is not available right now. Please try again later.');
    case 'PAYMENT_PROVIDER_ERROR':
      return t('Chapa could not open the payment. No money was taken. Please try again in a moment.');
    case 'RATE_LIMITED':
    case 'PASSWORD_CHANGE_REQUIRED':
    case 'NETWORK_ERROR':
    case 'SERVICE_BUSY':
      return errorMessage(error);
    default:
      return t('The payment could not be started. No money was taken. Please try again.');
  }
}

/** How each mobile wallet is named to people. Chapa's own key is shown for one not listed here. */
// Brand names: the same in every language.
const WALLET_NAMES: Record<string, string> = {
  telebirr: 'telebirr',
  mpesa: 'M-Pesa',
  cbebirr: 'CBE Birr',
  ebirr: 'e-Birr',
  enat_bank: 'Enat Bank',
};

export const walletName = (method: string): string => WALLET_NAMES[method] ?? method;

/** A wallet number as typed (0911…, 911…, +251911…), in the 09/07 form; null if it is not a mobile number. */
export function walletPhone(input: string): string | null {
  const match = /^(?:\+?251|0)?([79]\d{8})$/.exec(input.replace(/[\s-]/g, ''));
  return match ? `0${match[1]}` : null;
}

/** The top-up bonus a wallet top-up of `amountMinor` earns under the terms the server gave. */
export function bonusFor(
  amountMinor: bigint,
  options: Pick<DepositOptions, 'bonusPercent' | 'bonusMaxMinor'>,
): bigint {
  const bonus = (amountMinor * BigInt(options.bonusPercent)) / 100n;
  const max = BigInt(options.bonusMaxMinor);
  return bonus < max ? bonus : max;
}
