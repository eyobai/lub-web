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

/** "2d 03h 12m" above a day, "03:12:45" below. */
export function formatTimeLeft(t: TimeLeft): string {
  return t.days > 0
    ? `${t.days}d ${two(t.hours)}h ${two(t.minutes)}m`
    : `${two(t.hours)}:${two(t.minutes)}:${two(t.seconds)}`;
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}
