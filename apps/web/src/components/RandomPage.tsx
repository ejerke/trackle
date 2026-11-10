import { difficultyName, type RandomPuzzleResponse } from "@trackle/shared";
import { useEffect, useMemo, useState } from "react";
import { checkRandomTrack, fetchRandomPuzzle } from "../api";
import { dailyUrl, randomUrl } from "../routes";
import type { ProgressStore, PuzzleKey } from "../storage/progressStore";
import { Game } from "./Game";
import { ModeBar } from "./ModeBar";
import { Page } from "./Page";

type LoadState = { status: "loading" } | { status: "ready"; data: RandomPuzzleResponse } | { status: "error" };

/** A random puzzle. The URL (difficulty + seed) is the puzzle, so it can be shared or revisited. */
export function RandomPage({ difficulty, seed, store }: { difficulty: number; seed: string; store: ProgressStore }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const progressKey = useMemo<PuzzleKey>(() => ({ kind: "random", seed, difficulty }), [seed, difficulty]);

  useEffect(() => {
    fetchRandomPuzzle(difficulty, seed)
      .then((data) => setState({ status: "ready", data }))
      .catch(() => setState({ status: "error" }));
  }, [difficulty, seed]);

  return (
    <Page subtitle={`Random · ${difficultyName(difficulty)}`}>
      <ModeBar kind="random" difficulty={difficulty} />

      {state.status === "loading" && <p className="status">Laying out a new track…</p>}
      {state.status === "error" && <p className="status">Something went wrong creating the puzzle. Try reloading.</p>}
      {state.status === "ready" && (
        <Game
          puzzle={state.data.puzzle}
          progressKey={progressKey}
          store={store}
          check={(cells) => checkRandomTrack(difficulty, seed, cells)}
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
