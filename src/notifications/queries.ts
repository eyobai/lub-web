import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '../api/client';
import type { components } from '../api/schema';
import { useAuth } from '../auth/useAuth';

export type Notification = components['schemas']['NotificationDto'];
export type NotificationPage = components['schemas']['NotificationPageDto'];
type UnreadCount = components['schemas']['UnreadCountDto'];

export const NOTIFICATIONS_PAGE_SIZE = 20;

export const notificationKeys = {
  all: (userId: string | undefined) => ['notifications', userId] as const,
  unread: (userId: string | undefined) => ['notifications', userId, 'unread'] as const,
  lists: (userId: string | undefined) => ['notifications', userId, 'list'] as const,
  list: (userId: string | undefined, page: number, unreadOnly: boolean) =>
    ['notifications', userId, 'list', page, unreadOnly] as const,
};

/** How many notifications are unread, for the badge. Not asked for while the account cannot use the site yet. */
export function useUnreadCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: notificationKeys.unread(user?.id),
    queryFn: () => unwrap(api.GET('/api/v1/notifications/unread-count')),
    enabled: !!user && !user.mustChangePassword,
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useNotifications(page: number, unreadOnly: boolean) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: notificationKeys.list(user?.id, page, unreadOnly),
    queryFn: async () => {
      const result = await unwrap(
        api.GET('/api/v1/notifications', {
          params: {
            query: { page, limit: NOTIFICATIONS_PAGE_SIZE, ...(unreadOnly ? { unreadOnly: true } : {}) },
          },
        }),
      );
      // Every page carries the full unread count, so the badge follows without a request of its own.
      queryClient.setQueryData<UnreadCount>(notificationKeys.unread(user?.id), { unread: result.unread });
      return result;
    },
    placeholderData: keepPreviousData,
    enabled: !!user,
    refetchInterval: 30_000,
  });
}

/** Marks one notification as read. The page and the badge change at once; the server is told behind it. */
export function useMarkRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST('/api/v1/notifications/{id}/read', { params: { path: { id } } })),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all(user?.id) });
      const readAt = new Date().toISOString();
      let wasUnread = false;
      queryClient.setQueriesData<NotificationPage>({ queryKey: notificationKeys.lists(user?.id) }, (page) => {
        if (!page) return page;
        const hit = page.items.find((item) => item.id === id && !item.read);
        if (!hit) return page;
        wasUnread = true;
        return {
          ...page,
          unread: Math.max(0, page.unread - 1),
          items: page.items.map((item) => (item === hit ? { ...item, read: true, readAt } : item)),
        };
      });
      if (wasUnread)
        queryClient.setQueryData<UnreadCount>(notificationKeys.unread(user?.id), (count) =>
          count ? { unread: Math.max(0, count.unread - 1) } : count,
        );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.all(user?.id) }),
  });
}

export function useMarkAllRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/notifications/read-all')),
    onSuccess: () => {
      queryClient.setQueryData<UnreadCount>(notificationKeys.unread(user?.id), { unread: 0 });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.all(user?.id) }),
  });
}
