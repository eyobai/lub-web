import { useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/errors';
import { ProductImage } from '../auctions/ProductImage';
import { Alert, Button, Card, PageLoading, Pagination } from '../components/ui';
import { cx } from '../lib/cx';
import { formatDateTime } from '../lib/clock';
import { formatMoney } from '../lib/money';
import { useRecentWinners, WINNERS_PAGE_SIZE } from '../wins/queries';
import { TrophyIcon, WinnerSheet } from '../wins/WinnerSheet';
import { usePageTitle } from '../lib/usePageTitle';
import { t } from '../i18n/i18n';
import { tRich } from '../i18n/rich';

/** Winners our team has confirmed, newest first. Phone numbers arrive with the middle digits hidden. */
export function WinnersPage() {
  usePageTitle(t('Recent winners'));
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  const winners = useRecentWinners(page);
  const pages = winners.data ? Math.max(1, Math.ceil(winners.data.total / WINNERS_PAGE_SIZE)) : 1;

  const go = (next: number) => {
    setParams(next > 1 ? { page: String(next) } : {});
    window.scrollTo({ top: 0 });
  };
  // The open winner is in the address, so the details can be shared and Back closes them.
  const openId = params.get('winner');
  const open = winners.data?.items.find((w) => w.id === openId);
  const navigate = useNavigate();
  const pushed = useRef(false);
  const show = (id: string) => {
    pushed.current = true;
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set('winner', id);
      return next;
    });
  };
  const close = () => {
    if (pushed.current) {
      pushed.current = false;
      void navigate(-1);
      return;
    }
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('winner');
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">{t('Recent winners')}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {t(
          'Each of them won with the lowest amount nobody else bid. Wins are listed once our team has confirmed them.',
        )}
      </p>
      <div className="mt-5">
        {winners.isPending ? (
          <PageLoading label={t('Loading winners')} />
        ) : winners.isError ? (
          <div className="space-y-3">
            <Alert>{errorMessage(winners.error)}</Alert>
            <Button variant="secondary" onClick={() => void winners.refetch()} busy={winners.isFetching}>
              {t('Try again')}
            </Button>
          </div>
        ) : winners.data.items.length === 0 ? (
          <p className="rounded-4xl border border-dashed border-slate-300 px-4 py-12 text-center text-slate-500">
            {page > 1 ? t('There is nothing on this page.') : t('No winners have been announced yet.')}
          </p>
        ) : (
          <ul className={cx('space-y-4', winners.isPlaceholderData && 'opacity-60')}>
            {winners.data.items.map((winner) => (
              <li key={winner.id}>
                <Card className="overflow-hidden p-0">
                  <button
                    type="button"
                    onClick={() => show(winner.id)}
                    aria-label={t('See the draw for {product}', { product: winner.productName })}
                    className="block w-full rounded-3xl p-2 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="relative overflow-hidden rounded-3xl">
                      <ProductImage
                        url={winner.productImageUrl ?? undefined}
                        alt={winner.productName}
                        className="aspect-[16/9] w-full"
                      />
                      <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-3 py-1 text-[0.7rem] font-bold tracking-wide text-white uppercase">
                        <TrophyIcon className="h-3.5 w-3.5" />
                        {t('Winner')}
                      </span>
                      <span
                        aria-hidden="true"
                        className="absolute right-3 bottom-3 rounded-2xl bg-ink/90 px-3 py-1.5 text-right text-white"
                      >
                        <span className="block text-[0.65rem] text-white/70">{t('Winning bid')}</span>
                        <span className="block text-lg leading-tight font-bold tabular-nums">
                          {formatMoney(winner.amount, winner.currency)}
                        </span>
                      </span>
                    </div>
                    <div className="min-w-0 space-y-2 px-3 pt-3 pb-2">
                      <h2 className="text-lg leading-snug font-bold break-words">{winner.productName}</h2>
                      <p className="text-sm text-slate-600">
                        {tRich('{winner} won with {amount}', {
                          winner: <span className="font-semibold text-slate-900">{winner.winnerLabel}</span>,
                          amount: (
                            <span className="font-semibold text-slate-900 tabular-nums">
                              {formatMoney(winner.amount, winner.currency)}
                            </span>
                          ),
                        })}
                      </p>
                      <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span>
                          {tRich('Announced {date}', {
                            date: (
                              <time dateTime={winner.publishedAt}>{formatDateTime(winner.publishedAt)}</time>
                            ),
                          })}
                        </span>
                        <span className="font-semibold text-brand-600">{t('See the draw')} →</span>
                      </p>
                    </div>
                  </button>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {winners.data && <Pagination page={page} pages={pages} onChange={go} />}
        {open && <WinnerSheet summary={open} onClose={close} />}
      </div>
    </div>
  );
}
