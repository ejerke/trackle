import { utcDate } from "@trackle/shared";
import { useEffect, useState } from "react";
import { computeStats, type Streak } from "../stats";
import type { ProgressStore } from "../storage/progressStore";

const NO_STREAK: Streak = { current: 0, best: 0, today: false };

// Every useStreak on the page (header, train, solved panel) counts again when a puzzle is solved.
const solves = new EventTarget();

/** Tell every streak on the page to count again (call after a solve is saved). */
export function streakChanged(): void {
  solves.dispatchEvent(new Event("change"));
}

/** The player's daily streak, across all difficulties, from the stored progress. */
export function useStreak(store: ProgressStore): Streak {
  const [streak, setStreak] = useState(NO_STREAK);
  useEffect(() => {
    let cancelled = false;
    const count = () =>
      void store.list().then((records) => {
        if (!cancelled) setStreak(computeStats(records, utcDate(new Date())).streak);
      });
    count();
    solves.addEventListener("change", count);
    return () => {
      cancelled = true;
      solves.removeEventListener("change", count);
    };
  }, [store]);
  return streak;
}
