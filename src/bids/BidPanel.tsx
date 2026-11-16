import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Auction } from '../auctions/queries';
import { useAuth } from '../auth/useAuth';
import { Alert, Button, Card, Field } from '../components/ui';
import { cx } from '../lib/cx';
import { formatMinor } from '../lib/money';
import { useWallet } from '../wallet/queries';
import { amountsBetween, parseBidAmount, sortAmounts, type AmountProblem } from './amounts';
import { bidErrorMessage, refusedAmounts } from './errors';
import { isUnconfirmed, useMyBidsInAuction, usePlaceBids, type BidSubmission } from './queries';

const plural = (count: number, word: string) =>
  `${count.toLocaleString()} ${count === 1 ? word : `${word}s`}`;

/** Choosing amounts, seeing what they cost, and placing them. Shown to signed-in users while an auction runs. */
export function BidPanel({ auction: a }: { auction: Auction }) {
  const { user } = useAuth();
  const wallet = useWallet();
  const mine = useMyBidsInAuction(a.id, true);
  const place = usePlaceBids(a.id);

  const [amounts, setAmounts] = useState<bigint[]>([]);
  const [entry, setEntry] = useState('');
  const [entryError, setEntryError] = useState<string | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);
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
    return <Alert tone="info">Staff accounts cannot place bids.</Alert>;
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
        return `The lowest allowed bid is ${money(a.minBidMinor)}.`;
      case 'above':
        return `The highest allowed bid is ${money(a.maxBidMinor)}.`;
      case 'step':
        return `Bids go up in steps of ${money(a.bidStepMinor)}, starting at ${money(a.minBidMinor)}.`;
      default:
        return 'Enter an amount such as 4 or 4.50.';
    }
  };
  const roomText = () =>
    room <= 0
      ? leftForUser !== null && leftForUser <= a.maxBidsPerRequest
        ? `This auction allows ${plural(a.maxBidsPerUser ?? 0, 'bid')} per person.`
        : `You can place at most ${plural(a.maxBidsPerRequest, 'bid')} at a time.`
      : `You can add ${plural(room, 'more bid')}.`;

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
      return setEntryError(`${money(parsed.minor)} is already in your list.`);
    if (alreadyBid.has(parsed.minor.toString())) {
      return setEntryError(`You have already bid ${money(parsed.minor)} in this auction.`);
    }
    if (room <= 0) return setEntryError(roomText());
    setEntryError(null);
    setEntry('');
    change([...amounts, parsed.minor]);
  }

  function addRange(event: FormEvent) {
    event.preventDefault();
    const low = parseBidAmount(from, a);
    const high = parseBidAmount(to, a);
    if (!low.ok) return setRangeError(`From: ${problemText(low.problem)}`);
    if (!high.ok) return setRangeError(`To: ${problemText(high.problem)}`);
    const all = amountsBetween(low.minor, high.minor, a, 1000);
    const fresh = all?.filter((amount) => !amounts.includes(amount) && !alreadyBid.has(amount.toString()));
    if (!fresh || fresh.length > Math.max(room, 0)) {
      return setRangeError(`That range is too long. ${roomText()}`);
    }
    if (fresh.length === 0) {
      return setRangeError('Every amount in that range is already in your list or already bid.');
    }
    setRangeError(null);
    setFrom('');
    setTo('');
    change([...amounts, ...fresh]);
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
        You have placed all {plural(a.maxBidsPerUser ?? 0, 'bid')} allowed per person in this auction.
      </Alert>
    );
  }

  if (confirming) {
    return (
      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-bold">Place {plural(amounts.length, 'bid')}?</h2>
        <p className="text-sm font-semibold tabular-nums">{amounts.map(money).join(', ')}</p>
        <p className="text-sm text-slate-700">
          {money(total)} will be taken from your wallet
          {balance !== null && <> (balance {money(balance)})</>}. Bids cannot be changed or withdrawn.
        </p>
        {place.error && <Alert>{bidErrorMessage(place.error, a)}</Alert>}
        <div className="flex flex-wrap gap-3">
          <Button onClick={submit} busy={place.isPending} className="flex-1 py-3 text-base">
            {place.error ? 'Try again' : `Pay ${money(total)} and bid`}
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={place.isPending}>
            Back
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-bold">Place your bids</h2>
        <p className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-600">
          Wallet:{' '}
          <Link to="/wallet" className="font-semibold text-brand-700 hover:underline">
            {wallet.data
              ? formatMinor(wallet.data.spendableMinor, wallet.data.currency, wallet.data.minorUnits)
              : '…'}
          </Link>
        </p>
      </div>

      {placed && (
        <Alert tone="success">
          {plural(placed.bidCount, 'bid')} placed:{' '}
          {placed.bids.map((bid) => money(bid.amountMinor)).join(', ')}. {money(placed.totalFeeMinor)} was
          taken from your wallet.
        </Alert>
      )}
      {frozen && (
        <Alert tone="warning">Your wallet is frozen, so you cannot bid. Please contact support.</Alert>
      )}
      {place.error && <Alert>{bidErrorMessage(place.error, a)}</Alert>}

      <form onSubmit={addOne} noValidate className="flex items-start gap-2">
        <Field
          label={`Bid amount (${a.currency})`}
          required
          className="flex-1"
          inputMode="decimal"
          autoComplete="off"
          placeholder={`${money(a.minBidMinor).replace(`${a.currency} `, '')} or more`}
          value={entry}
          onChange={(event) => {
            setEntry(event.target.value);
            setEntryError(null);
          }}
          error={entryError}
          hint={`Each bid costs ${money(a.bidFeeMinor)}.`}
        />
        <Button type="submit" variant="dark" className="mt-6 py-3.5">
          Add
        </Button>
      </form>

      <div>
        <button
          type="button"
          aria-expanded={rangeOpen}
          onClick={() => setRangeOpen(!rangeOpen)}
          className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
        >
          {rangeOpen ? 'Hide range' : 'Add a range of amounts'}
        </button>
        {rangeOpen && (
          <form onSubmit={addRange} noValidate className="mt-2 space-y-2">
            <div className="flex items-start gap-2">
              <Field
                label="From"
                required
                className="flex-1"
                inputMode="decimal"
                autoComplete="off"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setRangeError(null);
                }}
              />
              <Field
                label="To"
                required
                className="flex-1"
                inputMode="decimal"
                autoComplete="off"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setRangeError(null);
                }}
              />
              <Button type="submit" variant="dark" className="mt-6 py-3.5 whitespace-nowrap">
                Add range
              </Button>
            </div>
            {rangeError ? (
              <p role="alert" className="text-sm text-red-700">
                {rangeError}
              </p>
            ) : (
              <p className="text-sm text-slate-500">
                Adds every allowed amount between the two, one bid each.
              </p>
            )}
          </form>
        )}
      </div>

      {amounts.length > 0 && (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <ul aria-label="Bids to place" className="flex flex-wrap gap-2">
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
                  aria-label={`Remove ${money(amount)}`}
                  onClick={() => change(amounts.filter((other) => other !== amount))}
                  className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/10"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-sm text-slate-700">
            {plural(amounts.length, 'bid')} × {money(a.bidFeeMinor)} ={' '}
            <strong className="tabular-nums">{money(total)}</strong>
          </p>
          {short && balance !== null && (
            <Alert tone="warning">
              Your wallet has {money(balance)}, which does not cover {money(total)}. Remove some bids or{' '}
              <Link to="/wallet" className="font-semibold underline">
                add money
              </Link>
              .
            </Alert>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => setConfirming(true)}
              disabled={short || frozen}
              className="flex-1 py-3 text-base"
            >
              Review {plural(amounts.length, 'bid')}
            </Button>
            <Button variant="secondary" onClick={() => change([])}>
              Clear
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
