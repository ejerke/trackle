import { bitCount, edgeCells, edgesFromMasks, type HintKind, type HintResponse, type PuzzleLayout } from "@trackle/shared";
import { deductionOrder, emptyDeductionOrder } from "./logic.ts";

type Square = { row: number; col: number };

/**
 * SERVER ONLY. The most useful hint of the asked kind for the player's
 * current board (ADR 0014). Each hint reveals one square:
 *
 *  - "track": a track square, with its piece. First a square where the
 *    player's track is wrong (a segment that isn't in the solution touches it,
 *    or it's marked "no track"), since fixing errors is what actually unsticks
 *    people; then the next piece logic would work out that the player doesn't
 *    have yet, so it feels like a natural next step. The wrong segments in the
 *    piece's way come along, for the board to delete.
 *  - "empty": a square without track. First one the player has drawn track
 *    through; otherwise the most useful one not marked yet (mostUsefulEmpty).
 *
 * "complete" when there's nothing left to reveal with that kind.
 */
export function computeHint(
  layout: PuzzleLayout,
  solution: number[][],
  cells: number[][],
  emptyCells: readonly [number, number][] = [],
  kind: HintKind = "track",
): HintResponse {
  const { width, height } = layout;
  const at = (grid: number[][], r: number, c: number) => grid[r]?.[c] ?? 0;
  const key = (r: number, c: number) => `${r}:${c}`;

  const correct = new Set(edgesFromMasks(width, height, solution));
  const wrongEdges = edgesFromMasks(width, height, cells).filter((e) => !correct.has(e));
  const touchedByWrong = new Set(wrongEdges.flatMap((e) => edgeCells(e).map((c) => key(c.row, c.col))));
  const markedEmpty = new Set(emptyCells.map(([r, c]) => key(r, c)));

  const all: Square[] = [];
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) all.push({ row: r, col: c });
  /** The first square matching `pick`: logic's order first, then any. */
  const first = (order: Square[], pick: (s: Square) => boolean) => order.find(pick) ?? all.find(pick);

  if (kind === "empty") {
    const isEmpty = ({ row, col }: Square) => at(solution, row, col) === 0;
    const order = emptyDeductionOrder(layout);
    const mistake = first(order, (s) => isEmpty(s) && at(cells, s.row, s.col) !== 0);
    if (mistake) return { kind: "empty", ...mistake };
    const square = mostUsefulEmpty(layout, solution, cells, order, (s) => isEmpty(s) && !markedEmpty.has(key(s.row, s.col)));
    return square ? { kind: "empty", ...square } : { kind: "complete" };
  }

  const missing = ({ row, col }: Square) => at(solution, row, col) !== 0 && at(cells, row, col) !== at(solution, row, col);
  const wrongHere = (s: Square) => touchedByWrong.has(key(s.row, s.col)) || markedEmpty.has(key(s.row, s.col));
  const order = deductionOrder(layout);
  const square = first(order, (s) => missing(s) && wrongHere(s)) ?? first(order, missing);
  if (!square) return { kind: "complete" };

  // Wrong segments at this square or the squares its piece connects to: they
  // would leave a square with too many segments once the piece is laid.
  const piece = at(solution, square.row, square.col);
  const around = new Set([key(square.row, square.col)]);
  for (const e of correct) {
    const ends = edgeCells(e);
    if (ends.some((c) => c.row === square.row && c.col === square.col)) for (const c of ends) around.add(key(c.row, c.col));
  }
  const remove = wrongEdges.filter((e) => edgeCells(e).some((c) => around.has(key(c.row, c.col))));
  return { kind: "piece", ...square, piece, remove };
}

const SIDES: [number, number, number][] = [
  [1, -1, 0],
  [2, 0, 1],
  [4, 1, 0],
  [8, 0, -1],
];

/**
 * The "no track" square worth a hint right now, so it reads as chosen, not as
 * the next square in reading order. Scores, best first:
 *
 *  - beside a loose end of the track drawn so far (A and B count, so on a blank
 *    board it starts there): it says which way the track does *not* go next;
 *  - beside the solution's track: it shapes the route, unlike a square out in
 *    open space;
 *  - beside the player's own track: where they're working;
 *  - never one the player can already see: its row or column has clue 0, or
 *    already holds as much track as the clue says. That would waste the hint;
 *  - between equals, one logic rules out sooner (`order`), so it fits the
 *    player's reasoning rather than skipping ahead.
 */
export function mostUsefulEmpty(
  layout: PuzzleLayout,
  solution: number[][],
  cells: number[][],
  order: Square[],
  candidate: (s: Square) => boolean,
): Square | null {
  const { width, height, rowClues, colClues } = layout;
  const at = (grid: number[][], r: number, c: number) => grid[r]?.[c] ?? 0;
  const inside = (r: number, c: number) => r >= 0 && r < height && c >= 0 && c < width;
  const neighbours = (r: number, c: number) => SIDES.map(([, dr, dc]) => [r + dr, c + dc] as const).filter(([nr, nc]) => inside(nr, nc));

  // The drawn track must continue from a loose end into one of its open sides.
  const nextToLooseEnd = new Set<string>();
  const nearPlayer = new Set<string>();
  const nearTrack = new Set<string>();
  const rowKnown = new Array<number>(height).fill(0);
  const colKnown = new Array<number>(width).fill(0);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const m = at(cells, r, c);
      if (m !== 0 && at(solution, r, c) !== 0) {
        rowKnown[r]!++;
        colKnown[c]!++;
      }
      if (m !== 0) for (const [nr, nc] of neighbours(r, c)) nearPlayer.add(`${nr}:${nc}`);
      if (at(solution, r, c) !== 0) for (const [nr, nc] of neighbours(r, c)) nearTrack.add(`${nr}:${nc}`);
      if (bitCount(m) === 1) {
        for (const [bit, dr, dc] of SIDES) if (!(m & bit) && inside(r + dr, c + dc)) nextToLooseEnd.add(`${r + dr}:${c + dc}`);
      }
    }
  }

  const rank = new Map(order.map((s, i) => [`${s.row}:${s.col}`, i]));
  let best: Square | null = null;
  let bestScore = -Infinity;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const s = { row: r, col: c };
      if (!candidate(s)) continue;
      const k = `${r}:${c}`;
      const obvious = rowClues[r] === 0 || colClues[c] === 0 || rowKnown[r] === rowClues[r] || colKnown[c] === colClues[c];
      const score =
        (nextToLooseEnd.has(k) ? 100 : 0) +
        (nearTrack.has(k) ? 40 : 0) +
        (nearPlayer.has(k) ? 20 : 0) -
        (obvious ? 1000 : 0) -
        // 0..10: sooner in logic's order is a little better.
        (10 * (rank.get(k) ?? order.length)) / Math.max(1, order.length);
      if (score > bestScore) {
        best = s;
        bestScore = score;
      }
    }
  }
  return best;
}
