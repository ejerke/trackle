import { canShowAnswer, hintsLeft, type HintResponse, type PlayablePuzzle } from "@trackle/shared";
import { useEffect, useState, type ReactNode } from "react";
import { ApiRequestError } from "../api";
import { boardMasks, placePiece, type Mode } from "../board/model";
import { usePuzzleProgress } from "../hooks/usePuzzleProgress";
import type { ProgressStore, PuzzleKey } from "../storage/progressStore";
import { Board, type Highlight } from "./Board";
import { Toolbar } from "./Toolbar";

type CheckState = "idle" | "checking" | "wrong" | "error" | "rateLimited";

/** How long a hinted piece or mistake stays highlighted. */
const HIGHLIGHT_MS = 3500;

interface GameProps {
  puzzle: PlayablePuzzle;
  /** Where this puzzle's progress is saved. */
  progressKey: PuzzleKey;
  store: ProgressStore;
  /** Asks the server whether the track is correct. */
  check(cells: number[][]): Promise<boolean>;
  /** Asks the server for a hint about this board. Omitted: no Hint button (e.g. the lab). */
  hint?(cells: number[][], emptyCells: [number, number][]): Promise<HintResponse>;
  /** Asks the server for the solution. Omitted: no "Show answer" button. */
  answer?(): Promise<number[][]>;
  /** Extra content in the "solved" / "answer shown" panel (countdown, next-puzzle buttons). */
  afterSolve?: ReactNode;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function Game({ puzzle, progressKey, store, check: checkWithServer, hint, answer: answerProp, afterSolve }: GameProps) {
  // Some levels (Hard) never offer the answer.
  const answer = canShowAnswer(puzzle.difficulty) ? answerProp : undefined;
  const {
    progress,
    updateBoard,
    recordCheck,
    recordHint,
    revealAnswer,
    clearBoard,
    canSaveToAccount,
    saveToAccount,
  } = usePuzzleProgress(store, progressKey, puzzle);
  const [saving, setSaving] = useState<"idle" | "saving" | "error">("idle");
  const [mode, setMode] = useState<Mode>("track");
  const [check, setCheck] = useState<CheckState>("idle");
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmAnswer, setConfirmAnswer] = useState(false);
  const [helping, setHelping] = useState(false);
  const [helpMessage, setHelpMessage] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);

  // Any edit hides an old "not quite" message.
  useEffect(() => {
    if (check === "wrong") setCheck("idle");
  }, [progress?.board]);

  useEffect(() => {
    if (!confirmClear) return;
    const id = window.setTimeout(() => setConfirmClear(false), 3000);
    return () => window.clearTimeout(id);
  }, [confirmClear]);

  useEffect(() => {
    if (!confirmAnswer) return;
    const id = window.setTimeout(() => setConfirmAnswer(false), 4000);
    return () => window.clearTimeout(id);
  }, [confirmAnswer]);

  useEffect(() => {
    if (!highlight) return;
    const id = window.setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(id);
  }, [highlight]);

  if (!progress) return <p className="status">Loading…</p>;
  const solved = progress.solvedAt !== null;
  const revealed = progress.revealedAt !== null;
  const finished = solved || revealed;

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

  const left = hintsLeft(puzzle.difficulty, progress.hintsUsed);

  const onHint = async () => {
    if (!hint || left === 0) return;
    const emptyCells = Object.entries(progress.board.marks)
      .filter(([, mark]) => mark === "empty")
      .map(([key]) => key.split(":").map(Number) as [number, number]);
    setHelping(true);
    try {
      const res = await hint(boardMasks(puzzle, progress.board), emptyCells);
      if (res.kind === "complete") {
        setHelpMessage("Your track is complete. Press Check!");
        return;
      }
      recordHint();
      if (res.kind === "piece") {
        const cell = { row: res.row, col: res.col };
        updateBoard((b) => placePiece(puzzle, b, cell, res.piece));
        setHighlight({ tone: "hint", cells: [cell], edges: [] });
        setHelpMessage("Here's the next piece.");
      } else {
        setHighlight({ tone: "mistake", cells: res.cell ? [res.cell] : [], edges: res.edge ? [res.edge] : [] });
        setHelpMessage(res.edge ? "This segment doesn't belong." : "This square does have track.");
      }
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : null;
      setHelpMessage(
        code === "hint_limit"
          ? "No hints left for this puzzle."
          : code === "rate_limited"
            ? "Slow down a little and try again."
            : "Couldn't get a hint. Try again.",
      );
    } finally {
      setHelping(false);
    }
  };

  const onAnswer = async () => {
    if (!answer) return;
    if (!confirmAnswer) return setConfirmAnswer(true);
    setConfirmAnswer(false);
    setHelping(true);
    try {
      revealAnswer(await answer());
      setHelpMessage(null);
      setHighlight(null);
    } catch {
      setHelpMessage("Couldn't load the answer. Try again.");
    } finally {
      setHelping(false);
    }
  };

  const onSave = async () => {
    setSaving("saving");
    try {
      await saveToAccount();
      setSaving("idle");
    } catch {
      setSaving("error");
    }
  };

  const onClear = () => {
    if (!confirmClear) return setConfirmClear(true);
    clearBoard();
    setConfirmClear(false);
  };

  return (
    <section className="game">
      <Toolbar mode={mode} onMode={setMode} disabled={finished} />

      <Board
        layout={puzzle}
        board={progress.board}
        mode={mode}
        locked={finished}
        onChange={updateBoard}
        highlight={highlight}
      />

      {solved ? (
        <div className="result result--solved" role="status">
          <p className="result__title">{progress.hintsUsed === 0 ? "Track complete!" : "Track complete"}</p>
          <p className="result__detail">
            {progress.hintsUsed === 0
              ? `Solved on your own with ${plural(progress.checks, "check")}.`
              : `Solved with ${plural(progress.hintsUsed, "hint")} and ${plural(progress.checks, "check")}.`}
          </p>
          {afterSolve && <div className="result__actions">{afterSolve}</div>}
        </div>
      ) : revealed ? (
        <div className="result result--revealed" role="status">
          <p className="result__title">Answer shown</p>
          <p className="result__detail">This is the solution. It doesn't count as solved.</p>
          {afterSolve && <div className="result__actions">{afterSolve}</div>}
        </div>
      ) : (
        <>
          <div className="actions">
            <button type="button" className="button" onClick={onClear} disabled={check === "checking"}>
              {confirmClear ? "Really clear?" : "Clear"}
            </button>
            {canSaveToAccount && (
              <button
                type="button"
                className="button"
                onClick={onSave}
                disabled={saving === "saving" || !progress.boardDirty}
                title="Save this board to your account, to continue on another device"
              >
                {saving === "saving" ? "Saving…" : progress.boardDirty ? "Save" : "Saved"}
              </button>
            )}
            <button
              type="button"
              className="button button--primary"
              onClick={onCheck}
              disabled={check === "checking"}
            >
              {check === "checking" ? "Checking…" : "Check"}
            </button>
          </div>
          {canSaveToAccount && (
            <p className="save-status">
              {saving === "error"
                ? "Couldn't save. Try again."
                : progress.boardDirty
                  ? "Unsaved changes. Saved boards continue on your other devices."
                  : progress.boardSavedAt
                    ? `Saved to your account at ${new Date(progress.boardSavedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}.`
                    : "Nothing to save yet."}
            </p>
          )}
          <p className="message" role="status" aria-live="polite">
            {check === "wrong" && "Not quite. Something doesn't fit yet."}
            {check === "error" && "Couldn't reach the server. Try again."}
            {check === "rateLimited" && "Too many checks too quickly. Wait a few seconds and try again."}
            {check === "idle" && helpMessage}
          </p>
          {(hint || answer) && (
            <div className="help-row">
              {hint && (
                <button type="button" className="link-button" onClick={onHint} disabled={helping || left === 0}>
                  {left === null
                    ? `Hint${progress.hintsUsed > 0 ? ` (${progress.hintsUsed} used)` : ""}`
                    : left === 0
                      ? "No hints left"
                      : `Hint (${left} left)`}
                </button>
              )}
              {answer && (
                <button
                  type="button"
                  className={`link-button${confirmAnswer ? " link-button--danger" : ""}`}
                  onClick={onAnswer}
                  disabled={helping}
                >
                  {confirmAnswer ? "Really show the answer?" : "Show answer"}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
