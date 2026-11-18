import { useId } from 'react';
import { Link } from 'react-router-dom';
import { PayAndBidButton } from '../bids/PayAndBid';
import { formatDateTime } from '../lib/clock';
import { formatMoney } from '../lib/money';
import { Countdown } from './Countdown';
import { ProductImage } from './ProductImage';
import type { Auction } from './queries';
import { StatusBadge } from './StatusBadge';
import { t } from '../i18n/i18n';

export function AuctionCard({ auction }: { auction: Auction }) {
  const image = auction.product.images[0];
  const titleId = useId();
  return (
    // Not a link: on a live auction "Pay & bid" is the one thing to do, and a second way in confused people.
    <article
      aria-labelledby={titleId}
      className="flex flex-col overflow-hidden rounded-4xl bg-white p-2 shadow-[0_1px_2px_rgb(22_21_19/0.04)]"
    >
      <div className="relative overflow-hidden rounded-3xl">
        <ProductImage
          url={image?.url}
          alt={image?.altText ?? auction.product.name}
          className="aspect-[16/10] w-full"
        />
        <div className="absolute top-3 left-3">
          <StatusBadge status={auction.status} />
        </div>
        <div className="absolute right-3 bottom-3 rounded-2xl bg-ink/90 px-3 py-1.5 text-right text-white">
          <p className="text-[0.65rem] text-white/70">{t('Fee per bid')}</p>
          <p className="text-base leading-tight font-bold tabular-nums">
            {formatMoney(auction.bidFee, auction.currency)}
          </p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-3 pt-3 pb-2">
        <div>
          <h2 id={titleId} className="line-clamp-2 text-lg leading-snug font-bold text-ink">
            {auction.title}
          </h2>
        </div>
        <dl className="mt-auto flex flex-wrap items-center gap-2 text-sm">
          <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5">
            <dt className="sr-only">{t('Bids placed')}</dt>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
              className="h-4 w-4 text-brand-600"
            >
              <path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 0 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1zm10-4v2m0 4v2m0 4v2" />
            </svg>
            <dd className="font-semibold tabular-nums">
              {auction.totalBidCount.toLocaleString()}
              <span className="font-normal text-slate-500">
                {' '}
                {auction.totalBidCount === 1 ? t('bid') : t('bids')}
              </span>
            </dd>
          </div>
          <AuctionTiming auction={auction} />
        </dl>
      </div>
      {auction.status === 'ACTIVE' ? (
        <div className="px-3 pt-1 pb-3">
          <PayAndBidButton auction={auction} />
          <p className="mt-2 text-center text-xs text-slate-500">{t('Bid fee is non-refundable')}</p>
        </div>
      ) : (
        // No bidding here, so the only way on is to the auction's page (its result, or when it opens).
        <div className="px-3 pt-1 pb-3">
          <Link
            to={`/auctions/${auction.id}`}
            className="block rounded-full bg-slate-100 px-5 py-3 text-center text-sm font-semibold text-slate-800 hover:bg-slate-200"
          >
            {t('See details')}
          </Link>
        </div>
      )}
    </article>
  );
}

const CLOCK = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
    className="h-4 w-4 shrink-0"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

/** A running auction counts down to its close, an upcoming one to its opening: a small pill beside the bid count. */
function AuctionTiming({ auction }: { auction: Auction }) {
  const upcoming = auction.status === 'SCHEDULED';
  if (auction.status === 'ACTIVE' || upcoming) {
    const until = upcoming ? auction.opensAt : auction.closesAt;
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5">
        <span className="text-brand-600">{CLOCK}</span>
        <dt className="text-xs text-brand-700">{upcoming ? t('Opens in') : t('Closes in')}</dt>
        <dd className="font-semibold whitespace-nowrap text-ink">
          <Countdown until={until} />
        </dd>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-slate-500">
      {CLOCK}
      <dt>{auction.status === 'CLOSING' ? t('Bidding closed') : t('Ended')}</dt>
      <dd>
        <time dateTime={auction.closesAt} className="font-semibold text-ink">
          {formatDateTime(auction.closesAt)}
        </time>
      </dd>
    </div>
  );
}
