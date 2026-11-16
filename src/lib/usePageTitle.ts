import { useEffect } from 'react';
import { config } from '../config';

/** Names the browser tab after the page. Without a title (the home page, or one still loading) it is the site name. */
export function usePageTitle(title?: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} · ${config.appName}` : config.appName;
  }, [title]);
}
