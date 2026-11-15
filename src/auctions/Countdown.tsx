import { useEffect, useRef, useState } from 'react';
import { formatTimeLeft, serverClock, timeLeft } from '../lib/clock';

/** Time left until `until`, by the server's clock, ticking every second. Calls `onElapsed` once at zero. */
export function Countdown({ until, onElapsed }: { until: string; onElapsed?: () => void }) {
  const [now, setNow] = useState(() => serverClock.now());
  const left = timeLeft(until, now);
  const elapsed = left.totalSeconds === 0;

  useEffect(() => {
    if (elapsed) return;
    const timer = setInterval(() => setNow(serverClock.now()), 1000);
    return () => clearInterval(timer);
  }, [elapsed]);

  const onElapsedRef = useRef(onElapsed);
  useEffect(() => {
    onElapsedRef.current = onElapsed;
  });
  useEffect(() => {
    if (elapsed) onElapsedRef.current?.();
  }, [elapsed]);

  return (
    <time dateTime={until} className="tabular-nums">
      {formatTimeLeft(left)}
    </time>
  );
}
