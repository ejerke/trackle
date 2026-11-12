import { difficultyName, utcDate } from "@trackle/shared";
import { useEffect, useState } from "react";
import { computeStats, type PlayerStats } from "../stats";
import type { ProgressStore } from "../storage/progressStore";
import { formatDuration } from "../time";
import { Page } from "./Page";

/** Personal statistics from this browser's saved progress. */
export function StatsPage({ store }: { store: ProgressStore }) {
  const [stats, setStats] = useState<PlayerStats | null>(null);

  useEffect(() => {
    void store.list().then((records) => setStats(computeStats(records, utcDate(new Date()))));
  }, [store]);

  return (
    <Page subtitle="Your stats" store={store}>
      {!stats ? (
        <p className="status">Loading…</p>
      ) : (
        <>
          <section className="stats-card stats-streak">
            <h2>Daily streak</h2>
            <dl>
              <Stat label="Current streak" value={stats.streak.current} />
              <Stat label="Best streak" value={stats.streak.best} />
            </dl>
          </section>
          <div className="stats-grid">
            {stats.daily.map((d) => (
              <section key={d.difficulty} className="stats-card">
                <h2>{difficultyName(d.difficulty)}</h2>
                <dl>
                  <Stat label="Solved" value={d.solved} />
                  <Stat label="On your own" value={d.unaided} />
                  <Stat label="Best time" value={d.bestTimeMs === null ? "–" : formatDuration(d.bestTimeMs)} />
                  <Stat label="Avg. time" value={d.averageTimeMs === null ? "–" : formatDuration(d.averageTimeMs)} />
                </dl>
              </section>
            ))}
          </div>
          <p className="stats-random">
            Random puzzles solved: <b>{stats.random.solved}</b> of {stats.random.played} started
          </p>
          <p className="notice">
            A day counts for your streak when you solve any daily puzzle, at any difficulty, on its own day (UTC).
            Catching up in the <a href="/archive">archive</a> counts as solved but not for streaks, and neither does a
            shown answer. Times count puzzles solved without hints. Stats live in this browser only.
          </p>
        </>
      )}
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
