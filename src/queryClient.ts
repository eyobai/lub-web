import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 10_000, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}
