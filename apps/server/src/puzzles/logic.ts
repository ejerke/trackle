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
 * Tier 1 (local):   line counts; a track square has exactly 2 exits (or 4 if
 *                   it's a crossing); a square with fewer than 2 possible
 *                   exits is empty; the number of crossings is given.
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
  /** Crossings the solution has (layout.crossings). */
  crossings: number;
  /** 1 for squares that can never be a crossing (A and B). */
  noCross: Uint8Array;
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
    crossings: layout.crossings ?? 0,
    noCross: new Uint8Array(n),
  };
  ctx.noCross[ctx.aIndex] = 1;
  ctx.noCross[ctx.bIndex] = 1;
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

/** Crossings already decided: squares with all four sides crossed. */
function knownCrossings(s: Knowledge): number {
  let n = 0;
  for (let i = 0; i < s.cell.length; i++) {
    const e = i * 4;
    if (s.edge[e] === YES && s.edge[e + 1] === YES && s.edge[e + 2] === YES && s.edge[e + 3] === YES) n++;
  }
  return n;
}

/**
 * Could square i still become a crossing? Only if crossings are left to
 * place, it isn't A or B, it isn't empty, and none of its sides is ruled out.
 */
function mayCross(ctx: Ctx, s: Knowledge, i: number, crossingsLeft: number): boolean {
  if (crossingsLeft <= 0 || ctx.noCross[i] || s.cell[i] === EMPTY) return false;
  for (let k = 0; k < 4; k++) if (s.edge[i * 4 + k] === NO) return false;
  return true;
}

/** Returns how many crossings this call decided (0 or 1). */
function cellRule(ctx: Ctx, s: Knowledge, i: number, crossingsLeft: number): number {
  let yes = 0;
  let unknown = 0;
  for (let k = 0; k < 4; k++) {
    const e = s.edge[i * 4 + k];
    if (e === YES) yes++;
    else if (e === UNKNOWN) unknown++;
  }
  if (yes === 4) {
    if (ctx.noCross[i] || ctx.crossings === 0) throw new Contradiction();
    setCell(s, i, TRACK);
    return 0;
  }
  const canCross = mayCross(ctx, s, i, crossingsLeft);
  if (yes > (canCross ? 4 : 2)) throw new Contradiction();
  if (yes === 3) {
    // Three exits: only a crossing has more than two.
    setCell(s, i, TRACK);
    for (let k = 0; k < 4; k++) if (s.edge[i * 4 + k] === UNKNOWN) setEdge(ctx, s, i, k, YES);
    return 1;
  }
  if (yes > 0) setCell(s, i, TRACK);

  const state = s.cell[i];
  if (state === EMPTY) {
    for (let k = 0; k < 4; k++) if (s.edge[i * 4 + k] === UNKNOWN) setEdge(ctx, s, i, k, NO);
  } else if (state === TRACK) {
    if (yes + unknown < 2) throw new Contradiction();
    const fill = yes === 2 && !canCross ? NO : yes + unknown === 2 ? YES : UNKNOWN;
    if (fill !== UNKNOWN) {
      for (let k = 0; k < 4; k++) if (s.edge[i * 4 + k] === UNKNOWN) setEdge(ctx, s, i, k, fill);
    }
  } else if (yes + unknown < 2) {
    setCell(s, i, EMPTY);
  }
  return 0;
}

/**
 * The crossing count, like a line clue: too many or too few possible
 * crossings is a contradiction, and if exactly as many squares could still
 * be crossings as are missing, they all are.
 */
function crossingRule(ctx: Ctx, s: Knowledge): void {
  if (ctx.crossings === 0) return;
  const left = ctx.crossings - knownCrossings(s);
  if (left < 0) throw new Contradiction();
  const possible: number[] = [];
  for (let i = 0; i < s.cell.length; i++) {
    const e = i * 4;
    const isCrossing = s.edge[e] === YES && s.edge[e + 1] === YES && s.edge[e + 2] === YES && s.edge[e + 3] === YES;
    if (!isCrossing && mayCross(ctx, s, i, left)) possible.push(i);
  }
  if (possible.length < left) throw new Contradiction();
  if (left > 0 && possible.length === left) {
    for (const i of possible) {
      setCell(s, i, TRACK);
      for (let k = 0; k < 4; k++) if (s.edge[i * 4 + k] === UNKNOWN) setEdge(ctx, s, i, k, YES);
    }
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
    let crossingsLeft = ctx.crossings === 0 ? 0 : ctx.crossings - knownCrossings(s);
    for (let i = 0; i < s.cell.length; i++) crossingsLeft -= cellRule(ctx, s, i, crossingsLeft);
    crossingRule(ctx, s);
  } while (s.changed);
}

// ---- tier 2 -----------------------------------------------------------------

/**
 * One pass of the connectivity rules. Returns true if anything was deduced.
 *
 * Track is followed side by side ("ports": square i side k = i * 4 + k), not
 * square by square, because the two tracks over a crossing are separate.
 * Ports are joined across a crossed edge, and inside a square when the track
 * certainly runs between them: the two exits of an ordinary square, straight
 * across a crossing, and straight across any square (straight on is right
 * whether or not it turns out to be a crossing). Two exits round a corner of
 * a square that might still become a crossing are not joined: as a crossing,
 * they'd belong to different tracks.
 *
 * Then, for each unknown edge, with the pieces its two sides would extend:
 *  - joining both ends of the same piece would close a loop: NO;
 *  - joining A's piece to B's piece finishes the track, which is only allowed
 *    if those two pieces already hold every track square: else NO.
 * Also detects contradictions (closed loops, finished-but-incomplete track),
 * which tier 3 relies on.
 */
function tier2(ctx: Ctx, s: Knowledge): boolean {
  const n = s.cell.length;
  const ports = n * 4;
  const parent = new Int32Array(ports);
  for (let p = 0; p < ports; p++) parent[p] = p;
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  const crossingsLeft = ctx.crossings === 0 ? 0 : ctx.crossings - knownCrossings(s);

  // Which exits of each square are joined to each other inside it.
  const inner = new Uint8Array(ports); // 1 = this port is joined to another port of its square
  const yesCount = new Uint8Array(n);
  const plain = new Uint8Array(n); // 1 = certainly not a crossing
  const join = (a: number, b: number) => {
    union(a, b);
    inner[a] = 1;
    inner[b] = 1;
  };
  for (let i = 0; i < n; i++) {
    let count = 0;
    let first = -1;
    let second = -1;
    for (let k = 0; k < 4; k++) {
      if (s.edge[i * 4 + k] !== YES) continue;
      count++;
      if (first < 0) first = k;
      else second = k;
      const j = ctx.nb[i * 4 + k]!;
      if (j > i) union(i * 4 + k, j * 4 + opp(k));
    }
    yesCount[i] = count;
    plain[i] = crossingsLeft > 0 && mayCross(ctx, s, i, crossingsLeft) ? 0 : 1;
    if (count === 4) {
      join(i * 4, i * 4 + 2);
      join(i * 4 + 1, i * 4 + 3);
    } else if (count === 2 && (second - first === 2 || plain[i])) {
      join(i * 4 + first, i * 4 + second);
    }
  }

  // Per piece: open ends (crossed sides not joined inside their square), and
  // the squares it covers. A square on two pieces counts for both, which can
  // only over-count, so the "finishes too early" rule stays sound.
  const openEnds = new Int32Array(ports);
  const size = new Int32Array(ports);
  const hasPort = new Uint8Array(ports);
  const roots = [-1, -1, -1, -1];
  for (let i = 0; i < n; i++) {
    if (yesCount[i] === 0) continue;
    let distinct = 0;
    for (let k = 0; k < 4; k++) {
      const p = i * 4 + k;
      if (s.edge[p] !== YES) continue;
      const root = find(p);
      hasPort[root] = 1;
      if (!inner[p] && ctx.nb[p]! >= 0) openEnds[root]!++;
      let seen = false;
      for (let r = 0; r < distinct; r++) if (roots[r] === root) seen = true;
      if (!seen) roots[distinct++] = root;
    }
    for (let r = 0; r < distinct; r++) size[roots[r]!]!++;
  }
  const terminal = (ep: number) => {
    for (let k = 0; k < 4; k++) if (ctx.nb[ep * 4 + k]! < 0 && s.edge[ep * 4 + k] === YES) return find(ep * 4 + k);
    throw new Error("endpoint without its outward side");
  };
  const rootA = terminal(ctx.aIndex);
  const rootB = terminal(ctx.bIndex);

  // Contradictions: a closed loop, or A joined to B while track is missing.
  for (let p = 0; p < ports; p++) {
    if (!hasPort[p] || find(p) !== p) continue;
    if (openEnds[p] === 0 && p !== rootA && p !== rootB) throw new Contradiction();
  }
  if (rootA === rootB && size[rootA]! < ctx.totalTrack) throw new Contradiction();

  /** The piece port (i, k) would extend if its edge were crossed, or -1 if unclear. */
  const extends_ = (i: number, k: number): number => {
    const y = yesCount[i]!;
    if (y === 1) {
      for (let q = 0; q < 4; q++) {
        if (s.edge[i * 4 + q] !== YES) continue;
        return q === opp(k) || plain[i] ? find(i * 4 + q) : -1;
      }
    }
    // A third exit makes a crossing: it continues straight on.
    if (y === 2 && s.edge[i * 4 + opp(k)] === YES) return find(i * 4 + opp(k));
    return -1;
  };

  s.changed = false;
  for (let i = 0; i < n; i++) {
    for (const k of [1, 2]) {
      const j = ctx.nb[i * 4 + k]!;
      if (j < 0 || s.edge[i * 4 + k] !== UNKNOWN) continue;
      const ri = extends_(i, k);
      const rj = extends_(j, opp(k));
      if (ri < 0 || rj < 0) continue;
      if (ri === rj) {
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
  return runLogic(layout, () => {});
}

/**
 * The order in which logic completes each track square (both of its exits
 * known), easiest deductions first. Hints reveal the first square in this
 * order that the player doesn't have yet: the natural "next step".
 * Squares already given (hints, A/B fully fixed) are left out.
 */
export function deductionOrder(layout: PuzzleLayout): { row: number; col: number }[] {
  const order: { row: number; col: number }[] = [];
  let seen: Set<number> | null = null;
  runLogic(layout, (ctx, s) => {
    const done = new Set<number>();
    for (let i = 0; i < s.cell.length; i++) {
      let yes = 0;
      let known = 0;
      for (let k = 0; k < 4; k++) {
        const e = s.edge[i * 4 + k];
        if (e === YES) yes++;
        if (e !== UNKNOWN) known++;
      }
      if (s.cell[i] === TRACK && (yes === 2 || yes === 4) && known === 4) done.add(i);
    }
    if (seen) for (const i of done) if (!seen.has(i)) order.push({ row: Math.floor(i / ctx.w), col: i % ctx.w });
    seen = done; // the first snapshot (givens only) is the baseline
  });
  return order;
}

/** The rating loop; `observe` sees the knowledge at the start and after every step. */
function runLogic(layout: PuzzleLayout, observe: (ctx: Ctx, s: Knowledge) => void): LogicRating {
  const { ctx, s } = setup(layout);
  const totalFacts = s.cell.length + s.edge.length;
  const knownAtStart = knownFacts(s);
  observe(ctx, s);

  tier1(ctx, s);
  observe(ctx, s);
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
    observe(ctx, s);
  }

  const cells = Array.from({ length: ctx.h }, (_, r) => Array.from(s.cell.subarray(r * ctx.w, (r + 1) * ctx.w)));
  return { tier: solved(s) ? hardest : null, tier1Progress, tier2Steps, tier3Steps, cells };
}
