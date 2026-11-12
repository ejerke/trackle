import { useStreak } from "../hooks/useStreak";
import type { ProgressStore } from "../storage/progressStore";

/** "3-day streak" line for the solved panel. Renders nothing for streaks under 2. */
export function StreakNote({ store }: { store: ProgressStore }) {
  const { current } = useStreak(store);
  if (current < 2) return null;
  return (
    <p className="streak">
      <span aria-hidden="true">🔥</span> {current}-day streak · <a href="/stats">stats</a>
    </p>
  );
}

/**
 * The streak in the header, next to how-to-play. Dimmed while today hasn't
 * counted yet: the streak is still alive, but ends unless a daily is solved today.
 */
export function HeaderStreak({ store }: { store: ProgressStore }) {
  const { current, today } = useStreak(store);
  const label =
    current === 0
      ? "No streak yet. Solve any daily puzzle on its day to start one."
      : today
        ? `${current}-day streak`
        : `${current}-day streak. Solve any daily puzzle today to keep it going.`;
  return (
    <a className={`header-streak${today ? "" : " header-streak--pending"}`} href="/stats" aria-label={label} title={label}>
      <span aria-hidden="true">🔥</span>
      {current}
    </a>
  );
}
