import { locale, t } from '../i18n/i18n';
/**
 * The server's clock, as far as this device can tell. Auctions open and close by server time, and a phone's
 * clock can be minutes off, so countdowns are measured against the `serverTime` the API sends with each auction.
 */
let offsetMs = 0;

export const serverClock = {
  sync(serverTime: string): void {
    const server = Date.parse(serverTime);
    if (!Number.isNaN(server)) offsetMs = server - Date.now();
  },
  now: (): number => Date.now() + offsetMs,
};

export interface TimeLeft {
  totalSeconds: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function timeLeft(until: string, now: number = serverClock.now()): TimeLeft {
  const totalSeconds = Math.max(0, Math.ceil((Date.parse(until) - now) / 1000));
  return {
    totalSeconds,
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

const two = (n: number) => String(n).padStart(2, '0');

/** "03:12:45", with the days in front when there are any: "2 days 03:12:45". Ticks every second. */
export function formatTimeLeft(left: TimeLeft): string {
  const clock = `${two(left.hours)}:${two(left.minutes)}:${two(left.seconds)}`;
  if (left.days === 0) return clock;
  return t(left.days === 1 ? '{days} day {clock}' : '{days} days {clock}', { days: left.days, clock });
}

const formats = new Map<string, Intl.DateTimeFormat>();

/** A date and time in the site's language: "Nov 19, 2026, 2:49 PM", or with Amharic month names. */
export function formatDateTime(iso: string): string {
  const tag = locale();
  let format = formats.get(tag);
  if (!format) {
    format = new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short' });
    formats.set(tag, format);
  }
  return format.format(new Date(iso));
}
