import {
  CROSSING,
  DELTA,
  bitCount,
  edgeBetween,
  edgeCells,
  fixedEdges,
  inBounds,
  isValidEdge,
  lineCounts,
  masksFromEdges,
  opposite,
  type Cell,
  type Dir,
  type EdgeKey,
  type HintResponse,
  type LineCounts,
  type PuzzleLayout,
} from "@trackle/shared";
import type { BoardState, CellMark } from "../storage/progressStore";

/**
 * Pure board-editing rules. Every function returns a new BoardState, or the
 * *same* object when nothing changes, so callers can skip re-renders and saves.
 */

export type Mode = "track" | "isTrack" | "noTrack";

export const cellKey = (c: Cell): string => `${c.row}:${c.col}`;

/** Squares a hint revealed: nothing on them can be changed. */
export function lockedCells(board: BoardState): Set<string> {
  return new Set(board.locked ?? []);
}

/** A segment the player can't change because it touches a square a hint revealed. */
function touchesLocked(board: BoardState, key: EdgeKey): boolean {
  if (!board.locked?.length) return false;
  const locked = lockedCells(board);
  return edgeCells(key).some((c) => locked.has(cellKey(c)));
}

/** Player edges plus edges fixed by hints. */
export function allEdges(layout: PuzzleLayout, board: BoardState): Set<EdgeKey> {
  const edges = fixedEdges(layout);
  for (const e of board.edges) edges.add(e);
  return edges;
}

/** The full mask grid (what gets drawn and what gets sent to the server). */
export function boardMasks(layout: PuzzleLayout, board: BoardState): number[][] {
  return masksFromEdges(layout, allEdges(layout, board));
}

/**
 * Most segments a square may hold: two. Crossings (bridges) are always given
 * as hints, so players never build one; the only exception is a puzzle made
 * before that rule, which tells of more crossings than it gives. A and B's
 * squares never cross.
 */
function maxSegments(layout: PuzzleLayout, cell: Cell): number {
  const given = layout.hints.filter((h) => h.piece === CROSSING).length;
  if ((layout.crossings ?? 0) <= given) return 2;
  return layout.endpoints.some((ep) => ep.row === cell.row && ep.col === cell.col) ? 2 : 4;
}

/** Add or remove a player segment. Refuses to give a square more segments than it may hold. */
export function setEdge(layout: PuzzleLayout, board: BoardState, key: EdgeKey, on: boolean): BoardState {
  const present = board.edges.includes(key);
  if (fixedEdges(layout).has(key) || present === on || touchesLocked(board, key)) return board;
  if (!on) return { ...board, edges: board.edges.filter((e) => e !== key) };

  const masks = boardMasks(layout, board);
  const cells = edgeCells(key);
  if (cells.some((c) => bitCount(masks[c.row]![c.col]!) >= maxSegments(layout, c))) return board;

  // Laying track through a square overrides an earlier "no track" mark there.
  const marks = { ...board.marks };
  for (const c of cells) if (marks[cellKey(c)] === "empty") delete marks[cellKey(c)];
  return { ...board, edges: [...board.edges, key], marks };
}

/** Set or clear a cell mark. "No track" is refused on squares that already have track. */
export function setMark(layout: PuzzleLayout, board: BoardState, cell: Cell, mark: CellMark | null): BoardState {
  const key = cellKey(cell);
  if ((board.marks[key] ?? null) === mark || lockedCells(board).has(key)) return board;
  if (mark === "empty" && boardMasks(layout, board)[cell.row]![cell.col] !== 0) return board;
  const marks = { ...board.marks };
  if (mark === null) delete marks[key];
  else marks[key] = mark;
  return { ...board, marks };
}

/**
 * Lay a whole piece at (row, col), as a hint does: a segment across each side
 * the piece uses. Sides pointing out of the grid are A/B and already there.
 */
export function placePiece(layout: PuzzleLayout, board: BoardState, cell: Cell, piece: number): BoardState {
  let next = board;
  for (const [bit, dr, dc] of [
    [1, -1, 0],
    [2, 0, 1],
    [4, 1, 0],
    [8, 0, -1],
  ] as const) {
    if (!(piece & bit)) continue;
    const edge = edgeBetween(cell, { row: cell.row + dr, col: cell.col + dc });
    if (edge && isValidEdge(layout.width, layout.height, edge)) next = setEdge(layout, next, edge, true);
  }
  return next;
}

/**
 * Put a hint on the board and lock its square, so it can't be lost:
 *  - a piece: delete the wrong segments in its way, lay it, drop any mark there;
 *  - "no track": delete every segment through the square and mark it.
 */
export function applyHint(layout: PuzzleLayout, board: BoardState, hint: HintResponse): BoardState {
  if (hint.kind === "complete") return board;
  const cell = { row: hint.row, col: hint.col };
  const key = cellKey(cell);
  const touchesCell = (e: EdgeKey) => edgeCells(e).some((c) => c.row === cell.row && c.col === cell.col);
  const drop = hint.kind === "piece" ? new Set(hint.remove) : new Set(board.edges.filter(touchesCell));
  const marks = { ...board.marks };
  delete marks[key];
  let next: BoardState = { ...board, edges: board.edges.filter((e) => !drop.has(e)), marks };
  if (hint.kind === "piece") next = placePiece(layout, next, cell, hint.piece);
  else next = { ...next, marks: { ...next.marks, [key]: "empty" } };
  const locked = lockedCells(next);
  locked.add(key);
  return { ...next, locked: [...locked] };
}

/** Clear the board, keeping what hints revealed. */
export function clearedBoard(board: BoardState): BoardState {
  const locked = lockedCells(board);
  if (locked.size === 0) return { edges: [], marks: {} };
  const marks = Object.fromEntries(Object.entries(board.marks).filter(([k]) => locked.has(k)));
  const edges = board.edges.filter((e) => edgeCells(e).some((c) => locked.has(cellKey(c))));
  return { edges, marks, locked: [...locked] };
}

/** Live clue counts: squares with track segments or a "track here" mark. */
export function boardCounts(layout: PuzzleLayout, board: BoardState): LineCounts {
  const masks = boardMasks(layout, board);
  return lineCounts(
    layout.width,
    layout.height,
    (r, c) => masks[r]![c] !== 0 || board.marks[`${r}:${c}`] === "track",
  );
}

export type ClueStatus = "under" | "done" | "over";

export function clueStatus(count: number, clue: number): ClueStatus {
  return count > clue ? "over" : count === clue ? "done" : "under";
}

/** One step of a train's journey: the square it crosses and the sides it enters and leaves by. */
export interface RouteStep {
  cell: Cell;
  /** Side the train enters through. */
  from: Dir;
  /** Side the train leaves through. */
  to: Dir;
}

/**
 * Follow the track from endpoint A to endpoint B, square by square (straight
 * on over crossings, which are passed twice). Returns
 * null if the track doesn't run unbroken from A to B (e.g. it isn't finished).
 */
export function traceRoute(layout: PuzzleLayout, masks: number[][]): RouteStep[] | null {
  const [a, b] = layout.endpoints;
  const steps: RouteStep[] = [];
  let cell: Cell = { row: a.row, col: a.col };
  let from: Dir = a.dir;
  const limit = layout.width * layout.height * 2;
  while (steps.length < limit) {
    const mask = masks[cell.row]?.[cell.col] ?? 0;
    if (!(mask & from) || (bitCount(mask) !== 2 && mask !== CROSSING)) return null;
    const to = (mask === CROSSING ? opposite(from) : mask & ~from) as Dir;
    steps.push({ cell, from, to });
    if (cell.row === b.row && cell.col === b.col && to === b.dir) return steps;
    const [dr, dc] = DELTA[to];
    cell = { row: cell.row + dr, col: cell.col + dc };
    if (!inBounds(layout.width, layout.height, cell.row, cell.col)) return null;
    from = opposite(to);
  }
  return null;
}
