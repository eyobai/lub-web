import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Auction } from '../auctions/queries';
import { useAuth } from '../auth/useAuth';
import { Alert, Button, Card, Field } from '../components/ui';
import { cx } from '../lib/cx';
import { formatMinor } from '../lib/money';
import { useWallet } from '../wallet/queries';
import { parseBidAmount, sortAmounts, type AmountProblem } from './amounts';
import { bidErrorMessage, refusedAmounts } from './errors';
import { isUnconfirmed, useMyBidsInAuction, usePlaceBids, type BidSubmission } from './queries';
import { t, tCount } from '../i18n/i18n';

const bids = (count: number) => tCount(count, '{count} bid', '{count} bids');

/** Choosing amounts, seeing what they cost, and placing them. Shown to signed-in users while an auction runs. */
export function BidPanel({ auction: a }: { auction: Auction }) {
  const { user } = useAuth();
  const wallet = useWallet();
  const mine = useMyBidsInAuction(a.id, true);
  const place = usePlaceBids(a.id);

  const [amounts, setAmounts] = useState<bigint[]>([]);
  const [entry, setEntry] = useState('');
  const [entryError, setEntryError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [placed, setPlaced] = useState<BidSubmission | null>(null);

  const money = (minor: bigint | string) => formatMinor(minor, a.currency, a.minorUnits);
  const rejectsRepeats = a.duplicateBidPolicy === 'REJECT_SAME_USER_SAME_AMOUNT';
  const alreadyBid = useMemo(
    () => new Set(rejectsRepeats ? (mine.data?.items ?? []).map((bid) => bid.amountMinor) : []),
    [mine.data, rejectsRepeats],
  );
  const refused = useMemo(() => new Set(refusedAmounts(place.error)), [place.error]);

  if (user?.roles.some((role) => role !== 'USER')) {
    return <Alert tone="info">{t('Staff accounts cannot place bids.')}</Alert>;
  }

  const leftForUser =
    a.maxBidsPerUser === null ? null : Math.max(0, a.maxBidsPerUser - (mine.data?.total ?? 0));
  const room = Math.min(a.maxBidsPerRequest, leftForUser ?? Infinity) - amounts.length;
  const total = BigInt(a.bidFeeMinor) * BigInt(amounts.length);
  const balance =
    wallet.data && wallet.data.currency === a.currency ? BigInt(wallet.data.spendableMinor) : null;
  const short = balance !== null && amounts.length > 0 && total > balance;
  const frozen = wallet.data?.isFrozen === true;

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
  const roomText = () =>
    room <= 0
      ? leftForUser !== null && leftForUser <= a.maxBidsPerRequest
        ? t('This auction allows {bids} per person.', { bids: bids(a.maxBidsPerUser ?? 0) })
        : t('You can place at most {bids} at a time.', { bids: bids(a.maxBidsPerRequest) })
      : tCount(room, 'You can add {count} more bid.', 'You can add {count} more bids.');

  const change = (next: bigint[]) => {
    setAmounts(sortAmounts(next));
    setPlaced(null);
    place.reset();
  };

  function addOne(event: FormEvent) {
    event.preventDefault();
    const parsed = parseBidAmount(entry, a);
    if (!parsed.ok) return setEntryError(problemText(parsed.problem));
    if (amounts.includes(parsed.minor))
      return setEntryError(t('{amount} is already in your list.', { amount: money(parsed.minor) }));
    if (alreadyBid.has(parsed.minor.toString())) {
      return setEntryError(
        t('You have already bid {amount} in this auction.', { amount: money(parsed.minor) }),
      );
    }
    if (room <= 0) return setEntryError(roomText());
    setEntryError(null);
    setEntry('');
    change([...amounts, parsed.minor]);
  }

  function submit() {
    place.mutate(amounts.map(String), {
      onSuccess: (submission) => {
        setPlaced(submission);
        setAmounts([]);
        setConfirming(false);
      },
      // A refusal needs the list changed; an answer that never came can be retried as it is.
      onError: (error) => setConfirming(isUnconfirmed(error)),
    });
  }

  if (leftForUser === 0 && !placed) {
    return (
      <Alert tone="info">
        {t('You have placed all {bids} allowed per person in this auction.', {
          bids: bids(a.maxBidsPerUser ?? 0),
        })}
      </Alert>
    );
  }

  if (confirming) {
    return (
      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-bold">{t('Place {bids}?', { bids: bids(amounts.length) })}</h2>
        <p className="text-sm font-semibold tabular-nums">{amounts.map(money).join(', ')}</p>
        <p className="text-sm text-slate-700">
          {balance !== null
            ? t('{total} will be taken from your wallet (balance {balance}).', {
                total: money(total),
                balance: money(balance),
              })
            : t('{total} will be taken from your wallet.', { total: money(total) })}{' '}
          {t('Bids cannot be changed or withdrawn.')}
        </p>
        {place.error && <Alert>{bidErrorMessage(place.error, a)}</Alert>}
        <div className="flex flex-wrap gap-3">
          <Button onClick={submit} busy={place.isPending} className="flex-1 py-3 text-base">
            {place.error ? t('Try again') : t('Pay {total} and bid', { total: money(total) })}
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={place.isPending}>
            {t('Back')}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-bold">{t('Place your bids')}</h2>
        <p className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-600">
          {t('Wallet:')}{' '}
          <Link to="/wallet" className="font-semibold text-brand-700 hover:underline">
            {wallet.data
              ? formatMinor(wallet.data.spendableMinor, wallet.data.currency, wallet.data.minorUnits)
              : '…'}
          </Link>
        </p>
      </div>

      {placed && (
        <Alert tone="success">
          {t('{bids} placed: {amounts}. {fee} was taken from your wallet.', {
            bids: bids(placed.bidCount),
            amounts: placed.bids.map((bid) => money(bid.amountMinor)).join(', '),
            fee: money(placed.totalFeeMinor),
          })}
        </Alert>
      )}
      {frozen && (
        <Alert tone="warning">{t('Your wallet is frozen, so you cannot bid. Please contact support.')}</Alert>
      )}
      {place.error && <Alert>{bidErrorMessage(place.error, a)}</Alert>}

      <form onSubmit={addOne} noValidate className="flex items-start gap-2">
        <Field
          label={t('Bid amount ({currency})', { currency: a.currency })}
          required
          className="flex-1"
          inputMode="decimal"
          autoComplete="off"
          placeholder={t('{amount} or more', { amount: money(a.minBidMinor).replace(`${a.currency} `, '') })}
          value={entry}
          onChange={(event) => {
            setEntry(event.target.value);
            setEntryError(null);
          }}
          error={entryError}
          hint={t('Each bid costs {fee}.', { fee: money(a.bidFeeMinor) })}
        />
        <Button type="submit" variant="dark" className="mt-6 py-3.5">
          {t('Add')}
        </Button>
      </form>

      {amounts.length > 0 && (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <ul aria-label={t('Bids to place')} className="flex flex-wrap gap-2">
            {amounts.map((amount) => (
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
                  onClick={() => change(amounts.filter((other) => other !== amount))}
                  className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/10"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-sm text-slate-700">
            {bids(amounts.length)} × {money(a.bidFeeMinor)} ={' '}
            <strong className="tabular-nums">{money(total)}</strong>
          </p>
          {short && balance !== null && (
            <Alert tone="warning">
              {t('Your wallet has {balance}, which does not cover {total}.', {
                balance: money(balance),
                total: money(total),
              })}{' '}
              <Link to="/wallet?topup=1" className="font-semibold underline">
                {t('Remove some bids or add money.')}
              </Link>
            </Alert>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => setConfirming(true)}
              disabled={short || frozen}
              className="flex-1 py-3 text-base"
            >
              {t('Review {bids}', { bids: bids(amounts.length) })}
            </Button>
            <Button variant="secondary" onClick={() => change([])}>
              {t('Clear')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
