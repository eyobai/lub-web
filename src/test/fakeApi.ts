import { vi } from 'vitest';
import type { components } from '../api/schema';

type Schemas = components['schemas'];

export interface RecordedCall {
  method: string;
  path: string;
  query: URLSearchParams;
  authorization: string | null;
  body: unknown;
}

type Reply = [status: number, body?: unknown];
type Handler = (call: RecordedCall) => Reply | Promise<Reply>;

/**
 * Replaces `fetch` with handlers keyed by "METHOD /path". A request with no handler fails the test with a
 * network error, like an unreachable server would.
 */
export function fakeApi(handlers: Record<string, Handler | Reply>) {
  const calls: RecordedCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const text = await request.text();
    const call: RecordedCall = {
      method: request.method,
      path: url.pathname,
      query: url.searchParams,
      authorization: request.headers.get('authorization'),
      body: text ? JSON.parse(text) : undefined,
    };
    calls.push(call);
    const handler = handlers[`${call.method} ${call.path}`];
    if (!handler) throw new TypeError(`No fake handler for ${call.method} ${call.path}`);
    const [status, body] = typeof handler === 'function' ? await handler(call) : handler;
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    callsTo: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key),
  };
}

export function apiError(statusCode: number, error: string, details?: Record<string, unknown>): Reply {
  return [
    statusCode,
    {
      statusCode,
      error,
      message: `server wording for ${error}`,
      details,
      path: '/x',
      requestId: 'req-1',
      timestamp: '2026-01-01T00:00:00.000Z',
    } satisfies Schemas['ErrorResponseDto'],
  ];
}

export function aUser(overrides: Partial<Schemas['AuthUserDto']> = {}): Schemas['AuthUserDto'] {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    phoneNumber: '+251911234567',
    phoneVerified: false,
    status: 'ACTIVE',
    roles: ['USER'],
    mustChangePassword: false,
    fullName: 'Abebe Kebede',
    email: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function tokens(name = 'one', expiresIn = 900): Schemas['TokenPairDto'] {
  return {
    accessToken: `access-${name}`,
    refreshToken: `refresh-${name}`,
    tokenType: 'Bearer',
    expiresIn,
    refreshExpiresIn: 2_592_000,
  };
}

export function anAuction(overrides: Partial<Schemas['AuctionDto']> = {}): Schemas['AuctionDto'] {
  const now = Date.now();
  return {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Samsung Galaxy A55 auction',
    description: 'Win a brand new phone.',
    status: 'ACTIVE',
    currency: 'ETB',
    minorUnits: 2,
    bidFeeMinor: '7500',
    bidFee: '75.00',
    minBidMinor: '100',
    minBid: '1.00',
    maxBidMinor: '100000',
    maxBid: '1000.00',
    bidStepMinor: '100',
    bidStep: '1.00',
    maxBidsPerUser: null,
    maxBidsPerRequest: 20,
    duplicateBidPolicy: 'REJECT_SAME_USER_SAME_AMOUNT',
    noUniqueBidPolicy: 'REFUND_BID_FEES',
    opensAt: new Date(now - 3_600_000).toISOString(),
    closesAt: new Date(now + 2 * 3_600_000).toISOString(),
    totalBidCount: 1234,
    product: {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Samsung Galaxy A55',
      description: null,
      brand: 'Samsung',
      model: 'SM-A556E',
      currency: 'ETB',
      marketValueMinor: '6500000',
      marketValue: '65000.00',
      specifications: { Storage: '256 GB', '5G': true, nested: { ignored: 1 } },
      images: [],
    },
    serverTime: new Date(now).toISOString(),
    ...overrides,
  };
}

export function aPage(items: Schemas['AuctionDto'][], total = items.length): Schemas['AuctionPageDto'] {
  return { items, total, page: 1, limit: 12 };
}
