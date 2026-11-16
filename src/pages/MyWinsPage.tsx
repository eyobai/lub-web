import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/errors';
import { ProductImage } from '../auctions/ProductImage';
import { Alert, Button, ButtonLink, Card, PageLoading, Pagination } from '../components/ui';
import { cx } from '../lib/cx';
import { formatDateTime } from '../lib/clock';
import { formatMoney } from '../lib/money';
import { DeliveryDetailsForm } from '../wins/DeliveryDetailsForm';
import { formatAddress, hasDeliveryDetails, STEPS, stepsDone, winStatus } from '../wins/delivery';
import { useMyWins, WINS_PAGE_SIZE, type MyWin } from '../wins/queries';
import { usePageTitle } from '../lib/usePageTitle';

const BADGE_TONES = {
  info: 'bg-sky-100 text-sky-900',
  warning: 'bg-amber-100 text-amber-900',
  success: 'bg-emerald-100 text-emerald-900',
  error: 'bg-red-100 text-red-800',
} as const;

export function MyWinsPage() {
  usePageTitle('My wins');
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  const wins = useMyWins(page);
  const pages = wins.data ? Math.max(1, Math.ceil(wins.data.total / WINS_PAGE_SIZE)) : 1;

  const go = (next: number) => {
    setParams(next > 1 ? { page: String(next) } : {});
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">My wins</h1>
      <div className="mt-5">
        {wins.isPending ? (
          <PageLoading label="Loading your wins" />
        ) : wins.isError ? (
          <div className="space-y-3">
            <Alert>{errorMessage(wins.error)}</Alert>
            <Button variant="secondary" onClick={() => void wins.refetch()} busy={wins.isFetching}>
              Try again
            </Button>
          </div>
        ) : wins.data.items.length === 0 ? (
          <div className="rounded-4xl border border-dashed border-slate-300 px-4 py-12 text-center">
            <p className="text-slate-500">
              {page > 1 ? 'There is nothing on this page.' : 'You have not won an auction yet.'}
            </p>
            {page === 1 && (
              <ButtonLink to="/" className="mt-4">
                See running auctions
              </ButtonLink>
            )}
          </div>
        ) : (
          <ul className={cx('space-y-4', wins.isPlaceholderData && 'opacity-60')}>
            {wins.data.items.map((win) => (
              <li key={win.id}>
                <WinCard win={win} />
              </li>
            ))}
          </ul>
        )}
        {wins.data && <Pagination page={page} pages={pages} onChange={go} />}
      </div>
    </div>
  );
}

function WinCard({ win }: { win: MyWin }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const status = winStatus(win);
  const done = stepsDone(win);
  const delivery = win.delivery;
  const headingId = `win-${win.id}`;

  return (
    <Card className="p-4">
      <article aria-labelledby={headingId}>
        <div className="flex gap-3">
          <ProductImage
            url={win.productImageUrl ?? undefined}
            alt={win.productName}
            className="h-16 w-16 shrink-0 rounded-2xl"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 id={headingId} className="font-semibold break-words">
                {win.productName}
              </h2>
              <span
                className={cx(
                  'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
                  BADGE_TONES[status.tone],
                )}
              >
                {status.label}
              </span>
            </div>
            <p className="text-sm text-slate-600">
              Won with{' '}
              <span className="font-semibold text-slate-900 tabular-nums">
                {formatMoney(win.amount, win.currency)}
              </span>{' '}
              in{' '}
              <Link
                to={`/auctions/${win.auctionId}`}
                className="font-semibold text-brand-700 hover:underline"
              >
                {win.auctionTitle}
              </Link>
            </p>
            <p className="text-xs text-slate-500">
              <time dateTime={win.createdAt}>{formatDateTime(win.createdAt)}</time>
            </p>
          </div>
        </div>

        <p className="mt-3 text-sm text-slate-700">{status.message}</p>

        {done !== null && (
          <ol aria-label="Progress" className="mt-3 space-y-1.5 text-sm">
            {STEPS.map((step, index) => {
              const state = index < done ? 'done' : index === done ? 'next' : 'later';
              return (
                <li
                  key={step.key}
                  aria-current={state === 'next' ? 'step' : undefined}
                  className={cx(
                    'flex items-center gap-2',
                    state === 'done' ? 'text-slate-900' : 'text-slate-500',
                    state === 'next' && 'font-semibold',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.65rem] font-bold',
                      state === 'done'
                        ? 'border-ink bg-ink text-white'
                        : state === 'next'
                          ? 'border-brand-500 text-brand-700'
                          : 'border-slate-300',
                    )}
                  >
                    {state === 'done' ? '✓' : index + 1}
                  </span>
                  {step.label}
                  <span className="sr-only">
                    {state === 'done' ? ' (done)' : state === 'next' ? ' (next)' : ''}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {delivery?.trackingInfo && (
          <p className="mt-3 rounded-2xl bg-slate-100 px-4 py-2 text-sm break-words">
            <span className="font-semibold">Tracking:</span> {delivery.trackingInfo}
          </p>
        )}

        {delivery && hasDeliveryDetails(win) && !editing && (
          <dl className="mt-3 grid gap-x-4 gap-y-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Recipient</dt>
              <dd className="font-semibold break-words">{delivery.recipientName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Phone</dt>
              <dd className="font-semibold">{delivery.recipientPhone}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Address</dt>
              <dd className="font-semibold break-words">
                {delivery.address && formatAddress(delivery.address)}
              </dd>
              {delivery.address?.landmark && (
                <dd className="break-words text-slate-600">Landmark: {delivery.address.landmark}</dd>
              )}
            </div>
          </dl>
        )}

        {saved && !editing && (
          <div className="mt-3">
            <Alert tone="success">Your delivery details were saved.</Alert>
          </div>
        )}

        {win.canEditDeliveryDetails &&
          (editing ? (
            <DeliveryDetailsForm
              win={win}
              onSaved={() => {
                setSaved(true);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <Button
              className="mt-3"
              variant={hasDeliveryDetails(win) ? 'secondary' : 'primary'}
              onClick={() => {
                setSaved(false);
                setEditing(true);
              }}
            >
              {hasDeliveryDetails(win) ? 'Change delivery details' : 'Send delivery details'}
            </Button>
          ))}
      </article>
    </Card>
  );
}
