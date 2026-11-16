import { Link } from 'react-router-dom';
import { formatDateTime } from '../lib/clock';
import { formatMoney } from '../lib/money';
import { Countdown } from './Countdown';
import { ProductImage } from './ProductImage';
import type { Auction } from './queries';
import { StatusBadge } from './StatusBadge';

export function AuctionCard({ auction }: { auction: Auction }) {
  const image = auction.product.images[0];
  return (
    <Link
      to={`/auctions/${auction.id}`}
      className="group flex flex-col overflow-hidden rounded-4xl bg-white p-2 shadow-[0_1px_2px_rgb(22_21_19/0.04)] transition-shadow hover:shadow-[0_8px_24px_rgb(22_21_19/0.08)]"
    >
      <div className="relative overflow-hidden rounded-3xl">
        <ProductImage
          url={image?.url}
          alt={image?.altText ?? auction.product.name}
          className="aspect-[16/10] w-full transition-transform duration-300 group-hover:scale-[1.02]"
        />
        <div className="absolute top-3 left-3">
          <StatusBadge status={auction.status} />
        </div>
        <div className="absolute right-3 bottom-3 rounded-2xl bg-ink/90 px-3 py-1.5 text-right text-white">
          <p className="text-[0.65rem] text-white/70">Fee per bid</p>
          <p className="text-base leading-tight font-bold tabular-nums">
            {formatMoney(auction.bidFee, auction.currency)}
          </p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-3 pt-3 pb-2">
        <div>
          <h2 className="line-clamp-2 text-lg leading-snug font-bold text-ink">{auction.title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Worth {formatMoney(auction.product.marketValue, auction.product.currency)}
          </p>
        </div>
        <dl className="mt-auto flex flex-wrap items-center gap-2 text-sm">
          <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5">
            <dt className="sr-only">Bids placed</dt>
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
                {auction.totalBidCount === 1 ? 'bid' : 'bids'}
              </span>
            </dd>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
              className="h-4 w-4 text-slate-500"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <AuctionTiming auction={auction} />
          </div>
        </dl>
      </div>
    </Link>
  );
}

function AuctionTiming({ auction }: { auction: Auction }) {
  switch (auction.status) {
    case 'ACTIVE':
      return (
        <>
          <dt className="text-slate-500">Closes in</dt>
          <dd className="font-semibold text-ink">
            <Countdown until={auction.closesAt} />
          </dd>
        </>
      );
    case 'SCHEDULED':
      return (
        <>
          <dt className="text-slate-500">Opens in</dt>
          <dd className="font-semibold text-ink">
            <Countdown until={auction.opensAt} />
          </dd>
        </>
      );
    default:
      return (
        <>
          <dt className="text-slate-500">{auction.status === 'CLOSING' ? 'Bidding closed' : 'Ended'}</dt>
          <dd className="font-semibold">{formatDateTime(auction.closesAt)}</dd>
        </>
      );
  }
}
