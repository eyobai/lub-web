import { useEffect, useRef, useState } from 'react';
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

/**
 * A product picture. Until it has downloaded, its place shows a grey block with a moving shimmer, at the picture's
 * own size, so nothing jumps when it arrives; then the picture fades in. `className` sizes and rounds the whole box.
 */
export function ProductImage({ url, alt, className }: { url?: string; alt: string; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const img = useRef<HTMLImageElement>(null);
  const src = safeUrl(url);

  // A picture already in the browser's cache can finish before React listens for it: check once mounted.
  useEffect(() => {
    if (src && img.current?.complete && img.current.naturalWidth > 0) setLoadedUrl(src);
  }, [src]);

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

  const loaded = loadedUrl === src;
  return (
    <span className={cx('relative block overflow-hidden bg-slate-200', className)}>
      {!loaded && (
        <span aria-hidden="true" data-testid="image-skeleton" className="absolute inset-0 overflow-hidden">
          <span className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent motion-reduce:hidden" />
        </span>
      )}
      <img
        ref={img}
        src={src}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setLoadedUrl(src)}
        onError={() => setFailedUrl(src)}
        className={cx(
          'absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </span>
  );
}
