import { difficultyName, utcDate } from "@trackle/shared";
import { useEffect, useState } from "react";
import { computeStats, type PlayerStats } from "../stats";
import type { ProgressStore } from "../storage/progressStore";
import { Page } from "./Page";

/** Personal statistics from this browser's saved progress. */
export function StatsPage({ store }: { store: ProgressStore }) {
  const [stats, setStats] = useState<PlayerStats | null>(null);

  useEffect(() => {
    void store.list().then((records) => setStats(computeStats(records, utcDate(new Date()))));
  }, [store]);

  return (
    <Page subtitle="Your stats">
      {!stats ? (
        <p className="status">Loading…</p>
      ) : (
        <>
          <div className="stats-grid">
            {stats.daily.map((d) => (
              <section key={d.difficulty} className="stats-card">
                <h2>{difficultyName(d.difficulty)}</h2>
                <dl>
                  <Stat label="Solved" value={d.solved} />
                  <Stat label="Current streak" value={d.currentStreak} />
                  <Stat label="Best streak" value={d.bestStreak} />
                  <Stat label="First try" value={d.solved ? `${Math.round((d.firstTry / d.solved) * 100)}%` : "–"} />
                  <Stat label="Avg. checks" value={d.averageChecks === null ? "–" : d.averageChecks.toFixed(1)} />
                </dl>
              </section>
            ))}
          </div>
          <p className="stats-random">
            Random puzzles solved: <b>{stats.random.solved}</b> of {stats.random.played} started
          </p>
          <p className="notice">
            Streaks count daily puzzles solved on their own day (UTC); catching up in the{" "}
            <a href="/archive">archive</a> counts as solved but not for streaks. Stats live in this browser only.
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
