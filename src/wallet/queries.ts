import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, unwrap } from '../api/client';
import type { components } from '../api/schema';
import { useAuth } from '../auth/useAuth';

export type Wallet = components['schemas']['WalletDto'];
export type WalletTransaction = components['schemas']['WalletTransactionDto'];

export const walletKeys = {
  all: (userId: string | undefined) => ['wallet', userId] as const,
  balance: (userId: string | undefined) => ['wallet', userId, 'balance'] as const,
  transactions: (userId: string | undefined) => ['wallet', userId, 'transactions'] as const,
};

/** The signed-in user's wallet. Not asked for while the account cannot use the site yet. */
export function useWallet() {
  const { user } = useAuth();
  return useQuery({
    queryKey: walletKeys.balance(user?.id),
    queryFn: () => unwrap(api.GET('/api/v1/wallet')),
    enabled: !!user && !user.mustChangePassword,
    // Money can arrive from outside this page (support credits it, a refund is paid).
    refetchInterval: 60_000,
  });
}

export function useWalletTransactions() {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: walletKeys.transactions(user?.id),
    queryFn: ({ pageParam }) =>
      unwrap(api.GET('/api/v1/wallet/transactions', { params: { query: { limit: 20, cursor: pageParam } } })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!user,
  });
}
