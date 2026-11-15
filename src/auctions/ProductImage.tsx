import { useState } from 'react';
import { cx } from '../lib/cx';

/** Product images are links an admin entered; only http(s) ones are loaded, and a broken one shows a placeholder. */
function safeUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function ProductImage({ url, alt, className }: { url?: string; alt: string; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const src = safeUrl(url);
  if (!src || failedUrl === src) {
    return (
      <div
        className={cx('flex items-center justify-center bg-slate-100 text-slate-400', className)}
        role="img"
        aria-label={alt}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-10 w-10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10" r="1.5" />
          <path d="m21 16-5-5-8 8" />
        </svg>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(src)}
      className={cx('bg-slate-100 object-cover', className)}
    />
  );
}
