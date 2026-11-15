import { Link } from 'react-router-dom';
import type { Auction } from '../auctions/queries';
import { Card } from '../components/ui';
import { cx } from '../lib/cx';
import { formatMinor } from '../lib/money';
import { sortAmounts } from './amounts';
import { useMyAuctionResult, useMyBidsInAuction, type MyAuctionResult } from './queries';

const OUTCOME: Record<MyAuctionResult['bids'][number]['outcome'], { label: string; className: string }> = {
  WINNING: { label: 'Won', className: 'border-accent-400 bg-amber-50 text-amber-900' },
  UNIQUE_NOT_LOWEST: {
    label: 'Unique, but not the lowest',
    className: 'border-sky-200 bg-sky-50 text-sky-900',
  },
  NOT_UNIQUE: { label: 'Also bid by others', className: 'border-slate-200 bg-slate-50 text-slate-700' },
};

/** The signed-in user's own bids in an auction, and how each one did once the auction has ended. */
export function MyAuctionBids({ auction: a }: { auction: Auction }) {
  const finished = a.status === 'COMPLETED';
  const result = useMyAuctionResult(a.id, finished);
  const bids = useMyBidsInAuction(a.id, !finished || result.data === null);
  const money = (minor: string | bigint) => formatMinor(minor, a.currency, a.minorUnits);

  if (finished && result.data) return <MyResult result={result.data} money={money} />;
  if (!bids.data || bids.data.total === 0) return null;

  const amounts = sortAmounts(bids.data.items.map((bid) => BigInt(bid.amountMinor)));
  return (
    <Card className="p-4">
      <h2 className="font-semibold">Your bids in this auction ({bids.data.total.toLocaleString()})</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {amounts.map((amount, index) => (
          <li
            key={`${amount}-${index}`}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold tabular-nums"
          >
            {money(amount)}
          </li>
        ))}
      </ul>
      {bids.data.total > bids.data.items.length && (
        <p className="mt-3 text-sm text-slate-600">
          These are your latest {bids.data.items.length} bids.{' '}
          <Link to="/bids" className="font-semibold text-brand-700 hover:underline">
            See all your bids
          </Link>
        </p>
      )}
      {a.status === 'CANCELLED' && (
        <p className="mt-3 text-sm text-slate-600">
          The fees for these bids are returned to your{' '}
          <Link to="/wallet" className="font-semibold text-brand-700 hover:underline">
            wallet
          </Link>
          .
        </p>
      )}
    </Card>
  );
}

function MyResult({ result, money }: { result: MyAuctionResult; money: (minor: string) => string }) {
  if (result.bids.length === 0) return null;
  const winning = result.bids.find((bid) => bid.outcome === 'WINNING');
  return (
    <Card className={cx('p-4', result.won && 'border-accent-400')}>
      <h2 className="font-semibold">
        {result.won && winning ? `You won with ${money(winning.amountMinor)}!` : 'Your bids in this auction'}
      </h2>
      {result.won ? (
        <p className="mt-1 text-sm text-slate-700">
          Your bid was the lowest amount nobody else chose. We will confirm the result and contact you about
          your prize.
        </p>
      ) : (
        <p className="mt-1 text-sm text-slate-700">
          {result.outcome === 'NO_UNIQUE_BID'
            ? result.appliedNoUniquePolicy === 'REFUND_BID_FEES'
              ? result.bidFeesRefundedAt
                ? 'Nobody won. Your bid fees were returned to your wallet.'
                : 'Nobody won. Your bid fees are being returned to your wallet.'
              : 'Nobody won: every amount was bid more than once.'
            : 'None of your bids won this time.'}
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {result.bids.map((bid) => (
          <li
            key={bid.id}
            className={cx(
              'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm',
              OUTCOME[bid.outcome].className,
            )}
          >
            <span className="font-semibold tabular-nums">{money(bid.amountMinor)}</span>
            <span>{OUTCOME[bid.outcome].label}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
