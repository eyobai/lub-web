import { useSyncExternalStore, type ReactNode } from 'react';
import { language } from './i18n';

/**
 * Re-renders the site in the new language. The pages are mounted again (their typing is lost, which is fine for a
 * language switch); the session and loaded data are kept, as they live above this.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(language.subscribe, language.get);
  return (
    <div key={lang} className="contents">
      {children}
    </div>
  );
}
