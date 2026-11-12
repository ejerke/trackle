import { utcDate } from "@trackle/shared";
import { useEffect, useState } from "react";
import { computeStats } from "../stats";
import type { ProgressStore } from "../storage/progressStore";

/**
 * The current daily streak at this difficulty, from the stored progress.
 * Pass something that changes on a solve (`refresh`) to count it again then.
 */
export function useStreak(store: ProgressStore, difficulty: number, refresh?: unknown): number {
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
  }, [store, difficulty, refresh]);
  return streak;
}
