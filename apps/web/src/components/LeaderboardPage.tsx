import { CHALLENGE_DIFFICULTY, POINTS_PER_TRACK_SQUARE, type LeaderboardPeriod } from "@trackle/shared";
import { useState } from "react";
import { dailyUrl } from "../routes";
import type { ProgressStore } from "../storage/progressStore";
import { LeaderboardTable, MyStanding, PeriodPicker, useLeaderboard } from "./Leaderboard";
import { TrophyIcon } from "./ModeBar";
import { Page } from "./Page";

/**
 * Points from daily Challenges solved on their day (ADR 0025). The server
 * computes everything; this page only shows it. Players appear by name only
 * once they've chosen to.
 */
export function LeaderboardPage({ store }: { store: ProgressStore }) {
  const [period, setPeriod] = useState<LeaderboardPeriod>("month");
  const { board, failed, reload } = useLeaderboard(period);

  return (
    <Page subtitle="Challenge leaderboard" store={store}>
      <nav className="mode-bar" aria-label="Period">
        <PeriodPicker period={period} onChange={setPeriod} />
      </nav>

      <p className="notice">
        Every day's <a href={dailyUrl(CHALLENGE_DIFFICULTY)}>Challenge</a> is worth {POINTS_PER_TRACK_SQUARE} points
        per square of track, when you solve it on its day (UTC). There are no hints.
      </p>

      {failed && <p className="status">Couldn't load the leaderboard. Try reloading.</p>}
      {!board && !failed && <p className="status">Loading…</p>}

      {board && (
        <>
          <section className="stats-card leaderboard-card">
            <MyStanding board={board} onChanged={reload} />
          </section>

          {board.entries.length === 0 ? (
            <div className="status">
              <p>No one on the board{board.period === "month" ? " this month" : ""} yet.</p>
              <a className="button button--primary" href={dailyUrl(CHALLENGE_DIFFICULTY)}>
                <TrophyIcon className="button__icon" /> Today's Challenge
              </a>
            </div>
          ) : (
            <LeaderboardTable entries={board.entries} />
          )}
        </>
      )}
    </Page>
  );
}
