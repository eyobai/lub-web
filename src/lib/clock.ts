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
export function formatTimeLeft(t: TimeLeft): string {
  const clock = `${two(t.hours)}:${two(t.minutes)}:${two(t.seconds)}`;
  return t.days > 0 ? `${t.days} ${t.days === 1 ? 'day' : 'days'} ${clock}` : clock;
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}
