import { useSyncExternalStore } from 'react';
import { language } from './i18n';

/** The site's language, re-rendering when it changes. */
export function useLanguage() {
  return useSyncExternalStore(language.subscribe, language.get);
}
