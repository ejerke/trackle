import {
  DELTA,
  DIRS,
  E,
  N,
  S,
  W,
  emptyGrid,
  inBounds,
  lineCounts,
  opposite,
  type Dir,
  type Endpoint,
  type Hint,
  type PuzzleLayout,
  type PuzzleMetrics,
} from "@trackle/shared";
import { cheapViolations, profileFor, violations } from "./difficulty.ts";
import { countSolutions } from "./logic.ts";
import { giveawayLines, measure } from "./metrics.ts";
import { createRng, type Rng } from "./rng.ts";

/**
 * SERVER ONLY. Bump when the algorithm or a difficulty profile changes in a
 * way that would produce different puzzles for the same seed. Stored with
 * every puzzle; existing puzzles in the database are not affected.
 *
 * v1: single random path, minimal hints + extras.
 * v2: difficulty profiles; generate-and-filter with logic rating.
 */
export const GENERATOR_VERSION = 2;

export interface GenerateOptions {
  difficulty: number;
  seed: string;
  /** Override the profile's grid size (lab and tests). */
  width?: number;
  height?: number;
}

export interface GeneratedPuzzle {
  layout: PuzzleLayout;
  solution: number[][];
  metrics: PuzzleMetrics;
  /** Candidates generated, including the returned one. */
  attempts: number;
  /** False if no candidate passed and the best one seen was returned. */
  accepted: boolean;
  /** Filters the returned puzzle fails (empty when accepted). */
  violations: string[];
}

export interface Candidate {
  layout: PuzzleLayout;
  solution: number[][];
}

/** The RNG for attempt n. Attempt 0 uses the seed itself. */
export const attemptRng = (seed: string, attempt: number): Rng =>
  createRng(attempt === 0 ? seed : `${seed}#${attempt}`);

/**
 * Generate candidates until one passes the difficulty's filters.
 *
 * Deterministic: attempt n always uses the RNG for `${seed}#${n}`, the attempt
 * limit is a count (not a time), and nothing else is random. So the same
 * (seed, difficulty, GENERATOR_VERSION) always gives the same puzzle.
 * See docs/architecture.md#puzzle-generation and ADR 0008.
 */
export function generatePuzzle(options: GenerateOptions): GeneratedPuzzle {
  const profile = profileFor(options.difficulty);
  const width = options.width ?? profile.width;
  const height = options.height ?? profile.height;
  let best: GeneratedPuzzle | null = null;

  for (let attempt = 0; attempt < profile.maxAttempts; attempt++) {
    const rng = attemptRng(options.seed, attempt);
    const path = randomPath(rng, width, height);

    // Cheap filters first: most candidates are rejected before the expensive
    // uniqueness and logic steps. (Attempt 0 is always fully evaluated so
    // there is a fallback.)
    if (best) {
      const counts = lineCounts(width, height, (r, c) => path.cells.some((p) => p.row === r && p.col === c));
      const quick = { trackCells: path.cells.length, giveawayLines: giveawayLines({ width, height, rowClues: counts.rows, colClues: counts.cols }) };
      if (cheapViolations(profile.filters, quick).length > 0) continue;
    }

    const candidate = completeCandidate(rng, width, height, path, profile.extraHints);
    const metrics = measure(candidate.layout);
    const failed = violations(profile.filters, metrics);
    const result: GeneratedPuzzle = { ...candidate, metrics, attempts: attempt + 1, accepted: failed.length === 0, violations: failed };
    if (result.accepted) return result;
    if (!best || failed.length < best.violations.length) best = result;
  }
  return { ...best!, attempts: profile.maxAttempts };
}

/** One unfiltered candidate (used by the lab to study raw distributions). */
export function generateCandidate(rng: Rng, width: number, height: number, extraHints: number): Candidate {
  return completeCandidate(rng, width, height, randomPath(rng, width, height), extraHints);
}

/**
 * Clues from the path, then hints: reveal cells until the solution is unique,
 * drop every hint that isn't needed, then add `extraHints` more.
 */
function completeCandidate(rng: Rng, width: number, height: number, path: RandomPath, extraHints: number): Candidate {
  const { cells, start, end } = path;
  const solution = pathToMasks(width, height, cells, start.dir, end.dir);
  const counts = lineCounts(width, height, (r, c) => solution[r]![c] !== 0);

  const base: PuzzleLayout = {
    width,
    height,
    rowClues: counts.rows,
    colClues: counts.cols,
    endpoints: [start, end],
    hints: [],
  };
  const isUnique = (hints: Hint[]) => hasUniqueSolution({ ...base, hints });
  const hintFor = (cell: Cell): Hint => ({ ...cell, piece: solution[cell.row]![cell.col]! });

  // Candidate hint cells: track cells other than A and B, in random order.
  const candidates = rng.shuffle(cells.slice(1, -1));

  let hints: Hint[] = [];
  let next = 0;
  while (!isUnique(hints)) hints.push(hintFor(candidates[next++]!));

  for (const hint of rng.shuffle(hints)) {
    const without = hints.filter((h) => h !== hint);
    if (isUnique(without)) hints = without;
  }

  const used = new Set(hints.map((h) => `${h.row}:${h.col}`));
  const unused = candidates.filter((c) => !used.has(`${c.row}:${c.col}`));
  hints.push(...unused.slice(0, extraHints).map(hintFor));

  hints.sort((x, y) => x.row - y.row || x.col - y.col);
  return { layout: { ...base, hints }, solution };
}

/**
 * Exactly one solution? Uses the propagate-and-branch counter in logic.ts.
 * It gives the same answer as the brute-force solver.ts (checked in tests),
 * so the generated puzzles are unchanged; it is just much faster on large grids.
 */
export function hasUniqueSolution(layout: PuzzleLayout): boolean {
  return countSolutions(layout, 2) === 1;
}

type Cell = { row: number; col: number };
interface RandomPath {
  cells: Cell[];
  start: Endpoint;
  end: Endpoint;
}

/** Outward directions of a border cell (two for corners, none for interior cells). */
function outwardDirs(width: number, height: number, cell: Cell): Dir[] {
  const dirs: Dir[] = [];
  if (cell.row === 0) dirs.push(N);
  if (cell.col === width - 1) dirs.push(E);
  if (cell.row === height - 1) dirs.push(S);
  if (cell.col === 0) dirs.push(W);
  return dirs;
}

/**
 * Random self-avoiding walk from one border cell to another, with a length
 * between ~35% and ~70% of the grid area. Restarts on dead ends; cheap because
 * a single walk takes microseconds.
 */
function randomPath(rng: Rng, width: number, height: number): RandomPath {
  const area = width * height;
  const minLength = Math.max(3, Math.ceil(area * 0.35));
  const maxLength = Math.max(minLength, Math.floor(area * 0.7));

  const border: Cell[] = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (outwardDirs(width, height, { row: r, col: c }).length > 0) border.push({ row: r, col: c });
    }
  }

  for (let attempt = 0; attempt < 100_000; attempt++) {
    const first = rng.pick(border);
    const cells: Cell[] = [first];
    const visited = new Set([`${first.row}:${first.col}`]);

    for (;;) {
      const here = cells[cells.length - 1]!;
      const outs = outwardDirs(width, height, here);
      const canEnd = cells.length >= minLength && outs.length > 0 && cells.length > 1;
      if (canEnd && (cells.length >= maxLength || rng.next() < 0.12)) {
        const start: Endpoint = { ...first, dir: rng.pick(outwardDirs(width, height, first)) };
        const end: Endpoint = { ...here, dir: rng.pick(outs) };
        return { cells, start, end };
      }
      if (cells.length >= maxLength) break;

      const options = DIRS.map((d) => ({ row: here.row + DELTA[d][0], col: here.col + DELTA[d][1] })).filter(
        (c) => inBounds(width, height, c.row, c.col) && !visited.has(`${c.row}:${c.col}`),
      );
      if (options.length === 0) break;
      const step = rng.pick(options);
      cells.push(step);
      visited.add(`${step.row}:${step.col}`);
    }
  }
  throw new Error(`Could not generate a path for a ${width}x${height} grid`);
}

function pathToMasks(width: number, height: number, path: Cell[], startDir: Dir, endDir: Dir): number[][] {
  const masks = emptyGrid(width, height);
  const dirTo = (from: Cell, to: Cell): Dir =>
    to.row < from.row ? N : to.row > from.row ? S : to.col > from.col ? E : W;

  path.forEach((cell, i) => {
    let m = 0;
    if (i === 0) m |= startDir;
    else m |= opposite(dirTo(path[i - 1]!, cell));
    if (i === path.length - 1) m |= endDir;
    else m |= dirTo(cell, path[i + 1]!);
    masks[cell.row]![cell.col] = m;
  });
  return masks;
}
