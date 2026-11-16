import { Link, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/errors';
import { Alert, Button, Card, PageLoading, Pagination } from '../components/ui';
import { cx } from '../lib/cx';
import { formatDateTime } from '../lib/clock';
import { notificationLink } from '../notifications/links';
import {
  NOTIFICATIONS_PAGE_SIZE,
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  type Notification,
} from '../notifications/queries';
import { usePageTitle } from '../lib/usePageTitle';

export function NotificationsPage() {
  usePageTitle('Notifications');
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  const unreadOnly = params.get('show') === 'unread';
  const notifications = useNotifications(page, unreadOnly);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const pages = notifications.data
    ? Math.max(1, Math.ceil(notifications.data.total / NOTIFICATIONS_PAGE_SIZE))
    : 1;
  const unread = notifications.data?.unread ?? 0;

  const go = (nextUnreadOnly: boolean, nextPage: number) => {
    const next = new URLSearchParams();
    if (nextUnreadOnly) next.set('show', 'unread');
    if (nextPage > 1) next.set('page', String(nextPage));
    setParams(next);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        {unread > 0 && (
          <Button variant="secondary" onClick={() => markAll.mutate()} busy={markAll.isPending}>
            Mark all as read
          </Button>
        )}
      </div>
      {notifications.data && (
        <p className="mt-1 text-sm text-slate-600">
          {unread === 0 ? 'You have read everything.' : `${unread.toLocaleString()} unread.`}
        </p>
      )}
      {(markAll.isError || markRead.isError) && (
        <div className="mt-3">
          <Alert>{errorMessage(markAll.error ?? markRead.error)}</Alert>
        </div>
      )}

      <div
        role="group"
        aria-label="Which notifications to show"
        className="mt-4 flex gap-1 rounded-full bg-slate-200/80 p-1"
      >
        {[
          { label: 'All', value: false },
          { label: 'Unread', value: true },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={option.value === unreadOnly}
            onClick={() => go(option.value, 1)}
            className={cx(
              'flex-1 rounded-full px-3 py-2.5 text-sm font-semibold transition-colors',
              option.value === unreadOnly
                ? 'bg-ink text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {notifications.isPending ? (
          <PageLoading label="Loading notifications" />
        ) : notifications.isError ? (
          <div className="space-y-3">
            <Alert>{errorMessage(notifications.error)}</Alert>
            <Button
              variant="secondary"
              onClick={() => void notifications.refetch()}
              busy={notifications.isFetching}
            >
              Try again
            </Button>
          </div>
        ) : notifications.data.items.length === 0 ? (
          <p className="rounded-4xl border border-dashed border-slate-300 px-4 py-12 text-center text-slate-500">
            {page > 1
              ? 'There is nothing on this page.'
              : unreadOnly
                ? 'You have no unread notifications.'
                : 'You have no notifications yet.'}
          </p>
        ) : (
          <Card>
            <ul className={cx('divide-y divide-slate-100', notifications.isPlaceholderData && 'opacity-60')}>
              {notifications.data.items.map((item) => (
                <li key={item.id}>
                  <NotificationRow item={item} onOpen={() => !item.read && markRead.mutate(item.id)} />
                </li>
              ))}
            </ul>
          </Card>
        )}
        {notifications.data && (
          <Pagination page={page} pages={pages} onChange={(next) => go(unreadOnly, next)} />
        )}
      </div>
    </div>
  );
}

/** Opening a notification marks it as read and, when it is about something, goes there. */
function NotificationRow({ item, onOpen }: { item: Notification; onOpen: () => void }) {
  const to = notificationLink(item);
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cx(
          'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
          item.read ? 'bg-transparent' : 'bg-brand-600',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className={cx('block', item.read ? 'font-medium text-slate-700' : 'font-bold text-slate-900')}>
          {item.title}
          {!item.read && <span className="sr-only"> (unread)</span>}
        </span>
        <span className="block text-sm break-words text-slate-600">{item.body}</span>
        <span className="block text-xs text-slate-500">
          <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
        </span>
      </span>
    </>
  );
  const className = cx(
    'flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50',
    !item.read && 'bg-brand-50/60',
  );
  if (to)
    return (
      <Link to={to} onClick={onOpen} className={className}>
        {content}
      </Link>
    );
  // Nothing to open: an unread one can still be marked as read; a read one is plain text.
  return item.read ? (
    <div className={className}>{content}</div>
  ) : (
    <button type="button" onClick={onOpen} className={className}>
      {content}
    </button>
  );
}
