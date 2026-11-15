import { ApiError } from '../api/errors';
import type { components } from '../api/schema';
import { config } from '../config';

export type AuthUser = components['schemas']['AuthUserDto'];
type TokenPair = components['schemas']['TokenPairDto'];

export interface Session {
  user: AuthUser;
  accessToken: string;
  /** Milliseconds since the epoch, by this device's clock. */
  accessExpiresAt: number;
  refreshToken: string;
}

/** Why a session ended without the user asking for it. */
export type SignOutReason = 'expired' | 'suspended' | 'blocked';

const STORAGE_KEY = 'lub.session';
const REFRESH_LOCK = 'lub.session.refresh';
/** A token this close to expiry is renewed first, so it cannot expire on its way to the server. */
const EXPIRY_MARGIN_MS = 30_000;

type Listener = () => void;
const listeners = new Set<Listener>();
let current: Session | null = read();
let lastSignOutReason: SignOutReason | null = null;
let refreshing: Promise<string | null> | null = null;
/** False once browser storage refused a write; the session then lives in this tab's memory only. */
let persisted = true;

function read(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const value = raw ? (JSON.parse(raw) as Partial<Session>) : null;
    return value?.user && value.accessToken && value.refreshToken && typeof value.accessExpiresAt === 'number'
      ? (value as Session)
      : null;
  } catch {
    return null;
  }
}

function write(next: Session | null): void {
  current = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
    persisted = true;
  } catch {
    persisted = false;
  }
  listeners.forEach((listener) => listener());
}

function withTokens(user: AuthUser, tokens: TokenPair): Session {
  return {
    user,
    accessToken: tokens.accessToken,
    accessExpiresAt: Date.now() + tokens.expiresIn * 1000,
    refreshToken: tokens.refreshToken,
  };
}

function isFresh(s: Session): boolean {
  return s.accessExpiresAt - Date.now() > EXPIRY_MARGIN_MS;
}

/** Runs `fn` while no other tab of this site is running it, so two tabs never spend the same refresh token. */
function exclusively<T>(fn: () => Promise<T>): Promise<T> {
  return typeof navigator !== 'undefined' && navigator.locks
    ? (navigator.locks.request(REFRESH_LOCK, fn) as Promise<T>)
    : fn();
}

async function rotate(rejected?: string): Promise<string | null> {
  return exclusively(async () => {
    // Another tab may have renewed or ended the session while this one waited.
    if (persisted) current = read();
    if (!current) return null;
    if (current.accessToken !== rejected && isFresh(current)) return current.accessToken;

    let response: Response;
    try {
      response = await fetch(`${config.apiBaseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
    } catch {
      throw ApiError.network();
    }
    const body: unknown = await response.json().catch(() => null);
    if (response.ok) {
      write(withTokens(current.user, body as TokenPair));
      return current.accessToken;
    }
    const error = ApiError.fromBody(response.status, body);
    // Only a definite refusal ends the session; a busy or unreachable server must not sign anyone out.
    if (response.status === 401 || response.status === 403) {
      end(
        error.code === 'ACCOUNT_BLOCKED'
          ? 'blocked'
          : error.code === 'ACCOUNT_SUSPENDED'
            ? 'suspended'
            : 'expired',
      );
      return null;
    }
    throw error;
  });
}

function end(reason: SignOutReason | null): void {
  lastSignOutReason = reason;
  write(null);
}

export const session = {
  get: (): Session | null => current,

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Stores the result of signing in, registering or changing the password. */
  start(user: AuthUser, tokens: TokenPair): void {
    lastSignOutReason = null;
    write(withTokens(user, tokens));
  },

  setUser(user: AuthUser): void {
    if (current) write({ ...current, user });
  },

  requirePasswordChange(): void {
    if (current && !current.user.mustChangePassword)
      write({ ...current, user: { ...current.user, mustChangePassword: true } });
  },

  end,

  /** Reason the last session ended on its own; read once to show the user why they must sign in again. */
  takeSignOutReason(): SignOutReason | null {
    const reason = lastSignOutReason;
    lastSignOutReason = null;
    return reason;
  },

  /**
   * A usable access token, renewed first when needed; null when nobody is signed in. Pass the token the server
   * just refused as `rejected` to force a renewal. Concurrent callers share one renewal.
   */
  async accessToken(rejected?: string): Promise<string | null> {
    if (!current) return null;
    if (current.accessToken !== rejected && isFresh(current)) return current.accessToken;
    refreshing ??= rotate(rejected).finally(() => {
      refreshing = null;
    });
    return refreshing;
  },
};

// Signing in or out in one tab applies to the others.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    current = read();
    listeners.forEach((listener) => listener());
  });
}
