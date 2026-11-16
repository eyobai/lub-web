import { cx } from '../lib/cx';
import type { Auction } from './queries';

const STATUS: Record<Auction['status'], { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-slate-200 text-slate-700' },
  SCHEDULED: { label: 'Upcoming', className: 'bg-white text-slate-900 ring-1 ring-slate-200' },
  ACTIVE: { label: 'Live', className: 'bg-brand-500 text-ink' },
  CLOSING: { label: 'Closing', className: 'bg-ink text-white' },
  COMPLETED: { label: 'Ended', className: 'bg-slate-200 text-slate-700' },
  CANCELLED: { label: 'Cancelled', className: 'bg-red-600 text-white' },
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
      {label}
    </span>
  );
}
