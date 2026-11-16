import { useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/errors';
import { AuctionCard } from '../auctions/AuctionCard';
import { AUCTION_TABS, PAGE_SIZE, useAuctions, type AuctionTab } from '../auctions/queries';
import { Alert, Button, PageLoading, Pagination } from '../components/ui';
import { cx } from '../lib/cx';
import { usePageTitle } from '../lib/usePageTitle';

const EMPTY: Record<AuctionTab['key'], string> = {
  live: 'No auctions are running right now. Check the upcoming ones.',
  upcoming: 'No auctions are scheduled yet.',
  ended: 'No auctions have ended yet.',
};

export function AuctionListPage() {
  usePageTitle();
  const [params, setParams] = useSearchParams();
  const tab = AUCTION_TABS.find((t) => t.key === params.get('show')) ?? AUCTION_TABS[0];
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  const auctions = useAuctions(tab, page);
  const pages = auctions.data ? Math.max(1, Math.ceil(auctions.data.total / PAGE_SIZE)) : 1;

  const go = (nextTab: AuctionTab, nextPage: number) => {
    const next = new URLSearchParams();
    if (nextTab.key !== AUCTION_TABS[0].key) next.set('show', nextTab.key);
    if (nextPage > 1) next.set('page', String(nextPage));
    setParams(next);
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <section className="relative overflow-hidden rounded-4xl bg-ink px-6 py-7 text-white">
        <div
          aria-hidden="true"
          className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-brand-500/25 blur-2xl"
        />
        <p className="relative inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-3 py-1 text-[0.7rem] font-bold tracking-wide text-ink uppercase">
          How it works
        </p>
        <h1 className="relative mt-3 text-3xl font-bold tracking-tight">
          Lowest <span className="text-brand-400">unique</span> bid wins
        </h1>
        <p className="relative mt-2 max-w-xl text-sm text-white/70">
          Pick an amount nobody else picks. When the auction closes, the lowest amount that was bid exactly
          once wins the prize.
        </p>
      </section>

      <div role="tablist" aria-label="Auctions" className="mt-5 flex gap-1 rounded-full bg-slate-200/80 p-1">
        {AUCTION_TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={t.key === tab.key}
            onClick={() => go(t, 1)}
            className={cx(
              'flex-1 rounded-full px-3 py-2.5 text-sm font-semibold transition-colors',
              t.key === tab.key ? 'bg-ink text-white shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={tab.label} className="mt-5">
        {auctions.isPending ? (
          <PageLoading label="Loading auctions" />
        ) : auctions.isError ? (
          <div className="space-y-3">
            <Alert>{errorMessage(auctions.error)}</Alert>
            <Button variant="secondary" onClick={() => void auctions.refetch()} busy={auctions.isFetching}>
              Try again
            </Button>
          </div>
        ) : auctions.data.items.length === 0 ? (
          <p className="rounded-4xl border border-dashed border-slate-300 px-4 py-12 text-center text-slate-500">
            {page > 1 ? 'There is nothing on this page.' : EMPTY[tab.key]}
          </p>
        ) : (
          <ul
            className={cx(
              'grid gap-4 sm:grid-cols-2 lg:grid-cols-3',
              auctions.isPlaceholderData && 'opacity-60',
            )}
          >
            {auctions.data.items.map((auction) => (
              <li key={auction.id} className="flex">
                <div className="flex w-full flex-col [&>a]:flex-1">
                  <AuctionCard auction={auction} />
                </div>
              </li>
            ))}
          </ul>
        )}

        {auctions.data && <Pagination page={page} pages={pages} onChange={(next) => go(tab, next)} />}
      </div>
    </>
  );
}
