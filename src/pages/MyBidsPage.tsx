import { Link, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/errors';
import { StatusBadge } from '../auctions/StatusBadge';
import { MY_BIDS_PAGE_SIZE, useMyBids, type MyBid } from '../bids/queries';
import { Alert, Button, ButtonLink, Card, PageLoading, Pagination } from '../components/ui';
import { cx } from '../lib/cx';
import { formatDateTime } from '../lib/clock';
import { formatMoney } from '../lib/money';
import { usePageTitle } from '../lib/usePageTitle';
import { t, tCount } from '../i18n/i18n';

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

/** "4.50" → "4.5", "12.00" → "12": the amount alone, for the round marker beside each bid. */
function shortAmount(amount: string): string {
  return amount.includes('.') ? amount.replace(/\.?0+$/, '') : amount;
}

export function MyBidsPage() {
  usePageTitle(t('My bids'));
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
        <h1 className="text-2xl font-bold tracking-tight">{t('My bids')}</h1>
        <ButtonLink to="/wins" variant="dark">
          {t('My wins')}
        </ButtonLink>
      </div>
      {bids.data && bids.data.total > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-4xl bg-white px-6 py-4 shadow-[0_1px_2px_rgb(22_21_19/0.04)]">
          <div>
            <p aria-hidden="true" className="text-3xl font-bold tracking-tight text-ink tabular-nums">
              {bids.data.total.toLocaleString()}
            </p>
            <p className="text-sm text-slate-600">
              {tCount(
                bids.data.total,
                '{count} bid in total, newest first.',
                '{count} bids in total, newest first.',
              )}
            </p>
          </div>
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
              <path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 0 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1zm10-4v2m0 4v2m0 4v2" />
            </svg>
          </span>
        </div>
      )}

      <div className="mt-5">
        {bids.isPending ? (
          <PageLoading label={t('Loading your bids')} />
        ) : bids.isError ? (
          <div className="space-y-3">
            <Alert>{errorMessage(bids.error)}</Alert>
            <Button variant="secondary" onClick={() => void bids.refetch()} busy={bids.isFetching}>
              {t('Try again')}
            </Button>
          </div>
        ) : bids.data.items.length === 0 ? (
          <div className="rounded-4xl border border-dashed border-slate-300 px-4 py-12 text-center">
            <p className="text-slate-500">
              {page > 1 ? t('There is nothing on this page.') : t('You have not placed any bids yet.')}
            </p>
            {page === 1 && (
              <ButtonLink to="/" className="mt-4">
                {t('See running auctions')}
              </ButtonLink>
            )}
          </div>
        ) : (
          <ul className={cx('space-y-4', bids.isPlaceholderData && 'opacity-60')}>
            {byAuction(bids.data.items).map((group) => (
              <li key={group[0].id}>
                <Card className="p-2">
                  <div className="flex items-center justify-between gap-3 px-3 pt-2 pb-1">
                    <h2 className="min-w-0 font-bold">
                      <Link to={`/auctions/${group[0].auctionId}`} className="hover:underline">
                        {group[0].auctionTitle}
                      </Link>
                    </h2>
                    <StatusBadge status={group[0].auctionStatus} className="shrink-0" />
                  </div>
                  <ul className="text-sm">
                    {group.map((bid) => (
                      <li key={bid.id} className="flex items-center gap-3 rounded-3xl px-3 py-2">
                        <span
                          aria-hidden="true"
                          className="flex h-12 min-w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 px-2 text-base font-bold text-brand-700 tabular-nums"
                        >
                          {shortAmount(bid.amount)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold tabular-nums">
                            {formatMoney(bid.amount, bid.currency)}
                          </span>
                          <span className="block text-xs text-slate-500">
                            <time dateTime={bid.createdAt}>{formatDateTime(bid.createdAt)}</time> · {t('fee')}{' '}
                            <span className="tabular-nums">{formatMoney(bid.bidFee, bid.currency)}</span>
                          </span>
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
