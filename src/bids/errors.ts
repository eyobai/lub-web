import { errorMessage, isApiError } from '../api/errors';
import { formatMinor } from '../lib/money';
import { isUnconfirmed } from './queries';
import { t, tCount } from '../i18n/i18n';

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
        ? t('These bids cost {required}, but your wallet has {available}. Nothing was charged.', {
            required: show(required),
            available: show(available),
          })
        : t('Your wallet balance does not cover these bids. Nothing was charged.');
    }
    case 'WALLET_FROZEN':
      return t('Your wallet is frozen, so you cannot bid. Please contact support.');
    case 'FORBIDDEN':
      return t('This account cannot place bids.');
    case 'AUCTION_NOT_OPEN':
      return t('This auction has not opened yet.');
    case 'AUCTION_CLOSED':
      return t('Bidding on this auction has closed. Your bids were not placed and nothing was charged.');
    case 'NOT_FOUND':
      return t('This auction is no longer available.');
    case 'DUPLICATE_BID': {
      const amounts = refusedAmounts(error).map(show);
      return amounts.length > 0
        ? t(
            amounts.length === 1
              ? 'You have already bid {amounts} in this auction. Remove it and try again. Nothing was charged.'
              : 'You have already bid {amounts} in this auction. Remove them and try again. Nothing was charged.',
            { amounts: amounts.join(', ') },
          )
        : t('You have already bid some of these amounts in this auction. Nothing was charged.');
    }
    case 'BID_AMOUNT_INVALID': {
      const amounts = refusedAmounts(error).map(show);
      return amounts.length > 0
        ? t('This auction does not accept {amounts}. Nothing was charged.', { amounts: amounts.join(', ') })
        : t('Some of these amounts are not accepted by this auction. Nothing was charged.');
    }
    case 'BID_LIMIT_EXCEEDED':
      if (typeof details.remaining === 'number') {
        return details.remaining === 0
          ? t('You have placed every bid you are allowed in this auction.')
          : tCount(
              details.remaining,
              'You can place {count} more bid in this auction. Nothing was charged.',
              'You can place {count} more bids in this auction. Nothing was charged.',
            );
      }
      return typeof details.maxBidsPerRequest === 'number'
        ? t('You can place at most {count} bids at a time. Nothing was charged.', {
            count: details.maxBidsPerRequest,
          })
        : t('That is more bids than this auction allows. Nothing was charged.');
    case 'RATE_LIMITED':
    case 'PASSWORD_CHANGE_REQUIRED':
      return errorMessage(error);
    default:
      return isUnconfirmed(error)
        ? t('We could not confirm that your bids were placed. Try again: you will not be charged twice.')
        : t('Your bids could not be placed. Nothing was charged. Please try again.');
  }
}
