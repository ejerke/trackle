import { type Cell, type PuzzleLayout } from "@trackle/shared";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Mode } from "../board/model";
import type { BoardState, CellMark } from "../storage/progressStore";
import { Board, type Highlight } from "./Board";

/**
 * Little looping animations for the how-to-play pages. Each one is a script
 * of frames, played on the real (locked) Board, so the examples look exactly
 * like the game.
 */

export interface Frame {
  board: BoardState;
  /** How long this frame shows. */
  ms: number;
  caption?: ReactNode;
  highlight?: Highlight;
  /** A finger/mouse pointer over a square; `down` = pressing. */
  pointer?: { cell: Cell; down: boolean };
  /** Send the train along the (finished) track. */
  train?: boolean;
}

/** A frame as written in a script: unset caption/board carry over from the frame before. */
export type Step = Partial<Frame> & { ms: number };

/** Fill each step's missing board and caption in from the step before. */
export function script(steps: Step[]): Frame[] {
  let board: BoardState = { edges: [], marks: {} };
  let caption: ReactNode = undefined;
  return steps.map((s) => {
    board = s.board ?? board;
    caption = "caption" in s ? s.caption : caption;
    return { ...s, board, caption };
  });
}

export const boardOf = (edges: string[], marks: Record<string, CellMark> = {}): BoardState => ({ edges, marks });

/** Marks for a list of [row, col]. */
export const marksOf = (mark: CellMark, cells: [number, number][]): Record<string, CellMark> =>
  Object.fromEntries(cells.map(([r, c]) => [`${r}:${c}`, mark]));

/** Highlight whole squares. */
export const squares = (cells: [number, number][]): Highlight => ({
  tone: "hint",
  cells: cells.map(([row, col]) => ({ row, col })),
  edges: [],
});

function Pointer({ pointer }: { pointer: Frame["pointer"] }) {
  // While away (faded out), stay where it was rather than flying off.
  const last = useRef<Cell>({ row: 0, col: 0 });
  if (pointer) last.current = pointer.cell;
  const [x, y] = [last.current.col + 0.5, last.current.row + 0.5];
  return (
    <g
      className={`demo-pointer${pointer ? "" : " demo-pointer--away"}${pointer?.down ? " demo-pointer--down" : ""}`}
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      <circle r={0.3} className="demo-pointer__ring" />
      <circle r={0.13} className="demo-pointer__dot" />
    </g>
  );
}

/** Plays `frames` in a loop while `active`; otherwise shows the first frame. */
export function Demo({ layout, frames, active, mode = "track" }: { layout: PuzzleLayout; frames: Frame[]; active: boolean; mode?: Mode }) {
  const [at, setAt] = useState(0);
  const [loop, setLoop] = useState(0);

  useEffect(() => {
    setAt(0);
  }, [active, frames]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => {
      if (at + 1 < frames.length) setAt(at + 1);
      else {
        setAt(0);
        setLoop((n) => n + 1);
      }
    }, frames[at]!.ms);
    return () => window.clearTimeout(timer);
  }, [active, at, frames]);

  const frame = frames[active ? at : 0]!;
  return (
    <figure className="demo" aria-hidden="true">
      <div className="demo__board">
        <Board
          layout={layout}
          board={frame.board}
          mode={mode}
          locked
          onChange={() => {}}
          highlight={frame.highlight ?? null}
          trainRun={frame.train ? loop + 1 : 0}
          overlay={<Pointer pointer={frame.pointer} />}
        />
      </div>
      <figcaption className="demo__caption">{frame.caption}</figcaption>
    </figure>
  );
}
