import { CHALLENGE_DIFFICULTY, DIRS, DELTA, utcDate } from "@trackle/shared";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth";
import { challengeHistory, type ChallengeHistory, type ChallengeSolve } from "../challengeHistory";
import { dailyUrl } from "../routes";
import type { ProgressStore } from "../storage/progressStore";
import { Page } from "./Page";

/**
 * Every Challenge the player has solved, newest first, with what each earned
 * (ADR 0025). Built from the progress in this browser, which holds the
 * account's too when signed in. Only the Challenge for now: its days are few
 * and each has points; other levels could join later.
 */
export function HistoryPage({ store }: { store: ProgressStore }) {
  const { user } = useAuth();
  const [history, setHistory] = useState<ChallengeHistory | null>(null);
  const today = utcDate(new Date());

  useEffect(() => {
    void store.list().then((records) => setHistory(challengeHistory(records, today)));
  }, [store, today]);

  const months = useMemo(() => {
    const groups = new Map<string, ChallengeSolve[]>();
    for (const s of history?.solves ?? []) {
      const month = s.date.slice(0, 7);
      if (!groups.has(month)) groups.set(month, []);
      groups.get(month)!.push(s);
    }
    return [...groups];
  }, [history]);

  if (!history) {
    return (
      <Page subtitle="Challenge history" store={store}>
        <p className="status">Loading…</p>
      </Page>
    );
  }

  const solvedToday = history.solves.some((s) => s.date === today);

  return (
    <Page subtitle="Challenge history" store={store}>
      {history.solves.length === 0 ? (
        <div className="status">
          <p>No Challenges solved yet. A new one comes every day: a 10×10 track with no hints at all.</p>
          <a className="button button--primary" href={dailyUrl(CHALLENGE_DIFFICULTY)}>
            Try today's Challenge
          </a>
        </div>
      ) : (
        <>
          <section className="stats-card history-summary" aria-label="Summary">
            <dl>
              <Stat label="Solved" value={history.solves.length} />
              <Stat label="On their day" value={history.scoredCount} />
              <Stat label="Points this month" value={history.monthPoints} />
              <Stat label="Points in all" value={history.points} />
            </dl>
          </section>
          {!solvedToday && (
            <p className="history-today">
              Today's Challenge is still open. <a href={dailyUrl(CHALLENGE_DIFFICULTY)}>Solve it</a> for points.
            </p>
          )}
          {!user && (
            <p className="history-today">
              <a href="/account">Create an account</a> to put these points on the leaderboard: Challenges you
              solved on their day count from the start.
            </p>
          )}
          {months.map(([month, solves]) => (
            <Month key={month} month={month} solves={solves} today={today} />
          ))}
        </>
      )}
      <p className="notice history-note">
        A Challenge solved on its own day (UTC) earns 5 points per square of track. Older ones from the{" "}
        <a href="/archive?difficulty=5">archive</a> count as solved but earn nothing. The{" "}
        <a href="/leaderboard">leaderboard</a> has the final word on points.
      </p>
    </Page>
  );
}

function Month({ month, solves, today }: { month: string; solves: ChallengeSolve[]; today: string }) {
  const title = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  const points = solves.filter((s) => s.scored).reduce((sum, s) => sum + s.points, 0);
  return (
    <section className="history-month">
      <h2>
        {title}
        <span className="history-month__points">{points} points</span>
      </h2>
      <ul>
        {solves.map((s) => (
          <li key={s.date}>
            <a className="history-item" href={s.date === today ? dailyUrl(CHALLENGE_DIFFICULTY) : dailyUrl(CHALLENGE_DIFFICULTY, s.date)}>
              <TrackThumb cells={s.record.solvedCells!} />
              <span className="history-item__text">
                <span className="history-item__date">
                  {new Date(`${s.date}T00:00:00Z`).toLocaleDateString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    timeZone: "UTC",
                  })}
                </span>
                <span className="history-item__detail">
                  {s.trackSquares} squares of track · {s.scored ? "solved on its day" : "solved later"}
                </span>
              </span>
              <span className={`history-item__points${s.scored ? "" : " history-item__points--none"}`}>
                {s.scored ? `+${s.points}` : "–"}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The solved track, small: a line through each square's centre along its piece's directions. */
function TrackThumb({ cells }: { cells: number[][] }) {
  const height = cells.length;
  const width = Math.max(0, ...cells.map((row) => row.length));
  const segments: string[] = [];
  cells.forEach((row, r) =>
    row.forEach((mask, c) => {
      for (const dir of DIRS) {
        if (!(mask & dir)) continue;
        const [dr, dc] = DELTA[dir];
        segments.push(`M${c + 0.5} ${r + 0.5}l${dc * 0.5} ${dr * 0.5}`);
      }
    }),
  );
  return (
    <svg className="history-thumb" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <rect width={width} height={height} rx="0.6" />
      <path d={segments.join("")} />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
