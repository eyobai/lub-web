import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';

/**
 * A panel that slides up from the bottom on phones and sits in the middle on wider screens. The page behind does not
 * scroll, Escape and the backdrop close it, the keyboard starts in it and goes back where it was after.
 */
export function Sheet({
  title,
  icon,
  onClose,
  children,
  footer,
}: {
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Kept in view below the scrolling content: the main action. */
  footer?: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-4xl bg-[#fdfcfa] outline-none sm:rounded-4xl"
      >
        <div className="flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-5 pt-5 pb-4">
          <div className="flex items-center justify-between gap-3">
            <span
              aria-hidden="true"
              className={cx(
                'flex h-11 w-11 items-center justify-center rounded-full',
                icon ? 'bg-brand-50 text-brand-600' : 'invisible',
              )}
            >
              {icon}
            </span>
            <h2 id={titleId} className="text-center text-xl font-bold tracking-tight">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200/80 text-slate-700 hover:bg-slate-300/80"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
                className="h-5 w-5"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          {children}
        </div>
        {footer && (
          <div className="border-t border-slate-200 bg-[#fdfcfa] px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
