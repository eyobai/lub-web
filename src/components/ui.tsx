import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cx } from '../lib/cx';
import { t } from '../i18n/i18n';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const BUTTON_VARIANTS = {
  primary: 'bg-brand-500 text-white shadow-sm hover:bg-brand-600',
  dark: 'bg-ink text-white hover:bg-slate-800',
  secondary: 'bg-slate-200/80 text-slate-900 hover:bg-slate-300/80',
  danger: 'bg-red-50 text-red-700 hover:bg-red-100',
} as const;

type Variant = keyof typeof BUTTON_VARIANTS;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Shows a spinner and blocks further clicks. */
  busy?: boolean;
}

export function Button({
  variant = 'primary',
  busy = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy}
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)}
    >
      {busy && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = 'primary', className, ...rest }: LinkProps & { variant?: Variant }) {
  return <Link {...rest} className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} />;
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
}

/** A labelled input whose hint and error are announced with it. */
export function Field({ label, hint, error, className, ...rest }: FieldProps) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {!rest.required && <span className="font-normal text-slate-500"> {t('(optional)')}</span>}
      </label>
      <input
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          'block w-full rounded-2xl border bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none',
          error ? 'border-red-500' : 'border-slate-300',
        )}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

const ALERT_TONES = {
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
} as const;

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: keyof typeof ALERT_TONES;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('rounded-2xl border px-4 py-3 text-sm', ALERT_TONES[tone])}
    >
      {children}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cx(
        'rounded-3xl shadow-[0_1px_2px_rgb(22_21_19/0.04)]',
        // A card given its own background (a dark or tinted panel) does not also get the white one.
        !/(^|\s)bg-/.test(className ?? '') && 'bg-white',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageLoading({ label }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-slate-500">
      <Spinner />
      <span>{label ?? t('Loading')}…</span>
    </div>
  );
}

/** Previous / Next for lists the API serves a page at a time. */
export function Pagination({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  if (pages <= 1 && page <= 1) return null;
  return (
    <nav aria-label={t('Pages')} className="mt-6 flex items-center justify-between gap-3">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(Math.min(page - 1, pages))}>
        {t('Previous')}
      </Button>
      <span className="text-sm text-slate-600">{t('Page {page} of {pages}', { page, pages })}</span>
      <Button variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        {t('Next')}
      </Button>
    </nav>
  );
}
