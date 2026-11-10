import type { PlayablePuzzle } from "@trackle/shared";
import { useEffect, useState, type ReactNode } from "react";
import { ApiRequestError } from "../api";
import { boardMasks, type Mode } from "../board/model";
import { usePuzzleProgress } from "../hooks/usePuzzleProgress";
import type { ProgressStore, PuzzleKey } from "../storage/progressStore";
import { Board } from "./Board";
import { Toolbar } from "./Toolbar";

type CheckState = "idle" | "checking" | "wrong" | "error" | "rateLimited";

interface GameProps {
  puzzle: PlayablePuzzle;
  /** Where this puzzle's progress is saved. */
  progressKey: PuzzleKey;
  store: ProgressStore;
  /** Asks the server whether the track is correct. */
  check(cells: number[][]): Promise<boolean>;
  /** Extra content in the "solved" panel (countdown, next-puzzle buttons). */
  afterSolve?: ReactNode;
}

export function Game({ puzzle, progressKey, store, check: checkWithServer, afterSolve }: GameProps) {
  const { progress, updateBoard, recordCheck, clearBoard } = usePuzzleProgress(store, progressKey, puzzle);
  const [mode, setMode] = useState<Mode>("track");
  const [check, setCheck] = useState<CheckState>("idle");
  const [confirmClear, setConfirmClear] = useState(false);

  // Any edit hides an old "not quite" message.
  useEffect(() => {
    if (check === "wrong") setCheck("idle");
  }, [progress?.board]);

  useEffect(() => {
    if (!confirmClear) return;
    const id = window.setTimeout(() => setConfirmClear(false), 3000);
    return () => window.clearTimeout(id);
  }, [confirmClear]);

  if (!progress) return <p className="status">Loading…</p>;
  const solved = progress.solvedAt !== null;

  const onCheck = async () => {
    const cells = boardMasks(puzzle, progress.board);
    setCheck("checking");
    try {
      const correct = await checkWithServer(cells);
      recordCheck(correct, cells);
      setCheck(correct ? "idle" : "wrong");
    } catch (err) {
      setCheck(err instanceof ApiRequestError && err.status === 429 ? "rateLimited" : "error");
    }
  };

  const onClear = () => {
    if (!confirmClear) return setConfirmClear(true);
    clearBoard();
    setConfirmClear(false);
  };

  return (
    <section className="game">
      <Toolbar mode={mode} onMode={setMode} disabled={solved} />

      <Board layout={puzzle} board={progress.board} mode={mode} locked={solved} onChange={updateBoard} />

      {solved ? (
        <div className="result result--solved" role="status">
          <p className="result__title">Track complete!</p>
          <p className="result__detail">
            Solved with {progress.checks} {progress.checks === 1 ? "check" : "checks"}.
          </p>
          {afterSolve && <div className="result__actions">{afterSolve}</div>}
        </div>
      ) : (
        <>
          <div className="actions">
            <button type="button" className="button" onClick={onClear} disabled={check === "checking"}>
              {confirmClear ? "Really clear?" : "Clear"}
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={onCheck}
              disabled={check === "checking"}
            >
              {check === "checking" ? "Checking…" : "Check"}
            </button>
          </div>
          <p className="message" role="status" aria-live="polite">
            {check === "wrong" && "Not quite. Something doesn't fit yet."}
            {check === "error" && "Couldn't reach the server. Try again."}
            {check === "rateLimited" && "Too many checks too quickly. Wait a few seconds and try again."}
          </p>
        </>
      )}
    </section>
  );
}
