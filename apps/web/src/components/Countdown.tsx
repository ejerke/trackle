import { useEffect, useState } from "react";

function format(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Ticks once a second until `target`; then offers to load the new puzzle. */
export function Countdown({ target }: { target: string }) {
  const [now, setNow] = useState(() => Date.now());
  const remaining = new Date(target).getTime() - now;

  useEffect(() => {
    if (remaining <= 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [remaining <= 0]);

  if (remaining <= 0) {
    return (
      <a className="button button--primary" href="/">
        Play the new track
      </a>
    );
  }
  return (
    <p className="countdown">
      Next track in <time className="countdown__time">{format(remaining)}</time>
    </p>
  );
}
