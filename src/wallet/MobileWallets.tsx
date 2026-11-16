import { useState } from 'react';
import { Spinner } from '../components/ui';
import { cx } from '../lib/cx';
import { bidsPending, isWaiting, useDeposit, walletName } from './deposits';

/** A stroked 24px icon from one path. */
export function Icon({ d, className = 'h-5 w-5' }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cx('shrink-0', className)}
    >
      <path d={d} />
    </svg>
  );
}

/**
 * After a payment request was sent to the phone: waits for the approval, then says what happened: the bids it
 * paid for, or the money (and bonus) added to the wallet.
 */
export function ApproveOnPhone({
  id,
  method,
  phone,
  money,
  onRetry,
}: {
  id: string;
  method: string;
  phone: string;
  money: (minor: string) => string;
  onRetry: () => void;
}) {
  const deposit = useDeposit(id);
  const d = deposit.data;
  const name = walletName(method);

  if (!d || isWaiting(d)) {
    return (
      <div role="status" className="space-y-3 rounded-3xl bg-brand-50 px-5 py-5 text-center">
        <Spinner className="mx-auto h-8 w-8 text-brand-600" />
        <p className="text-lg font-bold">Approve the payment on your phone</p>
        <p className="text-sm text-slate-700">
          {d
            ? `${name} sent a request for ${money(d.amountMinor)} to ${phone}.`
            : `Sending the request to ${phone}…`}{' '}
          Enter your {name} PIN on your phone to pay. This updates by itself once the payment is confirmed.
        </p>
      </div>
    );
  }
  if (bidsPending(d)) {
    return (
      <div role="status" className="space-y-2 rounded-3xl bg-brand-50 px-5 py-5 text-center">
        <Spinner className="mx-auto h-8 w-8 text-brand-600" />
        <p className="text-lg font-bold">Payment received, placing your bids…</p>
      </div>
    );
  }
  if (d.status === 'SUCCEEDED' && d.bid?.state === 'PLACED') {
    return (
      <div role="status" className="space-y-2 rounded-3xl bg-emerald-50 px-5 py-4 text-emerald-900">
        <p className="text-lg font-bold">
          {d.bid.amounts.length === 1 ? 'Bid placed' : `${d.bid.amounts.length} bids placed`}
        </p>
        <p className="text-sm">
          You paid {money(d.amountMinor)} with {name} and bid {d.bid.amountsMinor.map(money).join(', ')}. Good
          luck!
        </p>
      </div>
    );
  }
  if (d.status === 'SUCCEEDED' && !d.bid) {
    const bonus = BigInt(d.bonusMinor) > 0n;
    return (
      <div role="status" className="space-y-2 rounded-3xl bg-emerald-50 px-5 py-4 text-emerald-900">
        <p className="text-lg font-bold">Money added</p>
        <p className="text-sm">
          {money(d.amountMinor)} is in your wallet{bonus ? `, plus a ${money(d.bonusMinor)} bonus` : ''}.
        </p>
      </div>
    );
  }
  if (d.status === 'SUCCEEDED') {
    return (
      <div role="alert" className="space-y-2 rounded-3xl bg-amber-50 px-5 py-4 text-amber-900">
        <p className="text-lg font-bold">Payment received, but the bids were not placed</p>
        <p className="text-sm">
          {d.bid?.error ? `${d.bid.error.replace(/\.?$/, '.')} ` : ''}Your {money(d.amountMinor)} is in your
          wallet, so you can bid again from there.
        </p>
      </div>
    );
  }
  return (
    <div role="alert" className="space-y-3 rounded-3xl bg-red-50 px-5 py-4 text-red-900">
      <p className="text-lg font-bold">Payment not completed</p>
      <p className="text-sm">
        {d.status === 'EXPIRED'
          ? 'The request was not approved in time.'
          : 'The payment was declined or cancelled on the phone.'}{' '}
        No money was taken{d.bid ? ' and no bid was placed' : ''}.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full bg-white px-4 py-2 text-sm font-semibold"
      >
        Try again
      </button>
    </div>
  );
}

/** Brand colour behind a wallet's initials, shown until its logo file is added. */
const WALLET_TINT: Record<string, string> = {
  telebirr: 'bg-[#0b78c1] text-white',
  mpesa: 'bg-[#3fae49] text-white',
  cbebirr: 'bg-[#6a2c91] text-white',
  ebirr: 'bg-[#e8a317] text-ink',
};

/**
 * A wallet's logo: `/payments/<method>.png` in the public folder (the provider's official artwork). Until that
 * file exists, or if it fails to load, a coloured badge with the wallet's initials stands in.
 */
function WalletLogo({ method }: { method: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    const initials = walletName(method)
      .replace(/[^A-Za-z ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0].toUpperCase())
      .join('')
      .slice(0, 2);
    return (
      <span
        aria-hidden="true"
        className={cx(
          'flex h-12 w-12 items-center justify-center rounded-2xl text-base font-bold',
          WALLET_TINT[method] ?? 'bg-slate-200 text-slate-700',
        )}
      >
        {initials}
      </span>
    );
  }
  return (
    <img
      src={`/payments/${method}.png`}
      alt=""
      onError={() => setMissing(true)}
      className="h-12 w-auto max-w-[7.5rem] object-contain"
    />
  );
}

/** One mobile wallet as a tile: its logo, its name, and a tick when chosen. */
export function WalletTile({
  method,
  name,
  checked,
  onSelect,
}: {
  method: string;
  name: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cx(
        'relative flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-3xl border-2 bg-white px-3 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600',
        checked ? 'border-ink bg-brand-50' : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="sr-only" />
      <WalletLogo method={method} />
      <span className="text-sm font-semibold">{walletName(method)}</span>
      {checked && (
        <span
          aria-hidden="true"
          className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
            <path d="m5 12 5 5 9-10" />
          </svg>
        </span>
      )}
    </label>
  );
}
