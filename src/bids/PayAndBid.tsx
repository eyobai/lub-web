import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { isApiError } from '../api/errors';
import { Countdown } from '../auctions/Countdown';
import type { Auction } from '../auctions/queries';
import { StatusBadge } from '../auctions/StatusBadge';
import { useAuth } from '../auth/useAuth';
import { Alert, Spinner } from '../components/ui';
import { cx } from '../lib/cx';
import { leaveTo } from '../lib/leave';
import { formatMinor } from '../lib/money';
import {
  checkoutAddress,
  useDepositOptions,
  useStartBidPayment,
  walletName,
  walletPhone,
} from '../wallet/deposits';
import { ApproveOnPhone, Icon, WalletTile } from '../wallet/MobileWallets';
import { useWallet } from '../wallet/queries';
import { parseBidAmount, sortAmounts, type AmountProblem } from './amounts';
import { bidErrorMessage, refusedAmounts } from './errors';
import { usePlaceBids, type BidSubmission } from './queries';
import { t, tCount } from '../i18n/i18n';

/** 'wallet', 'checkout' (Chapa's own page, only when no mobile wallet can be charged here), or a mobile wallet. */
type Method = string;

const TICKET =
  'M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 0 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1zm10-4v2m0 4v2m0 4v2';

/**
 * "Pay ETB 75 & bid": a button that opens the payment sheet. A visitor is sent to sign in first.
 * Only shown while the auction takes bids.
 */
export function PayAndBidButton({ auction: a, gold = false }: { auction: Auction; gold?: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const fee = formatMinor(a.bidFeeMinor, a.currency, a.minorUnits);
  if (a.status !== 'ACTIVE') return null;
  const look = cx(
    'flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 font-bold tracking-wide text-ink uppercase transition',
    'bg-gradient-to-b from-brand-400 to-brand-500 hover:from-brand-200 hover:to-brand-400 active:scale-[0.99]',
    // On a dark panel the button needs no shadow; on a white card it lifts off the page.
    gold ? 'shadow-none' : 'shadow-[0_6px_16px_-4px_rgb(212_165_42/0.6)] ring-1 ring-brand-600/30',
  );
  const label = (
    <>
      <Icon d={TICKET} />
      {t('Pay {fee} & bid', { fee })}
    </>
  );
  if (!user) {
    return (
      <Link to="/sign-in" state={{ from: `/auctions/${a.id}` }} className={look}>
        {label}
      </Link>
    );
  }
  return (
    <>
      <button type="button" className={look} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {label}
      </button>
      {open && <PayAndBidSheet auction={a} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The sheet itself: choose the amounts, choose how to pay, pay. */
export function PayAndBidSheet({ auction: a, onClose }: { auction: Auction; onClose: () => void }) {
  const titleId = useId();
  const amountId = useId();
  const { user } = useAuth();
  const wallet = useWallet();
  const options = useDepositOptions();
  const placeBids = usePlaceBids(a.id);
  const startPayment = useStartBidPayment(a.id);

  const [several, setSeveral] = useState(false);
  const [entry, setEntry] = useState('');
  const [list, setList] = useState<bigint[]>([]);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Method | null>(null);
  const [placed, setPlaced] = useState<BidSubmission | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [moreText, setMoreText] = useState(false);
  const [phone, setPhone] = useState(() => walletPhone(user?.phoneNumber ?? '') ?? '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  /** A payment sent to the phone, which the sheet now waits on. */
  const [charged, setCharged] = useState<{ id: string; method: string; phone: string } | null>(null);

  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  // The page behind does not scroll, Escape closes, and the keyboard is placed in the sheet and given back after.
  useEffect(() => {
    opener.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [onClose]);

  const money = (minor: bigint | string) => formatMinor(minor, a.currency, a.minorUnits);
  const problemText = (problem: AmountProblem): string => {
    switch (problem) {
      case 'below':
        return t('The lowest allowed bid is {amount}.', { amount: money(a.minBidMinor) });
      case 'above':
        return t('The highest allowed bid is {amount}.', { amount: money(a.maxBidMinor) });
      case 'step':
        return t('Bids go up in steps of {step}, starting at {min}.', {
          step: money(a.bidStepMinor),
          min: money(a.minBidMinor),
        });
      default:
        return t('Enter an amount such as 4 or 4.50.');
    }
  };

  /** The amounts this payment is for: the list in "several" mode, otherwise the one typed. */
  const amounts = several
    ? list
    : (() => {
        const parsed = parseBidAmount(entry.trim(), a);
        return parsed.ok ? [parsed.minor] : [];
      })();
  const count = Math.max(amounts.length, 1);
  const total = BigInt(a.bidFeeMinor) * BigInt(count);

  const balance =
    wallet.data && wallet.data.currency === a.currency ? BigInt(wallet.data.spendableMinor) : null;
  const bonusLeft = wallet.data && wallet.data.currency === a.currency ? BigInt(wallet.data.bonusMinor) : 0n;
  const walletUsable = balance !== null && !wallet.data?.isFrozen && balance >= total;
  const chapaUsable = options.data?.enabled === true && options.data.currency === a.currency;
  const mobileWallets = chapaUsable ? (options.data?.directChargeMethods ?? []) : [];
  const usable: Method[] = [
    ...(walletUsable ? ['wallet'] : []),
    ...mobileWallets,
    ...(chapaUsable && mobileWallets.length === 0 ? ['checkout'] : []),
  ];
  const method: Method | null = chosen && usable.includes(chosen) ? chosen : (usable[0] ?? null);
  const onPhone = method !== null && mobileWallets.includes(method);

  const error = placeBids.error ?? startPayment.error;
  const refused = new Set(refusedAmounts(error));
  const busy = placeBids.isPending || startPayment.isPending || leaving;

  const reset = () => {
    placeBids.reset();
    startPayment.reset();
    setPlaced(null);
  };

  function addToList(event: FormEvent) {
    event.preventDefault();
    const parsed = parseBidAmount(entry.trim(), a);
    if (!parsed.ok) return setEntryError(problemText(parsed.problem));
    if (list.includes(parsed.minor))
      return setEntryError(t('{amount} is already in your list.', { amount: money(parsed.minor) }));
    if (list.length >= a.maxBidsPerRequest) {
      return setEntryError(
        t('You can place at most {count} bids at a time.', { count: a.maxBidsPerRequest }),
      );
    }
    setEntryError(null);
    setEntry('');
    setList(sortAmounts([...list, parsed.minor]));
    reset();
  }

  function submitOne(event: FormEvent) {
    event.preventDefault();
    pay();
  }

  function pay() {
    let toBid = amounts;
    if (!several) {
      const parsed = parseBidAmount(entry.trim(), a);
      if (!parsed.ok) {
        setEntryError(entry.trim() === '' ? t('Enter your bid amount.') : problemText(parsed.problem));
        document.getElementById(amountId)?.focus();
        return;
      }
      toBid = [parsed.minor];
    } else if (list.length === 0) {
      setEntryError(t('Add at least one amount.'));
      document.getElementById(amountId)?.focus();
      return;
    }
    if (!method) return;
    const mobile = onPhone ? walletPhone(phone) : null;
    if (onPhone && !mobile) {
      setPhoneError(t('Enter your {wallet} number, such as 0911223344.', { wallet: walletName(method) }));
      return;
    }
    const amountsMinor = toBid.map(String);
    if (method === 'wallet') {
      placeBids.mutate(amountsMinor, {
        onSuccess: (submission) => {
          setPlaced(submission);
          setEntry('');
          setList([]);
        },
      });
      return;
    }
    startPayment.mutate(
      {
        amountMinor: total.toString(),
        amountsMinor,
        charge: onPhone && mobile ? { method, phoneNumber: mobile } : undefined,
      },
      {
        onSuccess: (deposit) => {
          if (deposit.chargeMethod && mobile) {
            setCharged({ id: deposit.id, method: deposit.chargeMethod, phone: mobile });
            return;
          }
          const address = checkoutAddress(deposit);
          if (!address) return;
          setLeaving(true);
          leaveTo(address);
        },
      },
    );
  }

  const staff = user?.roles.some((role) => role !== 'USER');
  const about = a.product.description || a.description;

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-4xl bg-[#fdfcfa] outline-none sm:rounded-4xl"
      >
        <div className="flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-5 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <StatusBadge status={a.status} />
            <button
              type="button"
              onClick={onClose}
              aria-label={t('Close')}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200/80 text-slate-700 hover:bg-slate-300/80"
            >
              <Icon d="M6 6l12 12M18 6 6 18" />
            </button>
          </div>

          <h2 id={titleId} className="text-center text-2xl leading-tight font-bold tracking-tight">
            {a.title}
          </h2>

          {about && (
            <div className="rounded-3xl bg-slate-200/70 px-5 py-4 text-sm text-slate-700">
              <p className={cx('whitespace-pre-line', !moreText && 'line-clamp-3')}>{about}</p>
              <button
                type="button"
                onClick={() => setMoreText(!moreText)}
                aria-expanded={moreText}
                className="mt-1 font-semibold text-brand-700"
              >
                {moreText ? t('Show less') : t('Show more')}
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-3xl bg-slate-200/70 px-5 py-3">
            <div>
              <p className="text-xs text-slate-500">{t('Bid fee')}</p>
              <p className="text-xl font-bold text-brand-700 tabular-nums">{money(a.bidFeeMinor)}</p>
            </div>
            <p className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold tabular-nums">
              <Icon d={TICKET} className="h-4 w-4 text-brand-600" />
              {tCount(a.totalBidCount, '{count} bid', '{count} bids')}
            </p>
            <p className="flex items-center gap-1.5 font-bold">
              <Icon d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
              <span className="sr-only">{t('Closes in')}</span>
              <Countdown until={a.closesAt} />
            </p>
          </div>

          {staff ? (
            <Alert tone="info">{t('Staff accounts cannot place bids.')}</Alert>
          ) : charged ? (
            <ApproveOnPhone
              {...charged}
              money={money}
              onRetry={() => {
                setCharged(null);
                reset();
              }}
            />
          ) : placed ? (
            <div role="status" className="space-y-3 rounded-3xl bg-emerald-50 px-5 py-4 text-emerald-900">
              <p className="text-lg font-bold">
                {tCount(placed.bidCount, 'Bid placed', '{count} bids placed')}
              </p>
              <p className="text-sm">
                {t('{amounts}. {fee} was taken from your wallet. Good luck!', {
                  amounts: placed.bids.map((bid) => money(bid.amountMinor)).join(', '),
                  fee: money(placed.totalFeeMinor),
                })}
              </p>
              <button
                type="button"
                onClick={reset}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900"
              >
                {t('Bid again')}
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                role="switch"
                aria-checked={several}
                onClick={() => {
                  setSeveral(!several);
                  setEntryError(null);
                  setList([]);
                  reset();
                }}
                className="flex w-full items-center gap-3 rounded-3xl border border-slate-200 bg-slate-100 px-5 py-4 text-left font-semibold"
              >
                <Icon d="m12 3 9 5-9 5-9-5zm-9 9 9 5 9-5m-18 4 9 5 9-5" className="h-5 w-5 text-slate-600" />
                <span className="flex-1">{t('Bid on several amounts')}</span>
                <span
                  aria-hidden="true"
                  className={cx(
                    'relative h-7 w-12 rounded-full transition-colors',
                    several ? 'bg-brand-500' : 'bg-slate-300',
                  )}
                >
                  <span
                    className={cx(
                      'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all',
                      several ? 'left-6' : 'left-1',
                    )}
                  />
                </span>
              </button>

              <form onSubmit={several ? addToList : submitOne} noValidate>
                <label htmlFor={amountId} className="block font-semibold text-slate-800">
                  {several ? t('Add an amount') : t('Your bid amount')}
                </label>
                <p id={`${amountId}-hint`} className="text-sm text-slate-500">
                  {t('Enter an amount between {min} and {max}.', {
                    min: money(a.minBidMinor).replace(`${a.currency} `, ''),
                    max: money(a.maxBidMinor).replace(`${a.currency} `, ''),
                  })}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <div
                    className={cx(
                      'flex min-w-0 flex-1 items-center gap-2 rounded-full border-2 bg-white px-5 shadow-sm focus-within:border-ink',
                      entryError ? 'border-red-500' : 'border-slate-200',
                    )}
                  >
                    <span className="font-semibold text-slate-500">{a.currency}</span>
                    <input
                      id={amountId}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder={t('Enter your bid amount…')}
                      value={entry}
                      aria-invalid={entryError ? true : undefined}
                      aria-describedby={`${amountId}-hint${entryError ? ` ${amountId}-error` : ''}`}
                      onChange={(event) => {
                        setEntry(event.target.value);
                        setEntryError(null);
                        reset();
                      }}
                      className="min-w-0 flex-1 bg-transparent py-3.5 text-lg outline-none placeholder:text-slate-400"
                    />
                  </div>
                  {several && (
                    <button
                      type="submit"
                      className="rounded-full bg-ink px-5 py-4 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      {t('Add')}
                    </button>
                  )}
                </div>
                {entryError && (
                  <p id={`${amountId}-error`} className="mt-1 text-sm text-red-700">
                    {entryError}
                  </p>
                )}
              </form>

              {several && list.length > 0 && (
                <ul aria-label={t('Amounts to bid')} className="flex flex-wrap gap-2">
                  {list.map((amount) => (
                    <li
                      key={amount.toString()}
                      className={cx(
                        'flex items-center gap-1 rounded-full border py-1 pr-1 pl-3 text-sm font-semibold tabular-nums',
                        refused.has(amount.toString())
                          ? 'border-red-300 bg-red-50 text-red-800'
                          : 'border-brand-200 bg-brand-50 text-brand-800',
                      )}
                    >
                      {money(amount)}
                      <button
                        type="button"
                        aria-label={t('Remove {amount}', { amount: money(amount) })}
                        onClick={() => {
                          setList(list.filter((other) => other !== amount));
                          reset();
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/10"
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <p className="flex items-start gap-2 text-sm text-slate-600">
                <Icon
                  d="M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2zm13 7h.01"
                  className="mt-0.5 h-5 w-5"
                />
                <span>
                  {bonusLeft > 0n
                    ? t('Available: {balance} (incl. {bonus} bonus)', {
                        balance: balance !== null ? money(balance) : '…',
                        bonus: money(bonusLeft),
                      })
                    : t('Available: {balance}', { balance: balance !== null ? money(balance) : '…' })}{' '}
                  · {t('Top up once and bid from your wallet in one tap.')}{' '}
                  <Link to="/wallet?topup=1" className="font-semibold text-brand-700 underline">
                    {t('Top up')}
                  </Link>
                </span>
              </p>

              <fieldset className="space-y-2">
                <legend className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Icon d="M3 7h18v10H3zm0 4h18" className="h-4 w-4 text-brand-600" />
                  {t('Select payment method')}
                </legend>
                <MethodOption
                  name={`${titleId}-method`}
                  checked={method === 'wallet'}
                  disabled={!walletUsable}
                  onSelect={() => setChosen('wallet')}
                  title={t('Wallet')}
                  detail={
                    wallet.data?.isFrozen
                      ? t('Your wallet is frozen.')
                      : balance === null
                        ? t('Checking your balance…')
                        : walletUsable
                          ? t('Pay from your balance of {balance}.', { balance: money(balance) })
                          : t('Your balance of {balance} does not cover {total}.', {
                              balance: money(balance),
                              total: money(total),
                            })
                  }
                />
                {mobileWallets.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {mobileWallets.map((key) => (
                      <WalletTile
                        key={key}
                        method={key}
                        name={`${titleId}-method`}
                        checked={method === key}
                        onSelect={() => {
                          setChosen(key);
                          setPhoneError(null);
                          reset();
                        }}
                      />
                    ))}
                  </div>
                )}
                {mobileWallets.length > 0 && (
                  <p className="px-1 text-xs text-slate-500">
                    {t(
                      'With a mobile wallet you approve the payment on your phone, without leaving this page.',
                    )}
                  </p>
                )}
                {usable.includes('checkout') && (
                  <MethodOption
                    name={`${titleId}-method`}
                    checked={method === 'checkout'}
                    disabled={false}
                    onSelect={() => setChosen('checkout')}
                    title={t('Chapa')}
                    detail={t("telebirr, CBE Birr, M-Pesa or a bank card, on Chapa's payment page.")}
                  />
                )}
              </fieldset>

              {onPhone && method && (
                <div>
                  <label htmlFor={`${amountId}-phone`} className="block font-semibold text-slate-800">
                    {t('{wallet} phone number', { wallet: walletName(method) })}
                  </label>
                  <p id={`${amountId}-phone-hint`} className="text-sm text-slate-500">
                    {t('The payment request is sent to this number.')}
                  </p>
                  <input
                    id={`${amountId}-phone`}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="0911223344"
                    value={phone}
                    aria-invalid={phoneError ? true : undefined}
                    aria-describedby={`${amountId}-phone-hint${phoneError ? ` ${amountId}-phone-error` : ''}`}
                    onChange={(event) => {
                      setPhone(event.target.value);
                      setPhoneError(null);
                      reset();
                    }}
                    className={cx(
                      'mt-2 block w-full rounded-full border-2 bg-white px-5 py-3.5 text-lg tabular-nums shadow-sm outline-none focus:border-ink',
                      phoneError ? 'border-red-500' : 'border-slate-200',
                    )}
                  />
                  {phoneError && (
                    <p id={`${amountId}-phone-error`} className="mt-1 text-sm text-red-700">
                      {phoneError}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <Alert>
                  {isApiError(error, 'DEPOSIT_AMOUNT_INVALID')
                    ? t(
                        'The bid fee has changed. Close this and open it again to see the new fee. Nothing was charged.',
                      )
                    : isApiError(error, 'PAYMENT_PROVIDER_ERROR') && method && onPhone
                      ? t(
                          'The payment request could not be sent to {phone}. Check that it is your {wallet} number and try again. No money was taken.',
                          { phone: walletPhone(phone) ?? t('that number'), wallet: walletName(method) },
                        )
                      : isApiError(
                            error,
                            'PAYMENT_PROVIDER_ERROR',
                            'PAYMENTS_UNAVAILABLE',
                            'DEPOSIT_LIMIT_REACHED',
                          )
                        ? t(
                            'The payment could not be started. No money was taken. Please try again in a moment.',
                          )
                        : bidErrorMessage(error, a)}
                </Alert>
              )}
              {!method && balance !== null && !options.isPending && (
                <Alert tone="warning">
                  {t('Your wallet does not cover {total} and paying online is not available right now.', {
                    total: money(total),
                  })}{' '}
                  <Link to="/wallet?topup=1" className="font-semibold underline">
                    {t('Add money')}
                  </Link>
                </Alert>
              )}
            </>
          )}
        </div>

        {!staff && !placed && !charged && (
          <div className="border-t border-slate-200 bg-[#fdfcfa] px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={pay}
              disabled={!method || busy}
              aria-busy={busy}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-5 py-4 text-lg font-semibold tracking-wide text-ink uppercase transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Spinner className="h-5 w-5" />}
              {leaving ? t('Opening Chapa…') : t('Pay {total} & bid', { total: money(total) })}
            </button>
            <p className="mt-2 text-center text-xs text-slate-500">
              {t('Bid fees are non-refundable. Bids cannot be changed or withdrawn.')}
              {method !== 'wallet' &&
                t(' If bidding closes before your payment is confirmed, the money goes to your wallet.')}
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function MethodOption({
  name,
  checked,
  disabled,
  onSelect,
  title,
  detail,
}: {
  name: string;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={cx(
        'flex cursor-pointer items-start gap-3 rounded-3xl border-2 bg-white px-4 py-3',
        checked ? 'border-ink' : 'border-slate-200',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="mt-1 h-4 w-4 accent-[#161513]"
      />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-slate-600">{detail}</span>
      </span>
    </label>
  );
}
