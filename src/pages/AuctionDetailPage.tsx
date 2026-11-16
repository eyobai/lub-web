import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { errorMessage, isApiError } from '../api/errors';
import { Countdown } from '../auctions/Countdown';
import { ProductImage } from '../auctions/ProductImage';
import { useAuction, useAuctionResult, type Auction, type AuctionResult } from '../auctions/queries';
import { StatusBadge } from '../auctions/StatusBadge';
import { useAuth } from '../auth/useAuth';
import { BidPanel } from '../bids/BidPanel';
import { MyAuctionBids } from '../bids/MyAuctionBids';
import { Alert, Button, ButtonLink, Card, PageLoading } from '../components/ui';
import { cx } from '../lib/cx';
import { formatDateTime } from '../lib/clock';
import { formatMoney } from '../lib/money';
import { usePageTitle } from '../lib/usePageTitle';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function AuctionDetailPage() {
  const { id = '' } = useParams();
  return UUID.test(id) ? <AuctionDetail key={id} id={id} /> : <NotFound />;
}

function NotFound() {
  usePageTitle('Auction not found');
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Auction not found</h1>
      <p className="mt-2 text-slate-600">It may have been removed, or the link is wrong.</p>
      <ButtonLink to="/" className="mt-6">
        See all auctions
      </ButtonLink>
    </div>
  );
}

function AuctionDetail({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const auction = useAuction(id);
  const over = auction.data?.status === 'COMPLETED';
  const result = useAuctionResult(id, over);
  const missing = auction.isError && isApiError(auction.error, 'NOT_FOUND', 'VALIDATION_FAILED');
  usePageTitle(auction.data?.title ?? (missing ? 'Auction not found' : null));

  if (auction.isPending) return <PageLoading label="Loading auction" />;
  if (auction.isError) {
    if (missing) return <NotFound />;
    return (
      <div className="space-y-3">
        <Alert>{errorMessage(auction.error)}</Alert>
        <Button variant="secondary" onClick={() => void auction.refetch()} busy={auction.isFetching}>
          Try again
        </Button>
      </div>
    );
  }

  const a = auction.data;
  // The status changes on the server when a countdown ends; ask again instead of waiting for the next poll.
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['auctions'] });

  return (
    <article>
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-[0_1px_2px_rgb(22_21_19/0.04)] hover:bg-slate-100"
      >
        <span aria-hidden="true">←</span> All auctions
      </Link>
      <div className="mt-3 grid gap-6 lg:grid-cols-2">
        <Gallery auction={a} />
        <div className="space-y-5">
          <header>
            <StatusBadge status={a.status} />
            <h1 className="mt-3 text-3xl leading-tight font-bold tracking-tight">{a.title}</h1>
            <p className="mt-1 text-slate-600">
              {[a.product.brand, a.product.model].filter(Boolean).join(' · ') || a.product.name}
              {' · '}worth {formatMoney(a.product.marketValue, a.product.currency)}
            </p>
          </header>

          <StatePanel auction={a} result={result.data} onElapsed={refresh} />
          {user && a.status === 'ACTIVE' && <BidPanel auction={a} />}
          {user && <MyAuctionBids auction={a} />}

          <Card className="p-5">
            <h2 className="font-bold">Bidding rules</h2>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Fact label="Fee per bid">{formatMoney(a.bidFee, a.currency)}</Fact>
              <Fact label="Bids placed">
                <span className="tabular-nums">{a.totalBidCount.toLocaleString()}</span>
              </Fact>
              <Fact label="Lowest allowed bid">{formatMoney(a.minBid, a.currency)}</Fact>
              <Fact label="Highest allowed bid">{formatMoney(a.maxBid, a.currency)}</Fact>
              <Fact label="Bids go up in steps of">{formatMoney(a.bidStep, a.currency)}</Fact>
              <Fact label="Bids per person">
                {a.maxBidsPerUser === null ? 'No limit' : a.maxBidsPerUser.toLocaleString()}
              </Fact>
              <Fact label="Opens">{formatDateTime(a.opensAt)}</Fact>
              <Fact label="Closes">{formatDateTime(a.closesAt)}</Fact>
            </dl>
            <p className="mt-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
              {noUniqueBidText(a)}
            </p>
          </Card>
        </div>
      </div>

      {(a.description || a.product.description) && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">About this auction</h2>
          {a.description && <p className="mt-2 whitespace-pre-line text-slate-700">{a.description}</p>}
          {a.product.description && (
            <p className="mt-2 whitespace-pre-line text-slate-700">{a.product.description}</p>
          )}
        </section>
      )}

      <Specifications specifications={a.product.specifications} />
    </article>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-100 px-4 py-2.5">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}

function noUniqueBidText(a: Auction): string {
  switch (a.noUniqueBidPolicy) {
    case 'REFUND_BID_FEES':
      return 'If no amount is bid exactly once, nobody wins and every bid fee is refunded.';
    case 'NO_WINNER':
      return 'If no amount is bid exactly once, nobody wins and bid fees are not refunded.';
    default:
      return 'The lowest amount that is bid exactly once wins.';
  }
}

function Gallery({ auction }: { auction: Auction }) {
  const images = [...auction.product.images].sort((x, y) => x.sortOrder - y.sortOrder);
  const [selected, setSelected] = useState(0);
  const current = images[Math.min(selected, Math.max(0, images.length - 1))];
  return (
    <div>
      <ProductImage
        url={current?.url}
        alt={current?.altText ?? auction.product.name}
        className="aspect-[4/3] w-full rounded-4xl"
      />
      {images.length > 1 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <li key={image.id}>
              <button
                type="button"
                onClick={() => setSelected(index)}
                aria-label={`Show picture ${index + 1} of ${images.length}`}
                aria-current={index === selected}
                className={cx(
                  'block overflow-hidden rounded-2xl border-2',
                  index === selected ? 'border-ink' : 'border-transparent',
                )}
              >
                <ProductImage url={image.url} alt="" className="h-16 w-20" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatePanel({
  auction: a,
  result,
  onElapsed,
}: {
  auction: Auction;
  result: AuctionResult | null | undefined;
  onElapsed: () => void;
}) {
  const { user } = useAuth();
  const location = useLocation();

  switch (a.status) {
    case 'ACTIVE':
      return (
        <Card className="bg-ink p-5 text-white">
          <p className="text-sm text-white/70">Closes in</p>
          <p className="text-4xl font-bold tracking-tight text-brand-400">
            <Countdown until={a.closesAt} onElapsed={onElapsed} />
          </p>
          {!user && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <ButtonLink to="/sign-in" state={{ from: location.pathname }}>
                Sign in to bid
              </ButtonLink>
              <Link
                to="/register"
                state={{ from: location.pathname }}
                className="text-sm font-semibold text-white underline decoration-brand-500 decoration-2 underline-offset-2"
              >
                Create an account
              </Link>
            </div>
          )}
        </Card>
      );
    case 'SCHEDULED':
      return (
        <Card className="p-5">
          <p className="text-sm text-slate-500">Bidding opens in</p>
          <p className="text-4xl font-bold tracking-tight text-ink">
            <Countdown until={a.opensAt} onElapsed={onElapsed} />
          </p>
        </Card>
      );
    case 'CLOSING':
      return (
        <Card className="bg-brand-50 p-5">
          <p className="font-semibold text-amber-900">Bidding has closed</p>
          <p className="mt-1 text-sm text-amber-900">
            The result is being worked out. This page updates by itself.
          </p>
        </Card>
      );
    case 'COMPLETED':
      return <ResultPanel result={result} />;
    default:
      return (
        <Card className="bg-red-50 p-5">
          <p className="font-semibold text-red-800">This auction was cancelled</p>
          <p className="mt-1 text-sm text-red-800">Bid fees are refunded to the bidders' wallets.</p>
        </Card>
      );
  }
}

function ResultPanel({ result }: { result: AuctionResult | null | undefined }) {
  if (!result) {
    return (
      <Card className="p-5">
        <p className="font-semibold">This auction has ended</p>
        <p className="mt-1 text-sm text-slate-600">The result will appear here shortly.</p>
      </Card>
    );
  }
  if (result.outcome === 'WINNER_FOUND' && result.winningAmount !== null) {
    return (
      <Card className="flex items-center gap-4 bg-ink p-5 text-white">
        <span
          aria-hidden="true"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-500 text-ink"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7"
          >
            <path d="M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0zm0 2H4a3 3 0 0 0 3 4m10-4h3a3 3 0 0 1-3 4" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-brand-400 uppercase">
            Winning bid: the lowest amount bid exactly once
          </p>
          <p className="text-3xl font-bold tracking-tight">
            {formatMoney(result.winningAmount, result.currency)}
          </p>
          <p className="text-sm text-white/70">Out of {result.totalBids.toLocaleString()} bids.</p>
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-5">
      <p className="font-semibold">This auction ended without a winner</p>
      <p className="mt-1 text-sm text-slate-600">
        {result.outcome === 'NO_BIDS'
          ? 'Nobody placed a bid.'
          : result.appliedNoUniquePolicy === 'REFUND_BID_FEES'
            ? result.bidFeesRefundedAt
              ? 'No amount was bid exactly once. Every bid fee was refunded.'
              : 'No amount was bid exactly once. Bid fees are being refunded.'
            : 'No amount was bid exactly once.'}
      </p>
    </Card>
  );
}

/** Specifications are free-form admin input: only plain values are shown, as text. */
function Specifications({ specifications }: { specifications: Auction['product']['specifications'] }) {
  const rows = Object.entries(specifications ?? {}).filter(
    (entry): entry is [string, string | number | boolean] =>
      ['string', 'number', 'boolean'].includes(typeof entry[1]) && entry[1] !== '',
  );
  if (rows.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Specifications</h2>
      <dl className="mt-2 divide-y divide-slate-100 rounded-3xl bg-white text-sm">
        {rows.map(([key, value]) => (
          <div key={key} className="grid grid-cols-3 gap-3 px-5 py-3">
            <dt className="text-slate-500">{key}</dt>
            <dd className="col-span-2 font-medium break-words">
              {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
