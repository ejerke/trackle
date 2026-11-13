import type { LeaderboardEntry, LeaderboardPeriod, LeaderboardResponse } from "@trackle/shared";
import { useCallback, useEffect, useState } from "react";
import { fetchLeaderboard, setLeaderboardVisibility } from "../api";
import { useAuth } from "../auth";

/**
 * Pieces of the Challenge leaderboard (ADR 0025), shared by the full page and
 * the board under the Challenge.
 */

/** The board for a period, loaded again whenever `refreshKey` changes or reload() is called. */
export function useLeaderboard(period: LeaderboardPeriod, refreshKey = 0) {
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [failed, setFailed] = useState(false);
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
  }, [period, refreshKey, version]);

  const reload = useCallback(() => setVersion((n) => n + 1), []);
  return { board, failed, reload };
}

const monthName = (from: string) =>
  new Date(`${from}T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

/** Your points and rank, and the "show me" choice; or how to start collecting points. */
export function MyStanding({ board, onChanged }: { board: LeaderboardResponse; onChanged: () => void }) {
  const { user, userChanged } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const me = board.me;

  const toggle = async (visible: boolean) => {
    setBusy(true);
    setError(false);
    try {
      const res = await setLeaderboardVisibility(visible);
      if (res.user) userChanged(res.user);
      onChanged();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  if (!user || !me) {
    return (
      <p className="leaderboard-me">
        <a href="/account">Sign in</a> to collect points. Challenges you solve on their day before signing up count
        too.
      </p>
    );
  }
  return (
    <div className="leaderboard-me">
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
        <input type="checkbox" checked={user.onLeaderboard} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
        Show <b>{user.username}</b> on the leaderboard
      </label>
      {error && <p className="form__error">Couldn't change that. Try again.</p>}
    </div>
  );
}

/** Rank, player, solved, points; your own row highlighted. */
export function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  const { user } = useAuth();
  return (
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
        {entries.map((e) => (
          <tr key={e.username} className={user?.username === e.username ? "leaderboard__me" : undefined}>
            <td>{e.rank}</td>
            <td>{e.username}</td>
            <td>{e.solved}</td>
            <td>{e.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
