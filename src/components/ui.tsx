import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cx } from '../lib/cx';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60';
const BUTTON_VARIANTS = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-100',
  danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
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
        {!rest.required && <span className="font-normal text-slate-500"> (optional)</span>}
      </label>
      <input
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          'block w-full rounded-lg border bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400',
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
      className={cx('rounded-lg border px-4 py-3 text-sm', ALERT_TONES[tone])}
    >
      {children}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-2xl border border-slate-200 bg-white shadow-sm', className)}>{children}</div>
  );
}

export function PageLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-slate-500">
      <Spinner />
      <span>{label}…</span>
    </div>
  );
}
