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
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative">
        <ProductImage
          url={image?.url}
          alt={image?.altText ?? auction.product.name}
          className="aspect-[4/3] w-full"
        />
        <div className="absolute left-3 top-3">
          <StatusBadge status={auction.status} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h2 className="line-clamp-2 font-semibold text-slate-900 group-hover:text-brand-800">
            {auction.title}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Worth {formatMoney(auction.product.marketValue, auction.product.currency)}
          </p>
        </div>
        <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div>
            <dt className="text-slate-500">Fee per bid</dt>
            <dd className="font-semibold">{formatMoney(auction.bidFee, auction.currency)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Bids placed</dt>
            <dd className="font-semibold tabular-nums">{auction.totalBidCount.toLocaleString()}</dd>
          </div>
          <div className="col-span-2 rounded-lg bg-slate-50 px-3 py-2">
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
          <dd className="font-semibold text-brand-800">
            <Countdown until={auction.closesAt} />
          </dd>
        </>
      );
    case 'SCHEDULED':
      return (
        <>
          <dt className="text-slate-500">Opens in</dt>
          <dd className="font-semibold text-sky-800">
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
