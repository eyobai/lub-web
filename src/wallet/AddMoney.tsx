import { useId, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { isApiError } from '../api/errors';
import { useAuth } from '../auth/useAuth';
import { Alert, Card, Spinner } from '../components/ui';
import { Sheet } from '../components/Sheet';
import { cx } from '../lib/cx';
import { formatDateTime } from '../lib/clock';
import { leaveTo } from '../lib/leave';
import { formatMinor, formatMoney, toMinor } from '../lib/money';
import {
  bonusFor,
  checkoutAddress,
  depositErrorMessage,
  isWaiting,
  parseDepositAmount,
  quickAmounts,
  useMyDeposits,
  useStartDeposit,
  walletName,
  walletPhone,
  type DepositOptions,
} from './deposits';
import { ApproveOnPhone, Icon, WalletTile } from './MobileWallets';
import { useWallet } from './queries';
import { t } from '../i18n/i18n';
import { tRich } from '../i18n/rich';

const WALLET_ICON =
  'M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2zm13 7h.01';

/** The wallet page's way in: a button that opens the top-up sheet, and payments started but not finished. */
export function AddMoney({ options }: { options: DepositOptions }) {
  // Other pages link here with ?topup=1 to open the sheet straight away.
  const [params, setParams] = useSearchParams();
  const open = params.get('topup') === '1';
  const setOpen = (next: boolean) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next) copy.set('topup', '1');
        else copy.delete('topup');
        return copy;
      },
      { replace: true },
    );
  const percent = options.bonusPercent;
  return (
    <section aria-labelledby="add-money-heading">
      <h2 id="add-money-heading" className="text-lg font-semibold">
        {t('Add money')}
      </h2>
      <Card className="mt-3 flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-slate-600">
          {percent > 0
            ? tRich('{bonus} on every top-up, spent on bid fees before your own money.', {
                bonus: (
                  <span className="font-semibold text-emerald-700">
                    {t('Get a {percent}% bonus', { percent })}
                  </span>
                ),
              })
            : t('Top up once and bid from your wallet in one tap.')}
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="flex items-center gap-2 rounded-full bg-gradient-to-b from-brand-500 to-brand-600 px-5 py-3 font-bold text-white shadow-[0_6px_16px_-4px_rgb(5_150_105/0.45)]"
        >
          <Icon d={WALLET_ICON} />
          {t('Top up wallet')}
        </button>
      </Card>
      {open && <TopUpSheet options={options} onClose={() => setOpen(false)} />}
      <UnfinishedDeposits />
    </section>
  );
}

/** "Top up wallet": amount, the bonus it earns, how to pay, and then the payment on the phone. */
export function TopUpSheet({ options, onClose }: { options: DepositOptions; onClose: () => void }) {
  const id = useId();
  const { user } = useAuth();
  const wallet = useWallet();
  const start = useStartDeposit();
  const [input, setInput] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [phone, setPhone] = useState(() => walletPhone(user?.phoneNumber ?? '') ?? '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [charged, setCharged] = useState<{ id: string; method: string; phone: string } | null>(null);
  const [leaving, setLeaving] = useState(false);

  const money = (minor: bigint | string) => formatMinor(minor, options.currency, options.minorUnits);
  const typed = toMinor(input.replace(/,/g, '').trim(), options.minorUnits);
  const amountMinor = typed !== null && typed > 0n ? typed : null;
  const bonus = amountMinor !== null ? bonusFor(amountMinor, options) : 0n;
  const maxBonus = BigInt(options.bonusMaxMinor);
  const fullBonusAt = options.bonusPercent > 0 ? (maxBonus * 100n) / BigInt(options.bonusPercent) : 0n;
  const methods = options.directChargeMethods;
  const method = chosen && methods.includes(chosen) ? chosen : (methods[0] ?? null);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const amount = parseDepositAmount(input, options);
    if (!amount.ok) {
      setProblem(amount.message);
      document.getElementById(`${id}-amount`)?.focus();
      return;
    }
    const mobile = method ? walletPhone(phone) : null;
    if (method && !mobile) {
      setPhoneError(t('Enter your {wallet} number, such as 0911223344.', { wallet: walletName(method) }));
      return;
    }
    start.mutate(
      {
        amountMinor: amount.minor.toString(),
        charge: method && mobile ? { method, phoneNumber: mobile } : undefined,
      },
      {
        onSuccess: (deposit) => {
          if (deposit.chargeMethod && mobile) {
            setCharged({ id: deposit.id, method: deposit.chargeMethod, phone: mobile });
            return;
          }
          const address = checkoutAddress(deposit);
          if (!address) {
            setProblem(t('The payment page could not be opened. No money was taken. Please try again.'));
            return;
          }
          setLeaving(true);
          leaveTo(address);
        },
      },
    );
  }

  const busy = start.isPending || leaving;
  const footer = charged ? undefined : (
    <>
      <button
        type="button"
        onClick={() => submit()}
        disabled={busy}
        aria-busy={busy}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-brand-500 to-brand-600 px-5 py-4 text-lg font-bold tracking-wide text-white uppercase disabled:opacity-50"
      >
        {busy && <Spinner className="h-5 w-5" />}
        {leaving
          ? t('Opening Chapa…')
          : method
            ? amountMinor !== null
              ? t('Top up {amount}', { amount: money(amountMinor) })
              : t('Top up')
            : t('Continue to payment')}
      </button>
      {!method && (
        <p className="mt-2 text-center text-xs text-slate-500">
          {t("You pay on Chapa's payment page, then come back here.")}
        </p>
      )}
    </>
  );

  return (
    <Sheet title={t('Top up wallet')} icon={<Icon d={WALLET_ICON} />} onClose={onClose} footer={footer}>
      <p className="flex items-center justify-between rounded-full bg-slate-200/70 px-5 py-3">
        <span className="text-slate-600">{t('Wallet')}</span>
        <span className="font-bold tabular-nums">
          {wallet.data ? money(wallet.data.availableMinor) : '…'}
          {wallet.data && BigInt(wallet.data.bonusMinor) > 0n && (
            <span className="ml-1 text-sm font-semibold text-emerald-700">
              + {money(wallet.data.bonusMinor)} bonus
            </span>
          )}
        </span>
      </p>

      {options.testMode && (
        <Alert tone="warning">{t('Test mode: payments here are practice only. No real money moves.')}</Alert>
      )}

      {charged ? (
        <ApproveOnPhone
          {...charged}
          money={money}
          onRetry={() => {
            setCharged(null);
            start.reset();
          }}
        />
      ) : (
        <>
          <form onSubmit={submit} noValidate>
            <label htmlFor={`${id}-amount`} className="block font-semibold text-slate-700">
              {t('Amount')}
            </label>
            <div
              className={cx(
                'mt-2 flex items-center gap-2 rounded-full border-2 bg-white px-6 shadow-sm focus-within:border-ink',
                problem ? 'border-red-500' : 'border-slate-200',
              )}
            >
              <input
                id={`${id}-amount`}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={input}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? `${id}-problem` : `${id}-limits`}
                onChange={(event) => {
                  setInput(event.target.value);
                  setProblem(null);
                  start.reset();
                }}
                className="min-w-0 flex-1 bg-transparent py-4 text-2xl font-bold tabular-nums outline-none placeholder:text-slate-300"
              />
              <span className="font-bold text-slate-500">{options.currency}</span>
            </div>
            {problem ? (
              <p id={`${id}-problem`} className="mt-1 text-sm text-red-700">
                {problem}
              </p>
            ) : (
              <p id={`${id}-limits`} className="mt-1 text-sm text-slate-500">
                {t('{min} to {max} at a time.', {
                  min: money(options.minAmountMinor),
                  max: money(options.maxAmountMinor),
                })}
              </p>
            )}
          </form>

          {options.bonusPercent > 0 && (
            <div className="rounded-3xl bg-emerald-50 px-5 py-4 text-emerald-900">
              <p className="font-bold text-emerald-700">
                <span aria-hidden="true">🎁 </span>
                {bonus > 0n
                  ? t("You'll get {amount} bonus ({percent}%)", {
                      amount: money(bonus),
                      percent: options.bonusPercent,
                    })
                  : t('Get a {percent}% bonus on this top-up', { percent: options.bonusPercent })}
              </p>
              <p className="text-sm">{t('Valid for {days} days', { days: options.bonusValidDays })}</p>
              {(amountMinor === null || amountMinor < fullBonusAt) && (
                <p className="text-sm">
                  {t('Top up {amount} to get the full {bonus} bonus.', {
                    amount: money(fullBonusAt),
                    bonus: money(maxBonus),
                  })}
                </p>
              )}
            </div>
          )}
          {options.bonusPercent > 0 && (
            <div className="space-y-1 text-xs text-slate-500">
              <p>
                {t(
                  'The bonus is added when your payment is confirmed. It is spent on bid fees before your own money and cannot be withdrawn.',
                )}
              </p>
              <p>{t('Bonuses apply only to wallet top-ups, not to paying for bids directly.')}</p>
            </div>
          )}

          <ul aria-label={t('Common amounts')} className="flex flex-wrap gap-2">
            {quickAmounts(options).map((amount) => {
              const minor = toMinor(amount, options.minorUnits) ?? 0n;
              const selected = amountMinor === minor;
              return (
                <li key={amount}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setInput(amount);
                      setProblem(null);
                      start.reset();
                    }}
                    className={cx(
                      'flex min-h-11 flex-col items-center rounded-3xl border px-4 py-1.5 leading-tight',
                      selected
                        ? 'border-brand-600 bg-brand-500 text-white'
                        : 'border-slate-300 bg-slate-100 text-slate-900 hover:bg-slate-200',
                    )}
                  >
                    <span className="font-bold">{formatMoney(amount, options.currency)}</span>
                    {options.bonusPercent > 0 && (
                      <span className={cx('text-xs', selected ? 'text-white/80' : 'text-slate-500')}>
                        +{money(bonusFor(minor, options))}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {methods.length > 0 && (
            <fieldset className="space-y-2 rounded-4xl bg-slate-200/60 p-3">
              <legend className="sr-only">{t('Select payment method')}</legend>
              <p
                aria-hidden="true"
                className="flex items-center gap-2 px-1 text-sm font-semibold text-slate-600"
              >
                <Icon d="M3 7h18v10H3zm0 4h18" className="h-4 w-4 text-brand-600" />
                {t('Select payment method')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {methods.map((key) => (
                  <WalletTile
                    key={key}
                    method={key}
                    name={`${id}-method`}
                    checked={method === key}
                    onSelect={() => {
                      setChosen(key);
                      setPhoneError(null);
                      start.reset();
                    }}
                  />
                ))}
              </div>
            </fieldset>
          )}

          {method && (
            <div>
              <label htmlFor={`${id}-phone`} className="block font-semibold text-slate-700">
                {t('{wallet} phone number', { wallet: walletName(method) })}
              </label>
              <input
                id={`${id}-phone`}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0911223344"
                value={phone}
                aria-invalid={phoneError ? true : undefined}
                aria-describedby={phoneError ? `${id}-phone-error` : undefined}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setPhoneError(null);
                  start.reset();
                }}
                className={cx(
                  'mt-2 block w-full rounded-full border-2 bg-white px-5 py-3.5 text-lg tabular-nums shadow-sm outline-none focus:border-ink',
                  phoneError ? 'border-red-500' : 'border-slate-200',
                )}
              />
              {phoneError ? (
                <p id={`${id}-phone-error`} className="mt-1 text-sm text-red-700">
                  {phoneError}
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-500">
                  {t('You approve the payment on your phone, without leaving this page.')}
                </p>
              )}
            </div>
          )}

          {start.isError && (
            <Alert>
              {method && isApiError(start.error, 'PAYMENT_PROVIDER_ERROR')
                ? t(
                    'The payment request could not be sent to {phone}. Check that it is your {wallet} number and try again. No money was taken.',
                    { phone: walletPhone(phone) ?? t('that number'), wallet: walletName(method) },
                  )
                : depositErrorMessage(start.error, options)}
            </Alert>
          )}
        </>
      )}
    </Sheet>
  );
}

/** Payments the user started and has not finished, so a closed tab does not lose them. */
function UnfinishedDeposits() {
  const deposits = useMyDeposits(true);
  const waiting = deposits.data?.items.filter(isWaiting) ?? [];
  if (waiting.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-slate-700">{t('Payments not finished')}</h3>
      <Card className="mt-2">
        <ul className="divide-y divide-slate-100">
          {waiting.map((deposit) => (
            <li key={deposit.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold tabular-nums">{formatMoney(deposit.amount, deposit.currency)}</p>
                <p className="text-xs text-slate-500">
                  {tRich('Started {date}', {
                    date: <time dateTime={deposit.createdAt}>{formatDateTime(deposit.createdAt)}</time>,
                  })}
                </p>
              </div>
              <Link
                to={`/wallet/deposits/${deposit.id}`}
                className="shrink-0 text-sm font-semibold text-brand-700 underline"
              >
                {t('View payment')}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
