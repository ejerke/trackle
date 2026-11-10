import type { Endpoint, PuzzleLayout } from "@trackle/shared";

/**
 * SERVER ONLY. A *deductive* solver: it solves the way a person does, by
 * applying rules that are certainly true, and records how hard the hardest
 * rule it needed was. This is what rates a puzzle's difficulty.
 *
 * (The brute-force solver in solver.ts proves *uniqueness*; this one measures
 * *how* a unique solution can be found.)
 *
 * Knowledge is kept per cell (track / empty / unknown) and per cell side
 * ("edge": track crosses it / doesn't / unknown).
 *
 * Tier 1 (local):   line counts; a track square has exactly 2 exits; a square
 *                   with fewer than 2 possible exits is empty.
 * Tier 2 (global):  never close a loop; never join A to B before every
 *                   track square is included.
 * Tier 3 (trial):   "if this square were track, tiers 1-2 lead to a
 *                   contradiction, so it's empty" (and vice versa). A one-step
 *                   lookahead, hard for humans.
 *
 * If all three get stuck, the puzzle needs guessing: tier `null`.
 * Every rule must be *sound* (never deduce something false); the soundness
 * test in logic.test.ts checks this against hundreds of known solutions.
 */

export type Tier = 1 | 2 | 3;

export interface LogicRating {
  /** Hardest tier needed to finish, or null if the rules get stuck. */
  tier: Tier | null;
  /** Share of the initially unknown facts (squares and their sides) decided by tier 1 alone, 0..1. */
  tier1Progress: number;
  /** How many times tier 2 / tier 3 had to step in. */
  tier2Steps: number;
  tier3Steps: number;
  /** Final knowledge per square: 1 track, 2 empty, 0 unknown. */
  cells: number[][];
}

// Cell states and edge states.
const UNKNOWN = 0;
const TRACK = 1;
const EMPTY = 2;
const YES = 1;
const NO = 2;

/** Side index k: 0 N, 1 E, 2 S, 3 W. Direction bit is 1 << k. */
const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];
const opp = (k: number) => (k + 2) % 4;

class Contradiction extends Error {}

/** Fixed facts about the puzzle. */
interface Ctx {
  w: number;
  h: number;
  rowClues: number[];
  colClues: number[];
  /** Neighbour index for cell i side k, or -1 at the border. */
  nb: Int32Array;
  aIndex: number;
  bIndex: number;
  totalTrack: number;
}

/** What is currently known. Cheap to clone for tier 3 trials. */
interface Knowledge {
  cell: Uint8Array;
  /** cell * 4 + side */
  edge: Uint8Array;
  changed: boolean;
}

function setCell(s: Knowledge, i: number, v: number): void {
  const cur = s.cell[i]!;
  if (cur === v) return;
  if (cur !== UNKNOWN) throw new Contradiction();
  s.cell[i] = v;
  s.changed = true;
}

function setEdge(ctx: Ctx, s: Knowledge, i: number, k: number, v: number): void {
  const cur = s.edge[i * 4 + k]!;
  if (cur === v) return;
  if (cur !== UNKNOWN) throw new Contradiction();
  s.edge[i * 4 + k] = v;
  const j = ctx.nb[i * 4 + k]!;
  if (j >= 0) s.edge[j * 4 + opp(k)] = v;
  s.changed = true;
}

function setup(layout: PuzzleLayout): { ctx: Ctx; s: Knowledge } {
  const { width: w, height: h } = layout;
  const n = w * h;
  const nb = new Int32Array(n * 4);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      for (let k = 0; k < 4; k++) {
        const nr = r + DR[k]!;
        const nc = c + DC[k]!;
        nb[(r * w + c) * 4 + k] = nr >= 0 && nr < h && nc >= 0 && nc < w ? nr * w + nc : -1;
      }
    }
  }
  const index = (ep: Endpoint) => ep.row * w + ep.col;
  const [a, b] = layout.endpoints;
  const ctx: Ctx = {
    w,
    h,
    rowClues: layout.rowClues,
    colClues: layout.colClues,
    nb,
    aIndex: index(a),
    bIndex: index(b),
    totalTrack: layout.rowClues.reduce((sum, x) => sum + x, 0),
  };
  const s: Knowledge = { cell: new Uint8Array(n), edge: new Uint8Array(n * 4), changed: false };

  // Border sides: only A's and B's outward sides carry track.
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) {
      if (nb[i * 4 + k]! >= 0) continue;
      const isEnd = layout.endpoints.some((ep) => index(ep) === i && ep.dir === 1 << k);
      setEdge(ctx, s, i, k, isEnd ? YES : NO);
    }
  }
  for (const hint of layout.hints) {
    const i = hint.row * w + hint.col;
    setCell(s, i, TRACK);
    for (let k = 0; k < 4; k++) setEdge(ctx, s, i, k, hint.piece & (1 << k) ? YES : NO);
  }
  return { ctx, s };
}

// ---- tier 1 -----------------------------------------------------------------

function lineRule(s: Knowledge, cells: number[], clue: number): void {
  let track = 0;
  let unknown = 0;
  for (const i of cells) {
    if (s.cell[i] === TRACK) track++;
    else if (s.cell[i] === UNKNOWN) unknown++;
  }
  if (track > clue || track + unknown < clue) throw new Contradiction();
  if (unknown === 0) return;
  if (track === clue) for (const i of cells) if (s.cell[i] === UNKNOWN) setCell(s, i, EMPTY);
  if (track + unknown === clue) for (const i of cells) if (s.cell[i] === UNKNOWN) setCell(s, i, TRACK);
}

function cellRule(ctx: Ctx, s: Knowledge, i: number): void {
  let yes = 0;
  let unknown = 0;
  for (let k = 0; k < 4; k++) {
    const e = s.edge[i * 4 + k];
    if (e === YES) yes++;
    else if (e === UNKNOWN) unknown++;
  }
  if (yes > 2) throw new Contradiction();
  if (yes > 0) setCell(s, i, TRACK);

  const state = s.cell[i];
  if (state === EMPTY) {
    for (let k = 0; k < 4; k++) if (s.edge[i * 4 + k] === UNKNOWN) setEdge(ctx, s, i, k, NO);
  } else if (state === TRACK) {
    if (yes + unknown < 2) throw new Contradiction();
    const fill = yes === 2 ? NO : yes + unknown === 2 ? YES : UNKNOWN;
    if (fill !== UNKNOWN) {
      for (let k = 0; k < 4; k++) if (s.edge[i * 4 + k] === UNKNOWN) setEdge(ctx, s, i, k, fill);
    }
  } else if (yes + unknown < 2) {
    setCell(s, i, EMPTY);
  }
}

/** Precomputed cell lists for every row and column. */
const lineCache = new WeakMap<Ctx, { cells: number[]; clue: number }[]>();
function lines(ctx: Ctx) {
  let result = lineCache.get(ctx);
  if (!result) {
    result = [];
    for (let r = 0; r < ctx.h; r++) {
      result.push({ cells: Array.from({ length: ctx.w }, (_, c) => r * ctx.w + c), clue: ctx.rowClues[r]! });
    }
    for (let c = 0; c < ctx.w; c++) {
      result.push({ cells: Array.from({ length: ctx.h }, (_, r) => r * ctx.w + c), clue: ctx.colClues[c]! });
    }
    lineCache.set(ctx, result);
  }
  return result;
}

/** Apply tier 1 until nothing changes. */
function tier1(ctx: Ctx, s: Knowledge): void {
  do {
    s.changed = false;
    for (const line of lines(ctx)) lineRule(s, line.cells, line.clue);
    for (let i = 0; i < s.cell.length; i++) cellRule(ctx, s, i);
  } while (s.changed);
}

// ---- tier 2 -----------------------------------------------------------------

/**
 * One pass of the connectivity rules. Returns true if anything was deduced.
 * Groups the known track into pieces (connected by YES edges), then:
 *  - an unknown edge joining both ends of the same piece would close a loop: NO;
 *  - an edge joining A's piece to B's piece finishes the track, which is only
 *    allowed if those two pieces already hold every track square: else NO.
 * Also detects contradictions (closed loops, finished-but-incomplete track),
 * which tier 3 relies on.
 */
function tier2(ctx: Ctx, s: Knowledge): boolean {
  const n = s.cell.length;
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const yesCount = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) {
      if (s.edge[i * 4 + k] !== YES) continue;
      yesCount[i]!++;
      const j = ctx.nb[i * 4 + k]!;
      if (j > i) parent[find(i)] = find(j);
    }
  }
  const size = new Int32Array(n);
  const openEnds = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (s.cell[i] !== TRACK && yesCount[i] === 0) continue;
    const root = find(i);
    size[root]!++;
    if (yesCount[i]! < 2) openEnds[root]! += 2 - yesCount[i]!;
  }
  const rootA = find(ctx.aIndex);
  const rootB = find(ctx.bIndex);

  // Contradictions: a closed loop, or A joined to B while track is missing.
  for (let i = 0; i < n; i++) {
    if (find(i) !== i || size[i] === 0) continue;
    if (openEnds[i] === 0 && i !== rootA && i !== rootB) throw new Contradiction();
  }
  if (rootA === rootB && size[rootA]! < ctx.totalTrack) throw new Contradiction();

  s.changed = false;
  for (let i = 0; i < n; i++) {
    for (const k of [1, 2]) {
      const j = ctx.nb[i * 4 + k]!;
      if (j < 0 || s.edge[i * 4 + k] !== UNKNOWN) continue;
      const ri = find(i);
      const rj = find(j);
      if (ri === rj && size[ri]! > 0) {
        setEdge(ctx, s, i, k, NO); // would close a loop
      } else if (((ri === rootA && rj === rootB) || (ri === rootB && rj === rootA)) && size[ri]! + size[rj]! < ctx.totalTrack) {
        setEdge(ctx, s, i, k, NO); // would finish the track too early
      }
    }
  }
  return s.changed;
}

/** Tiers 1 and 2 to a fixpoint. Throws Contradiction. */
function propagate(ctx: Ctx, s: Knowledge): void {
  do tier1(ctx, s);
  while (tier2(ctx, s));
}

// ---- tier 3 -----------------------------------------------------------------

const clone = (s: Knowledge): Knowledge => ({ cell: s.cell.slice(), edge: s.edge.slice(), changed: false });

function leadsToContradiction(ctx: Ctx, s: Knowledge, assume: (t: Knowledge) => void): boolean {
  const trial = clone(s);
  try {
    assume(trial);
    propagate(ctx, trial);
    return false;
  } catch (err) {
    if (err instanceof Contradiction) return true;
    throw err;
  }
}

/** Find one deduction by trial. Returns true if one was made. */
function tier3(ctx: Ctx, s: Knowledge): boolean {
  for (let i = 0; i < s.cell.length; i++) {
    if (s.cell[i] !== UNKNOWN) continue;
    for (const [assumed, otherwise] of [
      [TRACK, EMPTY],
      [EMPTY, TRACK],
    ] as const) {
      if (leadsToContradiction(ctx, s, (t) => setCell(t, i, assumed))) {
        setCell(s, i, otherwise);
        return true;
      }
    }
  }
  for (let i = 0; i < s.cell.length; i++) {
    for (const k of [1, 2]) {
      const j = ctx.nb[i * 4 + k]!;
      if (j < 0 || s.edge[i * 4 + k] !== UNKNOWN) continue;
      for (const [assumed, otherwise] of [
        [YES, NO],
        [NO, YES],
      ] as const) {
        if (leadsToContradiction(ctx, s, (t) => setEdge(ctx, t, i, k, assumed))) {
          setEdge(ctx, s, i, k, otherwise);
          return true;
        }
      }
    }
  }
  return false;
}

// ---- counting -----------------------------------------------------------------

/**
 * Count solutions (up to `limit`) by "propagate and branch": apply tiers 1-2
 * until stuck, then split on an unknown edge (crossed / not crossed) and
 * repeat in each branch. Because the rules are sound, no solution is ever
 * lost, and propagation prunes far more than plain depth-first search: this
 * is ~100x faster than solver.ts on 7x7 grids. solver.ts stays as an
 * independent cross-check in tests.
 */
export function countSolutions(layout: PuzzleLayout, limit = 2): number {
  let ctx: Ctx;
  let start: Knowledge;
  try {
    ({ ctx, s: start } = setup(layout));
  } catch (err) {
    if (err instanceof Contradiction) return 0; // e.g. a hint pointing out of the grid
    throw err;
  }
  let count = 0;

  const search = (s: Knowledge): void => {
    if (count >= limit) return;
    try {
      propagate(ctx, s);
    } catch (err) {
      if (err instanceof Contradiction) return;
      throw err;
    }
    const unknown = s.edge.indexOf(UNKNOWN);
    if (unknown < 0) {
      // Fully decided without contradiction. The rules guarantee this is a
      // valid track; validateTrack double-checks in logic.test.ts.
      count++;
      return;
    }
    const cell = Math.floor(unknown / 4);
    const side = unknown % 4;
    for (const value of [YES, NO]) {
      const branch = clone(s);
      setEdge(ctx, branch, cell, side, value);
      search(branch);
    }
  };

  search(start);
  return count;
}

/** Mask grid of a fully decided state (for tests). */
export function decidedMasks(layout: PuzzleLayout): number[][] | null {
  const { ctx, s } = setup(layout);
  try {
    propagate(ctx, s);
  } catch {
    return null;
  }
  if (!solved(s)) return null;
  return Array.from({ length: ctx.h }, (_, r) =>
    Array.from({ length: ctx.w }, (_, c) => {
      let m = 0;
      for (let k = 0; k < 4; k++) if (s.edge[(r * ctx.w + c) * 4 + k] === YES) m |= 1 << k;
      return m;
    }),
  );
}

// ---- rating -------------------------------------------------------------------

const solved = (s: Knowledge) => s.edge.every((e) => e !== UNKNOWN);
/** Decided facts: squares (track/empty) plus square sides (crossed/not). */
const knownFacts = (s: Knowledge) =>
  s.cell.reduce((n, v) => n + (v === UNKNOWN ? 0 : 1), 0) + s.edge.reduce((n, v) => n + (v === UNKNOWN ? 0 : 1), 0);

/**
 * Solve by logic, always using the easiest tier that makes progress, and
 * report the hardest tier that was needed.
 */
export function rateLogic(layout: PuzzleLayout): LogicRating {
  const { ctx, s } = setup(layout);
  const totalFacts = s.cell.length + s.edge.length;
  const knownAtStart = knownFacts(s);

  tier1(ctx, s);
  const tier1Progress =
    totalFacts === knownAtStart ? 1 : (knownFacts(s) - knownAtStart) / (totalFacts - knownAtStart);

  let hardest: Tier = 1;
  let tier2Steps = 0;
  let tier3Steps = 0;
  while (!solved(s)) {
    if (tier2(ctx, s)) {
      hardest = Math.max(hardest, 2) as Tier;
      tier2Steps++;
    } else if (tier3(ctx, s)) {
      hardest = 3;
      tier3Steps++;
    } else {
      break;
    }
    tier1(ctx, s);
  }

  const cells = Array.from({ length: ctx.h }, (_, r) => Array.from(s.cell.subarray(r * ctx.w, (r + 1) * ctx.w)));
  return { tier: solved(s) ? hardest : null, tier1Progress, tier2Steps, tier3Steps, cells };
}
