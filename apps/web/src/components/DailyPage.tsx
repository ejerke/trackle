import { difficultyName, type PuzzleResponse } from "@trackle/shared";
import { useEffect, useMemo, useState } from "react";
import { ApiRequestError, checkTrack, dailyAnswer, dailyHint, fetchPuzzle } from "../api";
import { dailyUrl, randomUrl } from "../routes";
import { loadPreferredDifficulty } from "../storage/preferences";
import type { ProgressStore, PuzzleKey } from "../storage/progressStore";
import { Countdown } from "./Countdown";
import { Game } from "./Game";
import { ModeBar } from "./ModeBar";
import { Page } from "./Page";
import { StreakNote } from "./StreakNote";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: PuzzleResponse }
  | { status: "missing" }
  | { status: "error" };

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Today's (or an archive day's) puzzle at one difficulty. */
export function DailyPage({ date, difficulty: fromUrl, store }: { date: string | null; difficulty: number | null; store: ProgressStore }) {
  const [difficulty] = useState(() => fromUrl ?? loadPreferredDifficulty());
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    fetchPuzzle(date ?? undefined, difficulty)
      .then((data) => setState({ status: "ready", data }))
      .catch((err: unknown) =>
        setState(err instanceof ApiRequestError && err.status === 404 ? { status: "missing" } : { status: "error" }),
      );
    // A 429 here only happens under extreme request rates; the generic error (reload) covers it.
  }, [date, difficulty]);

  const ready = state.status === "ready" ? state.data : null;
  const progressKey = useMemo<PuzzleKey | null>(
    () => (ready ? { kind: "daily", date: ready.puzzle.date, difficulty } : null),
    [ready, difficulty],
  );

  return (
    <Page
      subtitle={ready ? `${formatDate(ready.puzzle.date)} · ${difficultyName(difficulty)}` : difficultyName(difficulty)}
    >
      <ModeBar kind="daily" difficulty={difficulty} date={date} />

      {state.status === "loading" && <p className="status">Loading today's track…</p>}
      {state.status === "error" && <p className="status">Something went wrong loading the puzzle. Try reloading.</p>}
      {state.status === "missing" && (
        <div className="status">
          <p>There's no {difficultyName(difficulty)} track for that day.</p>
          <a className="button button--primary" href={dailyUrl(difficulty)}>
            Play today's track
          </a>
        </div>
      )}
      {ready && progressKey && (
        <>
          {date && (
            <p className="notice">
              You're playing an older track. <a href={dailyUrl(difficulty)}>Go to today's</a>
            </p>
          )}
          <Game
            puzzle={ready.puzzle}
            progressKey={progressKey}
            store={store}
            check={(cells) => checkTrack(ready.puzzle.date, difficulty, cells)}
            hint={(cells, empty) => dailyHint(ready.puzzle.date, difficulty, cells, empty)}
            answer={() => dailyAnswer(ready.puzzle.date, difficulty)}
            afterSolve={
              <>
                <StreakNote store={store} difficulty={difficulty} />
                <Countdown target={ready.nextPuzzleAt} />
                <a className="button" href={randomUrl(difficulty)}>
                  Play a random one
                </a>
              </>
            }
          />
        </>
      )}
    </Page>
  );
}
