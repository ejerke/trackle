import type { LeaderboardPeriod } from "@trackle/shared";
import { useCallback, useState } from "react";
import { useDailySolveSaved } from "../hooks/useStreak";
import { LeaderboardTable, MyStanding, useLeaderboard } from "./Leaderboard";

/** How many players the board under the Challenge lists; the full page has the rest. */
const SHOWN = 10;
const HIDDEN_KEY = "trackle:prefs:challengeLeaderboardHidden";

const PERIODS: { period: LeaderboardPeriod; label: string }[] = [
  { period: "month", label: "This month" },
  { period: "all", label: "All time" },
];

function loadHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function saveHidden(hidden: boolean): void {
  try {
    if (hidden) window.localStorage.setItem(HIDDEN_KEY, "1");
    else window.localStorage.removeItem(HIDDEN_KEY);
  } catch {
    // Not remembering it is fine.
  }
}

/**
 * The leaderboard under the Challenge's board (ADR 0025): this month's by
 * default, or all time. Hideable; that choice is remembered in this browser. It loads again once a solve has
 * reached the account, so new points show straight away.
 */
export function ChallengeLeaderboard() {
  const [hidden, setHidden] = useState(loadHidden);
  const [period, setPeriod] = useState<LeaderboardPeriod>("month");
  const [solves, setSolves] = useState(0);
  useDailySolveSaved(useCallback(() => setSolves((n) => n + 1), []));
  const { board, failed, reload } = useLeaderboard(period, solves);

  const toggle = () => {
    saveHidden(!hidden);
    setHidden(!hidden);
  };

  return (
    <section className="stats-card leaderboard-card challenge-board" aria-label="Leaderboard">
      <div className="challenge-board__head">
        <h2>Leaderboard</h2>
        <button type="button" className="link-button" onClick={toggle} aria-expanded={!hidden}>
          {hidden ? "Show" : "Hide"}
        </button>
      </div>
      {!hidden && (
        <>
          <fieldset className="challenge-board__period">
            <legend className="visually-hidden">Period</legend>
            {PERIODS.map((p) => (
              <label key={p.period}>
                <input
                  type="radio"
                  name="challenge-board-period"
                  value={p.period}
                  checked={period === p.period}
                  onChange={() => setPeriod(p.period)}
                />
                {p.label}
              </label>
            ))}
          </fieldset>
          {failed && <p className="message--quiet">Couldn't load the leaderboard.</p>}
          {!board && !failed && <p className="message--quiet">Loading…</p>}
          {board && (
            <>
              {board.entries.length === 0 ? (
                <p className="message--quiet">No one on the board{period === "month" ? " this month" : ""} yet.</p>
              ) : (
                <LeaderboardTable entries={board.entries.slice(0, SHOWN)} />
              )}
              <MyStanding board={board} onChanged={reload} />
              <p className="challenge-board__more">
                <a href="/leaderboard">Full leaderboard</a>
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
