import type { Notification } from './queries';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The page a notification is about, or null when there is none to open. */
export function notificationLink(notification: Pick<Notification, 'type' | 'data'>): string | null {
  const auctionId = notification.data?.auctionId;
  // The id goes into an address, so anything that is not an id is ignored.
  const auction = typeof auctionId === 'string' && UUID.test(auctionId) ? `/auctions/${auctionId}` : null;
  switch (notification.type) {
    case 'BID_SUBMITTED':
    case 'AUCTION_CLOSING_REMINDER':
    case 'AUCTION_RESULT':
      return auction;
    case 'WINNER_ANNOUNCEMENT':
    case 'PRIZE_DELIVERY_UPDATE':
      return '/wins';
    case 'DEPOSIT_SUCCEEDED':
    case 'LOW_BALANCE':
    case 'WITHDRAWAL_UPDATE':
      return '/wallet';
    case 'PASSWORD_RESET':
    case 'PHONE_VERIFICATION':
      return '/account';
    default:
      return null;
  }
}
