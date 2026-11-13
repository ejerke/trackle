import { CHALLENGE_DIFFICULTY, POINTS_PER_TRACK_SQUARE, type LeaderboardPeriod, type LeaderboardResponse } from "@trackle/shared";
import { useEffect, useState } from "react";
import { fetchLeaderboard, setLeaderboardVisibility } from "../api";
import { useAuth } from "../auth";
import { dailyUrl } from "../routes";
import type { ProgressStore } from "../storage/progressStore";
import { TrophyIcon } from "./ModeBar";
import { Page } from "./Page";

const PERIODS: { period: LeaderboardPeriod; label: string }[] = [
  { period: "month", label: "This month" },
  { period: "all", label: "All time" },
];

const monthName = (from: string) =>
  new Date(`${from}T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * Points from daily Challenges solved on their day (ADR 0025). The server
 * computes everything; this page only shows it. Players appear by name only
 * once they've chosen to.
 */
export function LeaderboardPage({ store }: { store: ProgressStore }) {
  const { user, userChanged } = useAuth();
  const [period, setPeriod] = useState<LeaderboardPeriod>("month");
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [toggling, setToggling] = useState(false);
  // Bumped to load again (after showing or hiding yourself).
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetchLeaderboard(period)
      .then((b) => !cancelled && setBoard(b))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [period, version]);

  const toggleVisible = async (visible: boolean) => {
    setToggling(true);
    try {
      const res = await setLeaderboardVisibility(visible);
      if (res.user) userChanged(res.user);
      setVersion((n) => n + 1);
    } catch {
      setFailed(true);
    } finally {
      setToggling(false);
    }
  };

  const me = board?.me ?? null;

  return (
    <Page subtitle="Challenge leaderboard" store={store}>
      <nav className="mode-bar" aria-label="Period">
        <div className="segmented" role="group">
          {PERIODS.map((p) => (
            <button
              key={p.period}
              type="button"
              className="segmented__option"
              aria-pressed={p.period === period}
              onClick={() => setPeriod(p.period)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </nav>

      <p className="notice">
        Every day's <a href={dailyUrl(CHALLENGE_DIFFICULTY)}>Challenge</a> is worth {POINTS_PER_TRACK_SQUARE} points
        per square of track, when you solve it on its day (UTC). There are no hints.
      </p>

      {failed && <p className="status">Couldn't load the leaderboard. Try reloading.</p>}
      {!board && !failed && <p className="status">Loading…</p>}

      {board && (
        <>
          <section className="stats-card leaderboard-me">
            {user && me ? (
              <>
                <p>
                  {board.period === "month" && board.from ? `${monthName(board.from)}: ` : "All time: "}
                  <b>{me.points} points</b> from {me.solved} {me.solved === 1 ? "Challenge" : "Challenges"}
                  {me.rank !== null && (
                    <>
                      {" "}
                      · <b>#{me.rank}</b>
                    </>
                  )}
                </p>
                <label className="leaderboard-me__toggle">
                  <input
                    type="checkbox"
                    checked={user.onLeaderboard}
                    disabled={toggling}
                    onChange={(e) => void toggleVisible(e.target.checked)}
                  />
                  Show <b>{user.username}</b> on the leaderboard
                </label>
              </>
            ) : (
              <p>
                <a href="/account">Sign in</a> to collect points. Challenges you solve on their day before signing up
                count too.
              </p>
            )}
          </section>

          {board.entries.length === 0 ? (
            <div className="status">
              <p>No one on the board{board.period === "month" ? " this month" : ""} yet.</p>
              <a className="button button--primary" href={dailyUrl(CHALLENGE_DIFFICULTY)}>
                <TrophyIcon className="button__icon" /> Today's Challenge
              </a>
            </div>
          ) : (
            <table className="leaderboard">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Player</th>
                  <th scope="col">Solved</th>
                  <th scope="col">Points</th>
                </tr>
              </thead>
              <tbody>
                {board.entries.map((e) => (
                  <tr key={e.username} className={user?.username === e.username ? "leaderboard__me" : undefined}>
                    <td>{e.rank}</td>
                    <td>{e.username}</td>
                    <td>{e.solved}</td>
                    <td>{e.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Page>
  );
}
