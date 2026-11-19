import { t } from '../i18n/i18n';

/** The same rules the API enforces, checked first so people get an answer without a round trip. */

export function phoneError(value: string): string | null {
  const digits = value.replace(/[\s()-]/g, '');
  if (!digits) return t('Enter your phone number.');
  // +2519XXXXXXXX, 2519XXXXXXXX, 09XXXXXXXX or 9XXXXXXXX (and the 7-prefixed mobile range).
  return /^(\+?251|0)?[79]\d{8}$/.test(digits)
    ? null
    : t('Enter a valid Ethiopian mobile number, for example 0911 234 567.');
}

export function passwordError(value: string): string | null {
  if (value.length < 4) return t('Use at least 4 characters.');
  if (value.length > 128) return t('Use at most 128 characters.');
  return null;
}

export function fullNameError(value: string): string | null {
  const name = value.trim();
  if (!name) return null;
  if (name.length < 2 || name.length > 150) return t('Enter between 2 and 150 characters.');
  return /[<>]/.test(name) ? t('The name cannot contain < or >.') : null;
}
