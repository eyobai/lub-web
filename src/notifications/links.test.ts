import { describe, expect, it } from 'vitest';
import { notificationLink } from './links';

const AUCTION = '22222222-2222-4222-8222-222222222222';

describe('where a notification leads', () => {
  it('opens the auction, the wins, the wallet or the account', () => {
    const data = { auctionId: AUCTION };
    expect(notificationLink({ type: 'BID_SUBMITTED', data })).toBe(`/auctions/${AUCTION}`);
    expect(notificationLink({ type: 'AUCTION_CLOSING_REMINDER', data })).toBe(`/auctions/${AUCTION}`);
    expect(notificationLink({ type: 'AUCTION_RESULT', data })).toBe(`/auctions/${AUCTION}`);
    expect(notificationLink({ type: 'WINNER_ANNOUNCEMENT', data })).toBe('/wins');
    expect(notificationLink({ type: 'PRIZE_DELIVERY_UPDATE', data })).toBe('/wins');
    expect(notificationLink({ type: 'LOW_BALANCE', data: {} })).toBe('/wallet');
    expect(notificationLink({ type: 'DEPOSIT_SUCCEEDED', data: null })).toBe('/wallet');
    expect(notificationLink({ type: 'PASSWORD_RESET', data: {} })).toBe('/account');
  });

  it('leads nowhere when the auction is missing or is not an id', () => {
    expect(notificationLink({ type: 'AUCTION_RESULT', data: null })).toBeNull();
    expect(notificationLink({ type: 'AUCTION_RESULT', data: {} })).toBeNull();
    expect(notificationLink({ type: 'AUCTION_RESULT', data: { auctionId: 42 } })).toBeNull();
    expect(notificationLink({ type: 'AUCTION_RESULT', data: { auctionId: '../account?x=1' } })).toBeNull();
    expect(notificationLink({ type: 'SOMETHING_NEW' as never, data: { auctionId: AUCTION } })).toBeNull();
  });
});
