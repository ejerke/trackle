import { difficultyName, type RandomPuzzleResponse } from "@trackle/shared";
import { useEffect, useMemo, useState } from "react";
import { ApiRequestError, checkRandomTrack, fetchRandomPuzzle, randomAnswer, randomHint } from "../api";
import { dailyUrl, randomUrl } from "../routes";
import { rememberRandomSeed } from "../storage/preferences";
import type { ProgressStore, PuzzleKey } from "../storage/progressStore";
import { Game } from "./Game";
import { ModeBar } from "./ModeBar";
import { Page } from "./Page";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: RandomPuzzleResponse }
  | { status: "rateLimited"; retryAfterSeconds: number | null }
  | { status: "error" };

/** A random puzzle. The URL (difficulty + seed) is the puzzle, so it can be shared or revisited. */
export function RandomPage({ difficulty, seed, store }: { difficulty: number; seed: string; store: ProgressStore }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const progressKey = useMemo<PuzzleKey>(() => ({ kind: "random", seed, difficulty }), [seed, difficulty]);

  // This is now "the" random puzzle at this difficulty (ModeBar returns here).
  useEffect(() => rememberRandomSeed(difficulty, seed), [difficulty, seed]);

  useEffect(() => {
    fetchRandomPuzzle(difficulty, seed)
      .then((data) => setState({ status: "ready", data }))
      .catch((err: unknown) =>
        setState(
          err instanceof ApiRequestError && err.status === 429
            ? { status: "rateLimited", retryAfterSeconds: err.retryAfterSeconds }
            : { status: "error" },
        ),
      );
  }, [difficulty, seed]);

  return (
    <Page subtitle={`Random · ${difficultyName(difficulty)}`} store={store}>
      <ModeBar kind="random" difficulty={difficulty} />

      {state.status === "loading" && <p className="status">Laying out a new track…</p>}
      {state.status === "error" && <p className="status">Something went wrong creating the puzzle. Try reloading.</p>}
      {state.status === "rateLimited" && (
        <div className="status">
          <p>
            You're laying out new tracks faster than we can build them. Try again
            {state.retryAfterSeconds ? ` in ${state.retryAfterSeconds} seconds` : " in a moment"}.
          </p>
          <button type="button" className="button button--primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      )}
      {state.status === "ready" && (
        <Game
          puzzle={state.data.puzzle}
          progressKey={progressKey}
          store={store}
          check={(cells) => checkRandomTrack(difficulty, seed, cells)}
          hint={(kind, cells, empty) => randomHint(difficulty, seed, kind, cells, empty)}
          answer={() => randomAnswer(difficulty, seed)}
          afterSolve={
            <>
              <a className="button button--primary" href={randomUrl(difficulty)}>
                New random puzzle
              </a>
              <a className="button" href={dailyUrl(difficulty)}>
                Today's track
              </a>
            </>
          }
        />
      )}
    </Page>
  );
}
