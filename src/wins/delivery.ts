import { ApiError } from '../api/errors';
import type { DeliveryDetails, MyWin } from './queries';

/**
 * What the form holds: who receives the prize, the number our team calls, and the city or town. The rest of the
 * address is arranged on that call, so the form does not ask for it.
 */
export interface DeliveryForm {
  recipientName: string;
  recipientPhone: string;
  city: string;
}
export type DeliveryField = keyof DeliveryForm;

/** The details already sent, or the account's own name and number as a first suggestion. */
export function initialDeliveryForm(
  win: MyWin,
  account: { fullName: string | null; phoneNumber: string },
): DeliveryForm {
  const d = win.delivery;
  return {
    recipientName: d?.recipientName ?? account.fullName ?? '',
    recipientPhone: d?.recipientPhone ?? account.phoneNumber,
    city: d?.address?.city ?? '',
  };
}

/** Spaces, dashes and brackets are how people write numbers; the API takes digits with an optional +. */
const phoneDigits = (value: string) => value.replace(/[\s()-]/g, '');

/** The same rules the API enforces, so a mistake is pointed out on its own box without a round trip. */
export function deliveryErrors(form: DeliveryForm): Partial<Record<DeliveryField, string>> {
  const errors: Partial<Record<DeliveryField, string>> = {};
  const name = form.recipientName.trim();
  if (!name) errors.recipientName = 'Enter the name of the person who will receive the prize.';
  else if (name.length < 2 || name.length > 150) errors.recipientName = 'Enter between 2 and 150 characters.';

  const phone = phoneDigits(form.recipientPhone);
  if (!phone) errors.recipientPhone = 'Enter a phone number we can call about the delivery.';
  else if (!/^\+?[0-9]{9,15}$/.test(phone))
    errors.recipientPhone = 'Enter a valid phone number, for example 0911 234 567.';

  const city = form.city.trim();
  if (!city) errors.city = 'Enter the city or town.';
  else if (city.length < 2 || city.length > 100) errors.city = 'Enter between 2 and 100 characters.';
  return errors;
}

/** The request body, trimmed. */
export function toDeliveryDetails(form: DeliveryForm): DeliveryDetails {
  return {
    recipientName: form.recipientName.trim(),
    recipientPhone: phoneDigits(form.recipientPhone),
    address: { city: form.city.trim() },
  };
}

/** One line for display, most specific part first. Details sent before the form was shortened may have more parts. */
export function formatAddress(address: DeliveryDetails['address']): string {
  return [
    address.houseNumber && `House ${address.houseNumber}`,
    address.woreda && `Woreda ${address.woreda}`,
    address.subCity,
    address.city,
    address.region !== address.city && address.region,
  ]
    .filter(Boolean)
    .join(', ');
}

const SAVE_MESSAGES: Record<string, string> = {
  DELIVERY_INVALID_STATE:
    'Our team has already confirmed the delivery details, so they can no longer be changed here. Please contact support.',
  WINNER_INVALID_STATE: 'This win has not been confirmed yet. You can send your details once it is.',
  NOT_FOUND: 'We could not find this win. Please reload the page.',
};

/** Wording for a refused save, or null when the general wording applies. */
export function deliverySaveMessage(error: unknown): string | null {
  return error instanceof ApiError ? (SAVE_MESSAGES[error.code] ?? null) : null;
}

export type Step = 'won' | 'confirmed' | 'details' | 'dispatched' | 'delivered';
export const STEPS: readonly { key: Step; label: string }[] = [
  { key: 'won', label: 'Won' },
  { key: 'confirmed', label: 'Win confirmed' },
  { key: 'details', label: 'Delivery details confirmed' },
  { key: 'dispatched', label: 'On its way' },
  { key: 'delivered', label: 'Delivered' },
];

/**
 * How many of STEPS are behind this win, or null when the steps do not describe it: the win was not
 * confirmed, or the delivery is on hold (a hold can start at any step, and the API does not say which).
 */
export function stepsDone(win: MyWin): number | null {
  if (win.verificationStatus === 'REJECTED') return null;
  if (win.verificationStatus === 'PENDING_VERIFICATION' || !win.delivery) return 1;
  switch (win.delivery.status) {
    case 'PENDING':
    case 'CONTACTED':
      return 2;
    case 'VERIFIED':
      return 3;
    case 'DISPATCHED':
      return 4;
    case 'DELIVERED':
      return 5;
    case 'DISPUTED':
      return null;
  }
}

export const hasDeliveryDetails = (win: MyWin): boolean =>
  !!win.delivery?.recipientName && !!win.delivery.recipientPhone && !!win.delivery.address;

export interface WinStatus {
  label: string;
  tone: 'info' | 'warning' | 'success' | 'error';
  message: string;
}

/** Where the win stands and what, if anything, the winner should do next. */
export function winStatus(win: MyWin): WinStatus {
  if (win.verificationStatus === 'REJECTED')
    return {
      label: 'Not confirmed',
      tone: 'error',
      message: 'We could not confirm this win. Please contact support for details.',
    };
  if (win.verificationStatus === 'PENDING_VERIFICATION' || !win.delivery)
    return {
      label: 'Being checked',
      tone: 'info',
      message: 'We are checking the result. You will get a notification as soon as your win is confirmed.',
    };
  switch (win.delivery.status) {
    case 'PENDING':
    case 'CONTACTED':
      if (!hasDeliveryDetails(win))
        return {
          label: 'Details needed',
          tone: 'warning',
          message: 'Your win is confirmed. Tell us who will receive the prize and where to deliver it.',
        };
      return {
        label: 'Arranging delivery',
        tone: 'info',
        message:
          win.delivery.status === 'CONTACTED'
            ? 'Our team is arranging the delivery and may call the number below. You can still change the details.'
            : 'We have your delivery details. Our team will confirm them with you. You can still change them.',
      };
    case 'VERIFIED':
      return {
        label: 'Preparing',
        tone: 'info',
        message: 'Your delivery details are confirmed. The prize will be sent soon.',
      };
    case 'DISPATCHED':
      return { label: 'On its way', tone: 'info', message: 'Your prize is on its way.' };
    case 'DELIVERED':
      return { label: 'Delivered', tone: 'success', message: 'Your prize was delivered. Enjoy!' };
    case 'DISPUTED':
      return {
        label: 'On hold',
        tone: 'warning',
        message: 'The delivery is on hold while an issue is looked into. Our team will contact you.',
      };
  }
}
