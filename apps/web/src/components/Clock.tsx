import { useEffect, useState } from "react";
import { formatDuration } from "../time";

/**
 * The solving clock: `timeMs` banked so far, plus the time since
 * `runningSince` (performance.now()) while it runs.
 */
export function Clock({ timeMs, runningSince }: { timeMs: number; runningSince: number | null }) {
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (runningSince === null) return;
    setNow(performance.now());
    // Tick a few times a second so the seconds turn over on time.
    const id = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(id);
  }, [runningSince]);

  const elapsed = timeMs + (runningSince === null ? 0 : Math.max(0, now - runningSince));
  return (
    <p className={`clock${runningSince === null ? " clock--stopped" : ""}`} aria-label="Time">
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 7.5V11l2.5 1.8M8 2.5h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span>{formatDuration(elapsed)}</span>
    </p>
  );
}
