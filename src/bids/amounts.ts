import { toMinor } from '../lib/money';

/** The part of an auction that decides which amounts may be bid. */
export interface BidRules {
  minorUnits: number;
  minBidMinor: string;
  maxBidMinor: string;
  bidStepMinor: string;
}

export type AmountProblem = 'format' | 'below' | 'above' | 'step';

export type ParsedAmount = { ok: true; minor: bigint } | { ok: false; problem: AmountProblem };

/** Checks one typed amount against the auction's range and step. The server checks again; this is for fast feedback. */
export function parseBidAmount(input: string, rules: BidRules): ParsedAmount {
  const minor = toMinor(input, rules.minorUnits);
  if (minor === null) return { ok: false, problem: 'format' };
  const min = BigInt(rules.minBidMinor);
  if (minor < min) return { ok: false, problem: 'below' };
  if (minor > BigInt(rules.maxBidMinor)) return { ok: false, problem: 'above' };
  if ((minor - min) % BigInt(rules.bidStepMinor) !== 0n) return { ok: false, problem: 'step' };
  return { ok: true, minor };
}

export function sortAmounts(amounts: Iterable<bigint>): bigint[] {
  return [...amounts].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * A key the server uses to recognise a repeated request, so a retry cannot charge twice.
 * `randomUUID` only exists on secure pages; the fallback covers plain-http test set-ups.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
