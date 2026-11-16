import { Link, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/errors';
import { ProductImage } from '../auctions/ProductImage';
import { Alert, Button, Card, PageLoading, Pagination } from '../components/ui';
import { cx } from '../lib/cx';
import { formatDateTime } from '../lib/clock';
import { formatMoney } from '../lib/money';
import { useRecentWinners, WINNERS_PAGE_SIZE } from '../wins/queries';
import { usePageTitle } from '../lib/usePageTitle';

/** Winners our team has confirmed, newest first. Phone numbers arrive with the middle digits hidden. */
export function WinnersPage() {
  usePageTitle('Recent winners');
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  const winners = useRecentWinners(page);
  const pages = winners.data ? Math.max(1, Math.ceil(winners.data.total / WINNERS_PAGE_SIZE)) : 1;

  const go = (next: number) => {
    setParams(next > 1 ? { page: String(next) } : {});
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Recent winners</h1>
      <p className="mt-1 text-sm text-slate-600">
        Each of them won with the lowest amount nobody else bid. Wins are listed once our team has confirmed
        them.
      </p>
      <div className="mt-5">
        {winners.isPending ? (
          <PageLoading label="Loading winners" />
        ) : winners.isError ? (
          <div className="space-y-3">
            <Alert>{errorMessage(winners.error)}</Alert>
            <Button variant="secondary" onClick={() => void winners.refetch()} busy={winners.isFetching}>
              Try again
            </Button>
          </div>
        ) : winners.data.items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-12 text-center text-slate-500">
            {page > 1 ? 'There is nothing on this page.' : 'No winners have been announced yet.'}
          </p>
        ) : (
          <ul className={cx('space-y-3', winners.isPlaceholderData && 'opacity-60')}>
            {winners.data.items.map((winner) => (
              <li key={winner.id}>
                <Card className="flex gap-3 p-4">
                  <ProductImage
                    url={winner.productImageUrl ?? undefined}
                    alt={winner.productName}
                    className="h-16 w-16 shrink-0 rounded-xl"
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold break-words">{winner.productName}</h2>
                    <p className="text-sm text-slate-600">
                      <span className="font-semibold text-slate-900">{winner.winnerLabel}</span> won with{' '}
                      <span className="font-semibold text-slate-900 tabular-nums">
                        {formatMoney(winner.amount, winner.currency)}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      <Link to={`/auctions/${winner.auctionId}`} className="text-brand-700 underline">
                        {winner.auctionTitle}
                      </Link>{' '}
                      · <time dateTime={winner.publishedAt}>{formatDateTime(winner.publishedAt)}</time>
                    </p>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {winners.data && <Pagination page={page} pages={pages} onChange={go} />}
      </div>
    </div>
  );
}
