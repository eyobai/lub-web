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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function AuctionDetailPage() {
  const { id = '' } = useParams();
  return UUID.test(id) ? <AuctionDetail key={id} id={id} /> : <NotFound />;
}

function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">Auction not found</h1>
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

  if (auction.isPending) return <PageLoading label="Loading auction" />;
  if (auction.isError) {
    if (isApiError(auction.error, 'NOT_FOUND', 'VALIDATION_FAILED')) return <NotFound />;
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
      <Link to="/" className="text-sm font-medium text-brand-700 hover:underline">
        ← All auctions
      </Link>
      <div className="mt-3 grid gap-6 lg:grid-cols-2">
        <Gallery auction={a} />
        <div className="space-y-5">
          <header>
            <StatusBadge status={a.status} />
            <h1 className="mt-2 text-2xl font-bold">{a.title}</h1>
            <p className="mt-1 text-slate-600">
              {[a.product.brand, a.product.model].filter(Boolean).join(' · ') || a.product.name}
              {' · '}worth {formatMoney(a.product.marketValue, a.product.currency)}
            </p>
          </header>

          <StatePanel auction={a} result={result.data} onElapsed={refresh} />
          {user && a.status === 'ACTIVE' && <BidPanel auction={a} />}
          {user && <MyAuctionBids auction={a} />}

          <Card className="p-4">
            <h2 className="font-semibold">Bidding rules</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
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
            <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">{noUniqueBidText(a)}</p>
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
    <div>
      <dt className="text-slate-500">{label}</dt>
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
        className="aspect-[4/3] w-full rounded-2xl border border-slate-200"
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
                  'block overflow-hidden rounded-lg border-2',
                  index === selected ? 'border-brand-600' : 'border-transparent',
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
        <Card className="border-brand-100 bg-brand-50 p-4">
          <p className="text-sm text-brand-800">Closes in</p>
          <p className="text-3xl font-bold text-brand-800">
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
                className="text-sm font-semibold text-brand-700 hover:underline"
              >
                Create an account
              </Link>
            </div>
          )}
        </Card>
      );
    case 'SCHEDULED':
      return (
        <Card className="border-sky-100 bg-sky-50 p-4">
          <p className="text-sm text-sky-900">Bidding opens in</p>
          <p className="text-3xl font-bold text-sky-900">
            <Countdown until={a.opensAt} onElapsed={onElapsed} />
          </p>
        </Card>
      );
    case 'CLOSING':
      return (
        <Card className="border-amber-200 bg-amber-50 p-4">
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
        <Card className="border-red-200 bg-red-50 p-4">
          <p className="font-semibold text-red-800">This auction was cancelled</p>
          <p className="mt-1 text-sm text-red-800">Bid fees are refunded to the bidders' wallets.</p>
        </Card>
      );
  }
}

function ResultPanel({ result }: { result: AuctionResult | null | undefined }) {
  if (!result) {
    return (
      <Card className="p-4">
        <p className="font-semibold">This auction has ended</p>
        <p className="mt-1 text-sm text-slate-600">The result will appear here shortly.</p>
      </Card>
    );
  }
  if (result.outcome === 'WINNER_FOUND' && result.winningAmount !== null) {
    return (
      <Card className="border-accent-400 bg-amber-50 p-4">
        <p className="text-sm text-amber-900">Winning bid: the lowest amount bid exactly once</p>
        <p className="text-3xl font-bold text-amber-900">
          {formatMoney(result.winningAmount, result.currency)}
        </p>
        <p className="mt-1 text-sm text-amber-900">Out of {result.totalBids.toLocaleString()} bids.</p>
      </Card>
    );
  }
  return (
    <Card className="p-4">
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
      <dl className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white text-sm">
        {rows.map(([key, value]) => (
          <div key={key} className="grid grid-cols-3 gap-3 px-4 py-2.5">
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
