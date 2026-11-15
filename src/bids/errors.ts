import { errorMessage, isApiError } from '../api/errors';
import { formatMinor } from '../lib/money';
import { isUnconfirmed } from './queries';

interface Money {
  currency: string;
  minorUnits: number;
}

function minorList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && /^\d+$/.test(v))
    : [];
}

/** The amounts (minor units) a refusal was about, so the form can point at them. */
export function refusedAmounts(error: unknown): string[] {
  if (isApiError(error, 'DUPLICATE_BID')) return minorList(error.details?.amountsMinor);
  if (isApiError(error, 'BID_AMOUNT_INVALID')) return minorList(error.details?.invalidAmountsMinor);
  return [];
}

/** What to tell someone whose bids were not accepted. Nothing is charged for a refused request. */
export function bidErrorMessage(error: unknown, money: Money): string {
  const show = (minor: string) => formatMinor(minor, money.currency, money.minorUnits);
  if (!isApiError(error)) return errorMessage(error);
  const details = error.details ?? {};
  switch (error.code) {
    case 'INSUFFICIENT_FUNDS': {
      const [required] = minorList([details.requiredMinor]);
      const [available] = minorList([details.availableMinor]);
      return required && available
        ? `These bids cost ${show(required)}, but your wallet has ${show(available)}. Nothing was charged.`
        : 'Your wallet balance does not cover these bids. Nothing was charged.';
    }
    case 'WALLET_FROZEN':
      return 'Your wallet is frozen, so you cannot bid. Please contact support.';
    case 'FORBIDDEN':
      return 'This account cannot place bids.';
    case 'AUCTION_NOT_OPEN':
      return 'This auction has not opened yet.';
    case 'AUCTION_CLOSED':
      return 'Bidding on this auction has closed. Your bids were not placed and nothing was charged.';
    case 'NOT_FOUND':
      return 'This auction is no longer available.';
    case 'DUPLICATE_BID': {
      const amounts = refusedAmounts(error).map(show);
      return amounts.length > 0
        ? `You have already bid ${amounts.join(', ')} in this auction. Remove ${amounts.length === 1 ? 'it' : 'them'} and try again. Nothing was charged.`
        : 'You have already bid some of these amounts in this auction. Nothing was charged.';
    }
    case 'BID_AMOUNT_INVALID': {
      const amounts = refusedAmounts(error).map(show);
      return amounts.length > 0
        ? `This auction does not accept ${amounts.join(', ')}. Nothing was charged.`
        : 'Some of these amounts are not accepted by this auction. Nothing was charged.';
    }
    case 'BID_LIMIT_EXCEEDED':
      if (typeof details.remaining === 'number') {
        return details.remaining === 0
          ? 'You have placed every bid you are allowed in this auction.'
          : `You can place ${details.remaining} more ${details.remaining === 1 ? 'bid' : 'bids'} in this auction. Nothing was charged.`;
      }
      return typeof details.maxBidsPerRequest === 'number'
        ? `You can place at most ${details.maxBidsPerRequest} bids at a time. Nothing was charged.`
        : 'That is more bids than this auction allows. Nothing was charged.';
    case 'RATE_LIMITED':
    case 'PASSWORD_CHANGE_REQUIRED':
      return errorMessage(error);
    default:
      return isUnconfirmed(error)
        ? 'We could not confirm that your bids were placed. Try again: you will not be charged twice.'
        : 'Your bids could not be placed. Nothing was charged. Please try again.';
  }
}
