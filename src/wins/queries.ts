import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '../api/client';
import type { components } from '../api/schema';
import { useAuth } from '../auth/useAuth';

export type MyWin = components['schemas']['MyWinDto'];
export type MyWinPage = components['schemas']['MyWinPageDto'];
export type PublicWinner = components['schemas']['PublicWinnerDto'];
export type DeliveryDetails = components['schemas']['SubmitDeliveryDetailsDto'];

export const WINS_PAGE_SIZE = 20;
export const WINNERS_PAGE_SIZE = 20;

export const winKeys = {
  all: (userId: string | undefined) => ['wins', userId] as const,
  list: (userId: string | undefined, page: number) => ['wins', userId, 'list', page] as const,
};

export function useMyWins(page: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: winKeys.list(user?.id, page),
    queryFn: () =>
      unwrap(api.GET('/api/v1/winners/mine', { params: { query: { page, limit: WINS_PAGE_SIZE } } })),
    placeholderData: keepPreviousData,
    enabled: !!user,
    // Staff confirm the win and move the delivery along while this page is open.
    refetchInterval: 60_000,
  });
}

export function useSubmitDeliveryDetails() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ winId, details }: { winId: string; details: DeliveryDetails }) =>
      unwrap(
        api.PUT('/api/v1/winners/mine/{id}/delivery-details', {
          params: { path: { id: winId } },
          body: details,
        }),
      ),
    onSuccess: (win) => {
      queryClient.setQueriesData<MyWinPage>({ queryKey: winKeys.all(user?.id) }, (page) =>
        page ? { ...page, items: page.items.map((item) => (item.id === win.id ? win : item)) } : page,
      );
    },
    // Also after a refusal: it usually means staff changed the delivery since the page loaded.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: winKeys.all(user?.id) }),
  });
}

/** Winners staff have confirmed and published. Public. */
export function useRecentWinners(page: number) {
  return useQuery({
    queryKey: ['winners', page],
    queryFn: () =>
      unwrap(api.GET('/api/v1/winners', { params: { query: { page, limit: WINNERS_PAGE_SIZE } } })),
    placeholderData: keepPreviousData,
  });
}
