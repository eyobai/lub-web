import { Link, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/errors';
import { StatusBadge } from '../auctions/StatusBadge';
import { MY_BIDS_PAGE_SIZE, useMyBids, type MyBid } from '../bids/queries';
import { Alert, Button, ButtonLink, Card, PageLoading, Pagination } from '../components/ui';
import { cx } from '../lib/cx';
import { formatDateTime } from '../lib/clock';
import { formatMoney } from '../lib/money';

/** Bids arrive newest first; neighbours from the same auction are shown under one heading. */
function byAuction(bids: MyBid[]): MyBid[][] {
  const groups: MyBid[][] = [];
  for (const bid of bids) {
    const last = groups[groups.length - 1];
    if (last && last[0].auctionId === bid.auctionId) last.push(bid);
    else groups.push([bid]);
  }
  return groups;
}

export function MyBidsPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  const bids = useMyBids(page);
  const pages = bids.data ? Math.max(1, Math.ceil(bids.data.total / MY_BIDS_PAGE_SIZE)) : 1;

  const go = (next: number) => {
    setParams(next > 1 ? { page: String(next) } : {});
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">My bids</h1>
        <ButtonLink to="/wins" variant="secondary">
          My wins
        </ButtonLink>
      </div>
      {bids.data && bids.data.total > 0 && (
        <p className="mt-1 text-sm text-slate-600">
          {bids.data.total.toLocaleString()} {bids.data.total === 1 ? 'bid' : 'bids'} in total, newest first.
        </p>
      )}

      <div className="mt-5">
        {bids.isPending ? (
          <PageLoading label="Loading your bids" />
        ) : bids.isError ? (
          <div className="space-y-3">
            <Alert>{errorMessage(bids.error)}</Alert>
            <Button variant="secondary" onClick={() => void bids.refetch()} busy={bids.isFetching}>
              Try again
            </Button>
          </div>
        ) : bids.data.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-12 text-center">
            <p className="text-slate-500">
              {page > 1 ? 'There is nothing on this page.' : 'You have not placed any bids yet.'}
            </p>
            {page === 1 && (
              <ButtonLink to="/" className="mt-4">
                See running auctions
              </ButtonLink>
            )}
          </div>
        ) : (
          <ul className={cx('space-y-4', bids.isPlaceholderData && 'opacity-60')}>
            {byAuction(bids.data.items).map((group) => (
              <li key={group[0].id}>
                <Card className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold">
                      <Link to={`/auctions/${group[0].auctionId}`} className="hover:underline">
                        {group[0].auctionTitle}
                      </Link>
                    </h2>
                    <StatusBadge status={group[0].auctionStatus} />
                  </div>
                  <ul className="mt-3 divide-y divide-slate-100 text-sm">
                    {group.map((bid) => (
                      <li key={bid.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="font-semibold tabular-nums">
                          {formatMoney(bid.amount, bid.currency)}
                        </span>
                        <span className="text-right text-slate-500">
                          <time dateTime={bid.createdAt}>{formatDateTime(bid.createdAt)}</time> · fee{' '}
                          <span className="tabular-nums">{formatMoney(bid.bidFee, bid.currency)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {bids.data && <Pagination page={page} pages={pages} onChange={go} />}
      </div>
    </div>
  );
}
