import { vi } from 'vitest';
import type { components } from '../api/schema';

type Schemas = components['schemas'];

export interface RecordedCall {
  method: string;
  path: string;
  query: URLSearchParams;
  authorization: string | null;
  idempotencyKey: string | null;
  body: unknown;
}

type Reply = [status: number, body?: unknown];
type Handler = (call: RecordedCall) => Reply | Promise<Reply>;

/**
 * Replaces `fetch` with handlers keyed by "METHOD /path". A request with no handler fails the test with a
 * network error, like an unreachable server would.
 */
/** JSON bodies as objects; anything else (form data sent to Chapa) as its raw text. */
const parseBody = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

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
      idempotencyKey: request.headers.get('idempotency-key'),
      body: text ? parseBody(text) : undefined,
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

/** A wallet; `spendable` follows `available` + `bonus` unless given. */
export function aWallet(overrides: Partial<Schemas['WalletDto']> = {}): Schemas['WalletDto'] {
  const availableMinor = overrides.availableMinor ?? '100000';
  const bonusMinor = overrides.bonusMinor ?? '0';
  const spendableMinor = String(Number(availableMinor) + Number(bonusMinor));
  return {
    id: '44444444-4444-4444-8444-444444444444',
    userId: aUser().id,
    currency: 'ETB',
    minorUnits: 2,
    availableMinor: '100000',
    available: '1000.00',
    heldMinor: '0',
    held: '0.00',
    bonusMinor,
    bonus: major(bonusMinor),
    bonusExpiresAt: null,
    spendableMinor,
    spendable: major(spendableMinor),
    isFrozen: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

let sequence = 0;
const nextId = () => `55555555-5555-4555-8555-${String(++sequence).padStart(12, '0')}`;
const major = (minor: string) => `${minor.slice(0, -2) || '0'}.${minor.slice(-2).padStart(2, '0')}`;

export function aTransaction(
  overrides: Partial<Schemas['WalletTransactionDto']> = {},
): Schemas['WalletTransactionDto'] {
  const amountMinor = overrides.amountMinor ?? '7500';
  const balanceAfterMinor = overrides.balanceAfterMinor ?? '92500';
  return {
    id: nextId(),
    reference: `TXN-${sequence}`,
    type: 'BID_FEE',
    status: 'POSTED',
    direction: 'DEBIT',
    currency: 'ETB',
    amount: major(amountMinor),
    balanceAfter: major(balanceAfterMinor),
    balance: 'CASH',
    description: null,
    reversalOf: null,
    createdAt: '2026-01-02T10:00:00.000Z',
    ...overrides,
    amountMinor,
    balanceAfterMinor,
  };
}

export function depositOptions(
  overrides: Partial<Schemas['DepositOptionsDto']> = {},
): Schemas['DepositOptionsDto'] {
  return {
    enabled: true,
    provider: 'chapa',
    testMode: false,
    currency: 'ETB',
    minorUnits: 2,
    minAmountMinor: '1000',
    maxAmountMinor: '5000000',
    directChargeMethods: ['telebirr', 'mpesa', 'cbebirr', 'ebirr'],
    inlinePublicKey: null,
    bonusPercent: 100,
    bonusMaxMinor: '1000000',
    bonusValidDays: 7,
    ...overrides,
  };
}

/** A deposit of ETB 500 that is waiting for the payer. */
export function aDeposit(overrides: Partial<Schemas['DepositDto']> = {}): Schemas['DepositDto'] {
  const amountMinor = overrides.amountMinor ?? '50000';
  return {
    id: '77777777-7777-4777-8777-777777777777',
    status: 'PENDING',
    provider: 'chapa',
    reference: 'LUB-ABCDEFGHJKMNPQRSTVWX',
    amount: major(amountMinor),
    currency: 'ETB',
    minorUnits: 2,
    checkoutUrl: 'https://checkout.chapa.co/checkout/payment/abc123',
    chargeMethod: null,
    bonusMinor: '0',
    bonus: '0.00',
    failureReason: null,
    requestNotSent: false,
    walletTransactionId: null,
    confirmedAt: null,
    expiresAt: '2026-01-02T12:00:00.000Z',
    createdAt: '2026-01-02T10:00:00.000Z',
    bid: null,
    ...overrides,
    amountMinor,
  };
}

export function aMyBid(
  amountMinor: string,
  overrides: Partial<Schemas['MyBidDto']> = {},
): Schemas['MyBidDto'] {
  return {
    id: nextId(),
    amountMinor,
    amount: major(amountMinor),
    createdAt: '2026-01-02T10:00:00.000Z',
    auctionId: anAuction().id,
    auctionTitle: anAuction().title,
    auctionStatus: 'ACTIVE',
    currency: 'ETB',
    submissionId: '66666666-6666-4666-8666-666666666666',
    bidFeeMinor: '7500',
    bidFee: '75.00',
    ...overrides,
  };
}

export function myBids(items: Schemas['MyBidDto'][], total = items.length): Schemas['MyBidPageDto'] {
  return { items, total, page: 1, limit: 20 };
}

/** The server's answer to placing `amountsMinor` at ETB 75 each from a wallet that had `walletMinor`. */
export function aSubmission(amountsMinor: string[], walletMinor = '100000'): Schemas['BidSubmissionDto'] {
  const totalFeeMinor = String(7500 * amountsMinor.length);
  const left = String(Number(walletMinor) - Number(totalFeeMinor));
  return {
    id: nextId(),
    auctionId: anAuction().id,
    currency: 'ETB',
    minorUnits: 2,
    bidCount: amountsMinor.length,
    bidFeeMinor: '7500',
    bidFee: '75.00',
    totalFeeMinor,
    totalFee: major(totalFeeMinor),
    transactionId: nextId(),
    transactionReference: 'TXN-BID',
    walletAvailableMinor: left,
    walletAvailable: major(left),
    walletBonusMinor: '0',
    walletBonus: '0.00',
    paidWithBonusMinor: '0',
    bids: amountsMinor.map((amountMinor) => ({
      id: nextId(),
      amountMinor,
      amount: major(amountMinor),
      createdAt: '2026-01-02T10:00:00.000Z',
    })),
    createdAt: '2026-01-02T10:00:00.000Z',
  };
}

export function myResult(
  overrides: Partial<Schemas['MyAuctionResultDto']> = {},
): Schemas['MyAuctionResultDto'] {
  return {
    auctionId: anAuction().id,
    outcome: 'WINNER_FOUND',
    currency: 'ETB',
    minorUnits: 2,
    winningAmountMinor: '400',
    winningAmount: '4.00',
    totalBids: 12,
    appliedNoUniquePolicy: null,
    bidFeesRefundedAt: null,
    computedAt: '2026-01-02T12:00:00.000Z',
    won: false,
    bids: [],
    ...overrides,
  };
}

export function aDelivery(overrides: Partial<Schemas['DeliveryDto']> = {}): Schemas['DeliveryDto'] {
  return {
    status: 'PENDING',
    recipientName: null,
    recipientPhone: null,
    address: null,
    trackingInfo: null,
    updatedAt: '2026-01-03T09:00:00.000Z',
    ...overrides,
  };
}

/** A win staff have confirmed, waiting for the winner's delivery details. */
export function aWin(overrides: Partial<Schemas['MyWinDto']> = {}): Schemas['MyWinDto'] {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    auctionId: anAuction().id,
    auctionTitle: anAuction().title,
    productName: 'Samsung Galaxy A55',
    productImageUrl: null,
    amountMinor: '400',
    amount: '4.00',
    currency: 'ETB',
    verificationStatus: 'VERIFIED',
    publishedAt: null,
    canEditDeliveryDetails: true,
    delivery: aDelivery(),
    createdAt: '2026-01-02T12:00:00.000Z',
    ...overrides,
  };
}

export function myWins(items: Schemas['MyWinDto'][], total = items.length): Schemas['MyWinPageDto'] {
  return { items, total, page: 1, limit: 20 };
}

export function aPublicWinner(
  overrides: Partial<Schemas['PublicWinnerDto']> = {},
): Schemas['PublicWinnerDto'] {
  return {
    id: nextId(),
    auctionId: anAuction().id,
    auctionTitle: anAuction().title,
    productName: 'Samsung Galaxy A55',
    productImageUrl: null,
    amountMinor: '400',
    amount: '4.00',
    currency: 'ETB',
    winnerLabel: '+2519****4567',
    publishedAt: '2026-01-03T09:00:00.000Z',
    ...overrides,
  };
}

export function aNotification(
  overrides: Partial<Schemas['NotificationDto']> = {},
): Schemas['NotificationDto'] {
  return {
    id: nextId(),
    type: 'BID_SUBMITTED',
    title: 'Bid placed',
    body: 'Your bid in "Samsung Galaxy A55 auction" was placed. ETB 75 was charged to your wallet.',
    data: { auctionId: anAuction().id },
    read: false,
    readAt: null,
    createdAt: '2026-01-02T10:00:00.000Z',
    ...overrides,
  };
}

export function notifications(
  items: Schemas['NotificationDto'][],
  unread = items.filter((item) => !item.read).length,
  total = items.length,
): Schemas['NotificationPageDto'] {
  return { items, total, unread, page: 1, limit: 20 };
}
