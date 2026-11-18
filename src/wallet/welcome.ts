/**
 * Whether this device should show the welcome popup: set when a sign-up gave the welcome bonus, cleared when the
 * popup is closed. Kept in session storage so a reload right after signing up still shows it, once.
 */
const KEY = 'leyubid.welcome';

export interface PendingWelcome {
  userId: string;
  amountMinor: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function load(): PendingWelcome | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Partial<PendingWelcome> | null;
    return saved && typeof saved.userId === 'string' && typeof saved.amountMinor === 'string'
      ? { userId: saved.userId, amountMinor: saved.amountMinor }
      : null;
  } catch {
    return null;
  }
}

let pending: PendingWelcome | null = typeof sessionStorage === 'undefined' ? null : load();

function set(next: PendingWelcome | null): void {
  pending = next;
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the popup still shows on this page; the gift is in the wallet either way.
  }
  listeners.forEach((l) => l());
}

export const welcome = {
  get: (): PendingWelcome | null => pending,
  remember: (userId: string, amountMinor: string) => set({ userId, amountMinor }),
  dismiss: () => set(null),
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
