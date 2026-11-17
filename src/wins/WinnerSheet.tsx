import { useMemo, useRef, useState } from 'react';
import { errorMessage } from '../api/errors';
import { ProductImage } from '../auctions/ProductImage';
import { Sheet } from '../components/Sheet';
import { Alert, Button, Spinner } from '../components/ui';
import { cx } from '../lib/cx';
import { formatDateTime } from '../lib/clock';
import { formatMoney } from '../lib/money';
import { t, tCount } from '../i18n/i18n';
import { tRich } from '../i18n/rich';
import { useWinnerDetail, type PublicWinner, type WinnerDetail } from './queries';

type Order = 'amount' | 'picked';

export const TrophyIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.25"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0zm0 2H4a3 3 0 0 0 3 4m10-4h3a3 3 0 0 1-3 4" />
  </svg>
);

/** "1.06" without the currency, for the round badge. */
const bare = (amount: string) => formatMoney(amount, '').trim();

/**
 * One published win in full: the prize, the winner, and how many bids every amount got, so anyone can see the
 * winning amount was the lowest one bid exactly once. `summary` is the row from the list, shown while the rest loads.
 */
export function WinnerSheet({ summary, onClose }: { summary: PublicWinner; onClose: () => void }) {
  const detail = useWinnerDetail(summary.id);
  const w = summary;
  return (
    <Sheet title={t('Draw ended')} icon={<TrophyIcon className="h-5 w-5" />} onClose={onClose}>
      <ProductImage
        url={w.productImageUrl ?? undefined}
        alt={w.productName}
        className="aspect-[16/9] w-full rounded-3xl"
      />
      <div className="text-center">
        <h3 className="text-xl font-bold break-words">{w.productName}</h3>
        <p className="mt-1 text-sm text-slate-500">
          {tRich('Announced {date}', {
            date: <time dateTime={w.publishedAt}>{formatDateTime(w.publishedAt)}</time>,
          })}
        </p>
      </div>

      <div className="flex items-center gap-4 rounded-4xl bg-ink px-5 py-5 text-white">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-500 text-lg font-bold tabular-nums">
          {bare(w.amount)}
        </span>
        <div className="min-w-0">
          <p className="text-[0.7rem] font-semibold tracking-wide text-white/60 uppercase">
            {t('Winner · lowest unique bid amount')}
          </p>
          <p className="mt-1 font-semibold tabular-nums">{w.winnerLabel}</p>
          <p className="mt-1 truncate text-xs text-white/60">{w.auctionTitle}</p>
        </div>
      </div>

      {detail.isPending ? (
        <div role="status" className="flex items-center justify-center gap-3 py-10 text-slate-500">
          <Spinner />
          <span>{t('Loading the draw')}…</span>
        </div>
      ) : detail.isError ? (
        <div className="space-y-3">
          <Alert>{errorMessage(detail.error)}</Alert>
          <Button variant="secondary" onClick={() => void detail.refetch()} busy={detail.isFetching}>
            {t('Try again')}
          </Button>
        </div>
      ) : (
        <Breakdown detail={detail.data} />
      )}
    </Sheet>
  );
}

function Breakdown({ detail: d }: { detail: WinnerDetail }) {
  const [order, setOrder] = useState<Order>('amount');
  const winnerRow = useRef<HTMLLIElement>(null);
  const rows = useMemo(
    () =>
      order === 'amount'
        ? d.histogram
        : [...d.histogram].sort(
            (a, b) => b.count - a.count || (BigInt(a.amountMinor) < BigInt(b.amountMinor) ? -1 : 1),
          ),
    [d.histogram, order],
  );
  const most = Math.max(1, ...d.histogram.map((row) => row.count));

  return (
    <>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          [
            t('Bid fee'),
            <span key="fee" className="text-brand-600">
              {formatMoney(d.bidFee, d.currency)}
            </span>,
          ],
          [t('Total bids'), d.totalBids.toLocaleString()],
          [t('Unique amounts'), d.uniqueAmounts.toLocaleString()],
        ].map(([label, value], i) => (
          <div key={i} className="rounded-3xl bg-slate-100 px-2 py-3">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-0.5 truncate font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="breakdown-title" className="space-y-3">
        <h3 id="breakdown-title" className="text-lg font-bold">
          {t('Number breakdown')}
        </h3>
        <p className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-slate-100 px-3 py-1">
            {t('Different amounts: {count}', { count: d.distinctAmounts.toLocaleString() })}
          </span>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-brand-800">
            {t('Winning amount: {amount}', { amount: formatMoney(d.amount, d.currency) })}
          </span>
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="group" aria-label={t('Order')} className="flex gap-1 rounded-full bg-slate-200/80 p-1">
            {(
              [
                ['amount', t('By amount')],
                ['picked', t('Most picked')],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={order === key}
                onClick={() => setOrder(key)}
                className={cx(
                  'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                  order === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => winnerRow.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            {t('Show winning amount')}
          </button>
        </div>

        <ul className="space-y-2">
          {rows.map((row) => {
            const won = row.amountMinor === d.amountMinor;
            return (
              <li
                key={row.amountMinor}
                ref={won ? winnerRow : undefined}
                className={cx(
                  'relative overflow-hidden rounded-full',
                  won ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-slate-100',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx('absolute inset-y-0 left-0', won ? 'bg-brand-100' : 'bg-slate-200')}
                  style={{ width: `${(row.count / most) * 100}%` }}
                />
                <span className="relative flex items-center gap-2 px-5 py-3">
                  {won && <TrophyIcon className="h-4 w-4 shrink-0 text-brand-600" />}
                  <span className="font-semibold tabular-nums">{formatMoney(row.amount, d.currency)}</span>
                  {won ? (
                    <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[0.65rem] font-bold tracking-wide text-white uppercase">
                      {t('Winner')}
                    </span>
                  ) : (
                    row.count === 1 && (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[0.65rem] font-semibold text-slate-600">
                        {t('Unique')}
                      </span>
                    )
                  )}
                  <span className="ml-auto text-sm text-slate-700 tabular-nums">
                    {tCount(row.count, '{count} bid', '{count} bids')}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
