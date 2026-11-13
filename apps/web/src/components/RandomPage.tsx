import { difficultyName, type RandomPuzzleResponse } from "@trackle/shared";
import { useEffect, useMemo, useState } from "react";
import { ApiRequestError, checkRandomTrack, fetchRandomPuzzle, randomAnswer, randomHint } from "../api";
import { dailyUrl, randomUrl } from "../routes";
import { lastRandomSeed, rememberRandomSeed } from "../storage/preferences";
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
  // The random puzzle you had here before this one, to go back to while waiting.
  const previousSeed = useMemo(() => {
    const last = lastRandomSeed(difficulty);
    return last === seed ? null : last;
  }, [difficulty, seed]);
  // Bumped to try loading again once a rate limit has passed.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchRandomPuzzle(difficulty, seed)
      .then((data) => {
        if (cancelled) return;
        // Only now is this "the" random puzzle at this difficulty (ModeBar returns here).
        rememberRandomSeed(difficulty, seed);
        setState({ status: "ready", data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState(
          err instanceof ApiRequestError && err.status === 429
            ? { status: "rateLimited", retryAfterSeconds: err.retryAfterSeconds }
            : { status: "error" },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [difficulty, seed, attempt]);

  return (
    <Page subtitle={`Random · ${difficultyName(difficulty)}`} store={store}>
      <ModeBar kind="random" difficulty={difficulty} />

      {state.status === "loading" && <p className="status">Laying out a new track…</p>}
      {state.status === "error" && <p className="status">Something went wrong creating the puzzle. Try reloading.</p>}
      {state.status === "rateLimited" && (
        <RateLimited
          seconds={state.retryAfterSeconds ?? 5}
          onDone={() => {
            setState({ status: "loading" });
            setAttempt((n) => n + 1);
          }}
          back={previousSeed ? randomUrl(difficulty, previousSeed) : null}
        />
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

/**
 * New random puzzles come one every few seconds per level, or straight away
 * once you've finished the last one (the server decides). Counts down, then
 * loads the puzzle by itself.
 */
function RateLimited({ seconds, onDone, back }: { seconds: number; onDone: () => void; back: string | null }) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    if (left <= 0) {
      onDone();
      return;
    }
    const id = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [left]); // not onDone: a fresh closure every render, and only the count matters

  return (
    <div className="status">
      <p>
        New random puzzles come one every few seconds, or straight away once you've finished the last one.
      </p>
      <p>
        Laying out your new track in <b>{Math.max(left, 0)}</b>…
      </p>
      {back && (
        <a className="button" href={back}>
          Back to your last puzzle
        </a>
      )}
    </div>
  );
}
