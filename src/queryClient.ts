import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 10_000, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}

/** First key of every query that is the same for everyone. All others belong to the signed-in user. */
export const PUBLIC_QUERIES: readonly unknown[] = ['auctions', 'winners'];
