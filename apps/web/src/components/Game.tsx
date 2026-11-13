import {
  canShowAnswer,
  edgeCells,
  hintsLeft,
  isBookmarked,
  totalHints,
  validateTrack,
  type CheckResponse,
  type HintKind,
  type HintResponse,
  type PlayablePuzzle,
  type PuzzleProgress,
} from "@trackle/shared";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiRequestError } from "../api";
import { applyHint, boardMasks, type Mode } from "../board/model";
import { usePuzzleProgress } from "../hooks/usePuzzleProgress";
import { useStreak } from "../hooks/useStreak";
import type { ProgressStore, PuzzleKey } from "../storage/progressStore";
import { knownSolution } from "../storage/replay";
import { formatDuration } from "../time";
import { Board, type Highlight } from "./Board";
import { Clock } from "./Clock";
import { Toolbar } from "./Toolbar";

type CheckState = "idle" | "checking" | "wrong" | "error" | "rateLimited";

/** How long a hinted square stays highlighted (it stays on the board, locked). */
const HIGHLIGHT_MS = 3500;

interface GameProps {
  puzzle: PlayablePuzzle;
  /** Where this puzzle's progress is saved. */
  progressKey: PuzzleKey;
  store: ProgressStore;
  /**
   * Asks the server whether the track is correct. Called by itself once the
   * track looks complete. A correct daily puzzle also gets a solve receipt.
   */
  check(cells: number[][]): Promise<CheckResponse>;
  /** Asks the server for a hint of this kind about this board. Omitted: no hint buttons (e.g. the lab). */
  hint?(kind: HintKind, cells: number[][], emptyCells: [number, number][]): Promise<HintResponse>;
  /** Asks the server for the solution. Omitted: no "Show answer" button. */
  answer?(): Promise<number[][]>;
  /** Extra content in the "solved" / "answer shown" panel (countdown, next-puzzle buttons). */
  afterSolve?: ReactNode;
  /**
   * Show the clock and solve times (default true). The Challenge hides them:
   * it's about solving, not speed (ADR 0025). Time is still recorded for stats.
   */
  timed?: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "solved with 2 hints in 3:10" / "answer shown": the first attempt's result, which is what counts. */
function firstResult(record: PuzzleProgress, timed: boolean): string {
  if (!record.solvedAt) return "answer shown";
  const how = totalHints(record) === 0 ? "solved on your own" : `solved with ${plural(totalHints(record), "hint")}`;
  return timed && record.timeMs > 0 ? `${how} in ${formatDuration(record.timeMs)}` : how;
}

export function Game({ puzzle, progressKey, store, check: checkWithServer, hint, answer: answerProp, afterSolve, timed = true }: GameProps) {
  const {
    progress,
    record,
    runningSince,
    updateBoard,
    recordCheck,
    recordHint,
    revealAnswer,
    clearBoard,
    canSaveToAccount,
    saveToAccount,
    playAgain,
    stopReplay,
    toggleBookmark,
  } = usePuzzleProgress(store, progressKey, puzzle);
  const [saving, setSaving] = useState<"idle" | "saving" | "error">("idle");
  const [mode, setMode] = useState<Mode>("track");
  const [check, setCheck] = useState<CheckState>("idle");
  const [confirmClear, setConfirmClear] = useState(false);
  const [helping, setHelping] = useState(false);
  const [helpMessage, setHelpMessage] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  // One wagon per day of the player's streak, counted again after a solve.
  const streak = useStreak(store).current;
  const answerDialog = useRef<HTMLDialogElement>(null);
  // Bumped to run the celebration train; see the effect below.
  const [trainRun, setTrainRun] = useState(0);
  // Was this puzzle already solved when we last looked? Keyed by puzzle, since
  // the same Game can be reused when the player switches puzzles.
  const lastSolved = useRef<{ key: string; solved: boolean } | null>(null);
  // The last board sent for checking, so each finished track is checked once.
  const lastChecked = useRef<string | null>(null);

  const runCheck = async (cells: number[][]) => {
    setCheck("checking");
    try {
      const { correct, receipt } = await checkWithServer(cells);
      recordCheck(correct, cells, receipt ?? null);
      setCheck(correct ? "idle" : "wrong");
    } catch (err) {
      setCheck(err instanceof ApiRequestError && err.status === 429 ? "rateLimited" : "error");
    }
  };

  // No Check button: a track that follows every rule is the solution (the
  // puzzle has exactly one), so it's checked as soon as it's drawn. The
  // server still has the final word (ADR 0004).
  useEffect(() => {
    if (!progress || progress.solvedAt || progress.revealedAt) return;
    if (check === "wrong") setCheck("idle"); // any edit hides an old "not quite"
    const cells = boardMasks(puzzle, progress.board);
    if (!validateTrack(puzzle, cells).ok) return;
    const signature = JSON.stringify(cells);
    if (lastChecked.current === signature) return;
    lastChecked.current = signature;
    void runCheck(cells);
  }, [progress?.board]);

  // A solve that happens while you watch sends a train along the track.
  // Opening an already-solved puzzle doesn't (use "Run the train" for that).
  // It runs even with "reduce motion" on: people often set that to make the
  // phone feel faster, not to hide a short, one-off celebration.
  useEffect(() => {
    if (!progress) return;
    // Each attempt (the first, every replay) is its own: switching isn't a solve.
    const key = JSON.stringify(progressKey) + (record?.replay?.startedAt ?? "");
    const solved = progress.solvedAt !== null;
    const before = lastSolved.current;
    lastSolved.current = { key, solved };
    if (before && before.key !== key) setTrainRun(0); // a new puzzle: no train left over
    if (before?.key === key && !before.solved && solved) setTrainRun((n) => n + 1);
  }, [progress?.solvedAt, progressKey, record?.replay?.startedAt]);

  useEffect(() => {
    if (!confirmClear) return;
    const id = window.setTimeout(() => setConfirmClear(false), 3000);
    return () => window.clearTimeout(id);
  }, [confirmClear]);

  useEffect(() => {
    if (!highlight) return;
    const id = window.setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(id);
  }, [highlight]);

  if (!progress || !record) return <p className="status">Loading…</p>;
  const solved = progress.solvedAt !== null;
  const revealed = progress.revealedAt !== null;
  const finished = solved || revealed;
  // "Try again" (ADR 0024): a replay of a finished puzzle, which never changes its result.
  const replaying = record.replay !== null;
  // The answer: from the server where the level offers it (never Hard). In a
  // replay the record already holds it, so every level offers it.
  const solution = replaying ? knownSolution(record, puzzle) : null;
  const answer = replaying
    ? solution
      ? async () => solution
      : undefined
    : canShowAnswer(puzzle.difficulty)
      ? answerProp
      : undefined;

  const onPlayAgain = () => {
    lastChecked.current = null; // the same track drawn again gets checked again
    setCheck("idle");
    setHelpMessage(null);
    setHighlight(null);
    setConfirmClear(false);
    playAgain();
  };
  const onStopReplay = () => {
    setHelpMessage(null);
    setHighlight(null);
    stopReplay();
  };
  const bookmark = isBookmarked(record);
  const bookmarkName = bookmark ? record.bookmark?.name : undefined;
  const tryAgain = (
    <button type="button" className="button" onClick={onPlayAgain}>
      Try again
    </button>
  );
  const backToResult = (
    <button type="button" className="link-button" onClick={onStopReplay}>
      Back to your result
    </button>
  );

  const retryCheck = () => void runCheck(boardMasks(puzzle, progress.board));

  const used: Record<HintKind, number> = { track: progress.hintsUsed, empty: progress.emptyHintsUsed };
  const left = (kind: HintKind) => hintsLeft(puzzle.difficulty, used[kind], kind);

  const onHint = async (kind: HintKind) => {
    if (!hint || left(kind) === 0) return;
    const emptyCells = Object.entries(progress.board.marks)
      .filter(([, mark]) => mark === "empty")
      .map(([key]) => key.split(":").map(Number) as [number, number]);
    setHelping(true);
    try {
      const res = await hint(kind, boardMasks(puzzle, progress.board), emptyCells);
      if (res.kind === "complete") {
        setHelpMessage(kind === "track" ? "All the track is in place." : "Every square without track is marked.");
        return;
      }
      const cleared =
        res.kind === "piece"
          ? res.remove.length > 0
          : progress.board.edges.some((e) => edgeCells(e).some((c) => c.row === res.row && c.col === res.col));
      recordHint(kind, (b) => applyHint(puzzle, b, res));
      setHighlight({ tone: "hint", cells: [{ row: res.row, col: res.col }], edges: [] });
      setHelpMessage(
        (res.kind === "piece" ? "Here's a piece of track." : "This square has no track.") +
          (cleared ? " Wrong segments were removed." : ""),
      );
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
    answerDialog.current?.close();
    if (!answer) return;
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
      <div className="play-bar">
        <Toolbar mode={mode} onMode={setMode} disabled={finished} />
        {timed && !revealed && !(solved && progress.timeMs === 0) && (
          <Clock timeMs={progress.timeMs} runningSince={runningSince} />
        )}
        <button
          type="button"
          className={`bookmark-button${bookmark ? " bookmark-button--on" : ""}`}
          onClick={toggleBookmark}
          aria-pressed={bookmark}
          aria-label={bookmark ? "Remove bookmark" : "Bookmark this puzzle"}
          title={
            bookmark
              ? `Bookmarked${bookmarkName ? ` as “${bookmarkName}”` : ""}. Tap to remove.`
              : "Bookmark this puzzle, to find it again under Bookmarks"
          }
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M5.5 3h9v14l-4.5-3.6L5.5 17z"
              fill={bookmark ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {bookmarkName && (
        <p className="bookmark-name">
          <a href="/bookmarks" title="Your bookmarks: rename it there">
            {bookmarkName}
          </a>
        </p>
      )}

      <Board
        layout={puzzle}
        board={progress.board}
        mode={mode}
        locked={finished}
        onChange={updateBoard}
        highlight={highlight}
        trainRun={trainRun}
        trainWagons={streak}
      />

      {!!puzzle.crossings && (
        <p className="puzzle-note">
          {puzzle.crossings === 1
            ? "The track crosses itself once: straight over, at right angles."
            : `The track crosses itself ${puzzle.crossings} times: straight over, at right angles.`}
        </p>
      )}

      {replaying && solved ? (
        <div className="result result--solved" role="status">
          <p className="result__title">Track complete again</p>
          <p className="result__detail">
            {totalHints(progress) === 0 ? "Solved on your own" : `Solved with ${plural(totalHints(progress), "hint")}`}
            {timed && progress.timeMs > 0 && (
              <>
                {" "}
                in <b className="result__time">{formatDuration(progress.timeMs)}</b>
              </>
            )}
            . A retry doesn't change your result: your first try counts ({firstResult(record, timed)}).
          </p>
          <div className="result__actions">
            {tryAgain}
            {afterSolve}
          </div>
          <button type="button" className="link-button" onClick={() => setTrainRun((n) => n + 1)}>
            Run the train
          </button>{" "}
          {backToResult}
        </div>
      ) : replaying && revealed ? (
        <div className="result result--revealed" role="status">
          <p className="result__title">Answer shown</p>
          <p className="result__detail">This try is over. Your first try still counts ({firstResult(record, timed)}).</p>
          <div className="result__actions">
            {tryAgain}
            {afterSolve}
          </div>
          {backToResult}
        </div>
      ) : solved ? (
        <div className="result result--solved" role="status">
          <p className="result__title">{totalHints(progress) === 0 ? "Track complete!" : "Track complete"}</p>
          <p className="result__detail">
            {totalHints(progress) === 0 ? "Solved on your own" : `Solved with ${plural(totalHints(progress), "hint")}`}
            {timed && progress.timeMs > 0 && (
              <>
                {" "}
                in <b className="result__time">{formatDuration(progress.timeMs)}</b>
              </>
            )}
            .
          </p>
          <div className="result__actions">
            {afterSolve}
            {tryAgain}
          </div>
          <button type="button" className="link-button" onClick={() => setTrainRun((n) => n + 1)}>
            Run the train
          </button>
        </div>
      ) : revealed ? (
        <div className="result result--revealed" role="status">
          <p className="result__title">Answer shown</p>
          <p className="result__detail">This is the solution. It doesn't count as solved.</p>
          <div className="result__actions">
            {afterSolve}
            {tryAgain}
          </div>
        </div>
      ) : (
        <>
          {replaying && (
            <p className="notice replay-note">
              Trying again: new hints, and the answer if you need it. This doesn't change your result; your first
              try counts ({firstResult(record, timed)}). {backToResult}
            </p>
          )}
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
            {check === "checking" && <span className="message--quiet">Checking your track…</span>}
            {check === "wrong" && "Not quite. Something doesn't fit yet."}
            {(check === "error" || check === "rateLimited") && (
              <>
                {check === "error" ? "Couldn't check your track." : "Too many checks too quickly."}{" "}
                <button type="button" className="link-button" onClick={retryCheck}>
                  Try again
                </button>
              </>
            )}
            {check === "idle" && helpMessage}
          </p>
          {(hint || answer) && (
            <div className="help-row">
              {hint &&
                (["track", "empty"] as const).map((kind) => {
                  const name = kind === "track" ? "Track hint" : "No-track hint";
                  const n = left(kind);
                  return (
                    <button
                      key={kind}
                      type="button"
                      className="link-button"
                      onClick={() => void onHint(kind)}
                      disabled={helping || n === 0}
                      title={kind === "track" ? "Reveal a piece of track" : "Reveal a square without track"}
                    >
                      {n === null ? `${name}${used[kind] > 0 ? ` (${used[kind]} used)` : ""}` : n === 0 ? `No ${name.toLowerCase()}s left` : `${name} (${n} left)`}
                    </button>
                  );
                })}
              {answer && (
                <button type="button" className="link-button" onClick={() => answerDialog.current?.showModal()} disabled={helping}>
                  Show answer
                </button>
              )}
            </div>
          )}
        </>
      )}

      {answer && (
        <dialog
          ref={answerDialog}
          className="confirm"
          aria-labelledby="confirm-answer-title"
          // A click on the backdrop lands on the <dialog> itself: cancel.
          onClick={(e) => e.target === e.currentTarget && answerDialog.current?.close()}
        >
          <div className="confirm__body">
            <h2 id="confirm-answer-title">Show the answer?</h2>
            <p>
              {replaying
                ? `This ends this try. Your first try still counts (${firstResult(record, timed)}).`
                : progressKey.kind === "daily"
                  ? "This puzzle won't count as solved, and it won't count toward your streak. You can't undo this."
                  : "This puzzle won't count as solved. You can't undo this."}
            </p>
            <div className="confirm__buttons">
              <button type="button" className="button" onClick={() => answerDialog.current?.close()} autoFocus>
                Keep trying
              </button>
              <button type="button" className="button button--danger" onClick={() => void onAnswer()}>
                Show answer
              </button>
            </div>
          </div>
        </dialog>
      )}
    </section>
  );
}
