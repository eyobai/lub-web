import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { api, unwrap } from '../api/client';
import { isApiError } from '../api/errors';
import type { components } from '../api/schema';
import { useAuth } from '../auth/useAuth';
import { walletKeys, type Wallet } from '../wallet/queries';
import { fromMinor } from '../lib/money';
import { newIdempotencyKey } from './amounts';

export type MyBid = components['schemas']['MyBidDto'];
export type BidSubmission = components['schemas']['BidSubmissionDto'];
export type MyAuctionResult = components['schemas']['MyAuctionResultDto'];

export const MY_BIDS_PAGE_SIZE = 20;
/** The most bids of one auction the API returns at once. */
export const AUCTION_BIDS_LIMIT = 100;

export const bidKeys = {
  all: (userId: string | undefined) => ['bids', userId] as const,
  list: (userId: string | undefined, page: number) => ['bids', userId, 'list', page] as const,
  inAuction: (userId: string | undefined, auctionId: string) =>
    ['bids', userId, 'auction', auctionId] as const,
  result: (userId: string | undefined, auctionId: string) => ['bids', userId, 'result', auctionId] as const,
};

export function useMyBids(page: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: bidKeys.list(user?.id, page),
    queryFn: () =>
      unwrap(api.GET('/api/v1/bids/mine', { params: { query: { page, limit: MY_BIDS_PAGE_SIZE } } })),
    placeholderData: keepPreviousData,
    enabled: !!user,
  });
}

/** My bids in one auction, newest first (at most AUCTION_BIDS_LIMIT of them; `total` is the full count). */
export function useMyBidsInAuction(auctionId: string, enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: bidKeys.inAuction(user?.id, auctionId),
    queryFn: () =>
      unwrap(api.GET('/api/v1/bids/mine', { params: { query: { auctionId, limit: AUCTION_BIDS_LIMIT } } })),
    enabled: enabled && !!user,
  });
}

/** How my bids did, or null while the result is not computed yet. */
export function useMyAuctionResult(auctionId: string, enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: bidKeys.result(user?.id, auctionId),
    queryFn: async (): Promise<MyAuctionResult | null> => {
      try {
        return await unwrap(
          api.GET('/api/v1/auctions/{id}/result/mine', { params: { path: { id: auctionId } } }),
        );
      } catch (error) {
        if (isApiError(error, 'RESULT_NOT_AVAILABLE')) return null;
        throw error;
      }
    },
    enabled: enabled && !!user,
    refetchInterval: (query) => (query.state.data === null ? 5_000 : false),
  });
}

/**
 * Places bids. A request whose answer never arrived (lost connection, server error) is sent again with the
 * same key when the user retries the same amounts, so the server returns the first outcome and charges once.
 */
export function usePlaceBids(auctionId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const attempt = useRef<{ key: string; amounts: string } | null>(null);

  return useMutation({
    mutationFn: async (amountsMinor: string[]): Promise<BidSubmission> => {
      const amounts = amountsMinor.join(',');
      if (attempt.current?.amounts !== amounts) attempt.current = { key: newIdempotencyKey(), amounts };
      try {
        const submission = await unwrap(
          api.POST('/api/v1/auctions/{id}/bids', {
            params: { path: { id: auctionId }, header: { 'Idempotency-Key': attempt.current.key } },
            body: { amountsMinor },
          }),
        );
        // Done: the same amounts sent again later are a new request, not a retry.
        attempt.current = null;
        return submission;
      } catch (error) {
        if (!isUnconfirmed(error)) attempt.current = null;
        throw error;
      }
    },
    onSuccess: (submission) => {
      const spendableMinor = BigInt(submission.walletAvailableMinor) + BigInt(submission.walletBonusMinor);
      queryClient.setQueryData<Wallet>(walletKeys.balance(user?.id), (wallet) =>
        wallet && wallet.currency === submission.currency
          ? {
              ...wallet,
              availableMinor: submission.walletAvailableMinor,
              available: submission.walletAvailable,
              bonusMinor: submission.walletBonusMinor,
              bonus: submission.walletBonus,
              spendableMinor: spendableMinor.toString(),
              spendable: fromMinor(spendableMinor, submission.minorUnits),
            }
          : wallet,
      );
    },
    // Also after a failure: an answer that got lost may still have placed the bids.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: walletKeys.all(user?.id) });
      void queryClient.invalidateQueries({ queryKey: bidKeys.all(user?.id) });
      void queryClient.invalidateQueries({ queryKey: ['auctions'] });
    },
  });
}

/** True when the request may have been carried out although no answer came back. */
export function isUnconfirmed(error: unknown): boolean {
  return !isApiError(error) || error.status === 0 || error.status >= 500;
}
