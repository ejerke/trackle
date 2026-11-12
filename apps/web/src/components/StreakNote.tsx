import { useStreak } from "../hooks/useStreak";
import type { ProgressStore } from "../storage/progressStore";

/** "3-day streak" line for the solved panel. Renders nothing for streaks under 2. */
export function StreakNote({ store, difficulty }: { store: ProgressStore; difficulty: number }) {
  const streak = useStreak(store, difficulty);
  if (streak < 2) return null;
  return (
    <p className="streak">
      <span aria-hidden="true">🔥</span> {streak}-day streak · <a href="/stats">stats</a>
    </p>
  );
}
