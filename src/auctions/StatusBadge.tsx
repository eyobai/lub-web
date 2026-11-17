import { cx } from '../lib/cx';
import type { Auction } from './queries';
import { t, tk } from '../i18n/i18n';

const STATUS: Record<Auction['status'], { label: string; className: string }> = {
  DRAFT: { label: tk('Draft'), className: 'bg-slate-200 text-slate-700' },
  SCHEDULED: { label: tk('Upcoming'), className: 'bg-white text-slate-900 ring-1 ring-slate-200' },
  ACTIVE: { label: tk('Live'), className: 'bg-brand-500 text-ink' },
  CLOSING: { label: tk('Closing'), className: 'bg-ink text-white' },
  COMPLETED: { label: tk('Ended'), className: 'bg-slate-200 text-slate-700' },
  CANCELLED: { label: tk('Cancelled'), className: 'bg-red-600 text-white' },
};

export function StatusBadge({ status, className }: { status: Auction['status']; className?: string }) {
  const { label, className: tone } = STATUS[status];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.7rem] font-bold tracking-wide uppercase',
        tone,
        className,
      )}
    >
      {status === 'ACTIVE' && (
        <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink" />
      )}
      {t(label)}
    </span>
  );
}
