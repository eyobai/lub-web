import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, unwrap } from '../api/client';
import { isApiError } from '../api/errors';
import type { components } from '../api/schema';
import { serverClock } from '../lib/clock';
import { tk } from '../i18n/i18n';

export type Auction = components['schemas']['AuctionDto'];
export type AuctionResult = components['schemas']['AuctionResultDto'];

export const PAGE_SIZE = 12;

/** The public groupings of auctions, in the order a visitor cares about them. */
export const AUCTION_TABS = [
  { key: 'live', label: tk('Live'), status: 'ACTIVE', sort: 'closesAt', order: 'asc' },
  { key: 'upcoming', label: tk('Upcoming'), status: 'SCHEDULED', sort: 'opensAt', order: 'asc' },
  { key: 'ended', label: tk('Ended'), status: 'COMPLETED', sort: 'closesAt', order: 'desc' },
] as const;
export type AuctionTab = (typeof AUCTION_TABS)[number];

const retryUnlessRefused = (count: number, error: unknown) =>
  count < 2 && (!isApiError(error) || error.status === 0 || error.status === 429 || error.status >= 500);

export function useAuctions(tab: AuctionTab, page: number) {
  return useQuery({
    queryKey: ['auctions', 'list', tab.key, page],
    queryFn: async () => {
      const result = await unwrap(
        api.GET('/api/v1/auctions', {
          params: { query: { status: tab.status, sort: tab.sort, order: tab.order, page, limit: PAGE_SIZE } },
        }),
      );
      if (result.items[0]) serverClock.sync(result.items[0].serverTime);
      return result;
    },
    placeholderData: keepPreviousData,
    // Bid counts and statuses move while an auction runs.
    refetchInterval: tab.key === 'ended' ? false : 30_000,
    retry: retryUnlessRefused,
  });
}

export function useAuction(id: string) {
  return useQuery({
    queryKey: ['auctions', 'detail', id],
    queryFn: async () => {
      const auction = await unwrap(api.GET('/api/v1/auctions/{id}', { params: { path: { id } } }));
      serverClock.sync(auction.serverTime);
      return auction;
    },
    refetchInterval: (query) => {
      const auction = query.state.data;
      if (!auction) return false;
      const next =
        auction.status === 'SCHEDULED'
          ? auction.opensAt
          : auction.status === 'ACTIVE'
            ? auction.closesAt
            : null;
      // Poll quickly while a change is due: the opening or closing time has passed, or the result is being computed.
      if (auction.status === 'CLOSING' || (next && Date.parse(next) <= serverClock.now())) return 3_000;
      return next ? 15_000 : false;
    },
    retry: retryUnlessRefused,
  });
}

/** The published result, or null while it is not computed yet. Only asked for once the auction is over. */
export function useAuctionResult(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['auctions', 'result', id],
    queryFn: async (): Promise<AuctionResult | null> => {
      try {
        return await unwrap(api.GET('/api/v1/auctions/{id}/result', { params: { path: { id } } }));
      } catch (error) {
        if (isApiError(error, 'RESULT_NOT_AVAILABLE')) return null;
        throw error;
      }
    },
    enabled,
    refetchInterval: (query) => (query.state.data === null ? 5_000 : false),
    retry: retryUnlessRefused,
  });
}
