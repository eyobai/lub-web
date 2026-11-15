import { cx } from '../lib/cx';
import type { Auction } from './queries';

const STATUS: Record<Auction['status'], { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-slate-100 text-slate-700' },
  SCHEDULED: { label: 'Upcoming', className: 'bg-sky-100 text-sky-800' },
  ACTIVE: { label: 'Live', className: 'bg-emerald-100 text-emerald-800' },
  CLOSING: { label: 'Closing', className: 'bg-amber-100 text-amber-900' },
  COMPLETED: { label: 'Ended', className: 'bg-slate-200 text-slate-700' },
  CANCELLED: { label: 'Cancelled', className: 'bg-red-100 text-red-800' },
};

export function StatusBadge({ status }: { status: Auction['status'] }) {
  const { label, className } = STATUS[status];
  return (
    <span className={cx('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', className)}>
      {label}
    </span>
  );
}
