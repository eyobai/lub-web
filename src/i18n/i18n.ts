import { am } from './am';

/** The languages of the site. English is what the code is written in; Amharic comes from {@link am}. */
export type Language = 'en' | 'am';
export const LANGUAGES: readonly Language[] = ['en', 'am'];

const STORAGE_KEY = 'lub.language';

type Listener = () => void;
const listeners = new Set<Listener>();

function initial(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'am') return saved;
  } catch {
    // Storage blocked: fall through to the browser's preference.
  }
  const preferred = typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : [];
  return preferred.some((l) => l?.toLowerCase().startsWith('am')) ? 'am' : 'en';
}

let current: Language = initial();
applyToDocument();

function applyToDocument(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}

export const language = {
  get: (): Language => current,
  set(next: Language): void {
    if (next === current) return;
    current = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not remembered on this device; still used for this visit.
    }
    applyToDocument();
    listeners.forEach((l) => l());
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export type Vars = Record<string, string | number>;

/**
 * The text in the current language. `key` is the English text itself, with `{name}` for values filled in from
 * `vars`; a sentence without an Amharic entry stays in English rather than showing a key.
 */
export function t(key: string, vars?: Vars): string {
  const text = current === 'am' ? (am[key] ?? key) : key;
  return vars
    ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match))
    : text;
}

/** The locale for dates and numbers. */
export const locale = (): string => (current === 'am' ? 'am-ET' : 'en-US');

/** A count with its noun: `count(3, '{count} bid', '{count} bids')`. Amharic has one form for both. */
export function tCount(n: number, one: string, many: string): string {
  return t(n === 1 ? one : many, { count: n.toLocaleString(locale()) });
}

/**
 * Marks English text that is translated later, where it is used (a table of messages, a label in a list): the text
 * stays English here, and `t()` turns it into the site's language when shown. The completeness test reads these too.
 */
export const tk = (key: string): string => key;
