import { utcDate } from "@trackle/shared";
import { useEffect, useState } from "react";
import { computeStats } from "../stats";
import type { ProgressStore } from "../storage/progressStore";

/** "3-day streak" line for the solved panel. Renders nothing for streaks under 2. */
export function StreakNote({ store, difficulty }: { store: ProgressStore; difficulty: number }) {
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void store.list().then((records) => {
      if (cancelled) return;
      const stats = computeStats(records, utcDate(new Date()));
      setStreak(stats.daily.find((d) => d.difficulty === difficulty)?.currentStreak ?? 0);
    });
    return () => {
      cancelled = true;
    };
  }, [store, difficulty]);

  if (streak < 2) return null;
  return (
    <p className="streak">
      <span aria-hidden="true">🔥</span> {streak}-day streak · <a href="/stats">stats</a>
    </p>
  );
}
