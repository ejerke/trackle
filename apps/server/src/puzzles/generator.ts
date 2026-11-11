import {
  CROSSING,
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
import { cheapViolations, profileFor, violations, type GenerationSettings } from "./difficulty.ts";
import { countSolutions } from "./logic.ts";
import { countTurns, giveawayLines, measure } from "./metrics.ts";
import { createRng, type Rng } from "./rng.ts";

/**
 * SERVER ONLY. Bump when the algorithm or a difficulty profile changes in a
 * way that would produce different puzzles for the same seed. Stored with
 * every puzzle; existing puzzles in the database are not affected.
 *
 * v1: single random path, minimal hints + extras.
 * v2: difficulty profiles; generate-and-filter with logic rating.
 * v3: Easy filtered to tier 1 and few turns; Hard on 8x8; Super-duper hard
 *     (straight paths). Insane (crossings) added later without a bump: it
 *     is a new level, and the other levels' puzzles didn't change.
 */
export const GENERATOR_VERSION = 3;

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
    const path = makePath(profile, rng, width, height);

    // Cheap filters first: most candidates are rejected before the expensive
    // uniqueness and logic steps. (Attempt 0 is always fully evaluated so
    // there is a fallback.)
    if (best) {
      const counts = lineCounts(width, height, (r, c) => path.cells.some((p) => p.row === r && p.col === c));
      const quick = {
        trackCells: counts.rows.reduce((sum, x) => sum + x, 0),
        giveawayLines: giveawayLines({ width, height, rowClues: counts.rows, colClues: counts.cols }),
        turns: countTurns(pathToMasks(width, height, path.cells, path.start.dir, path.end.dir)),
      };
      if (cheapViolations(profile.filters, quick).length > 0) continue;
    }

    const candidate = completeCandidate(rng, width, height, path, profile);
    const metrics = measure(candidate.layout, candidate.solution);
    const failed = violations(profile.filters, metrics);
    const result: GeneratedPuzzle = { ...candidate, metrics, attempts: attempt + 1, accepted: failed.length === 0, violations: failed };
    if (result.accepted) return result;
    if (!best || failed.length < best.violations.length) best = result;
  }
  return { ...best!, attempts: profile.maxAttempts };
}

/** One unfiltered candidate (used by the lab to study raw distributions). */
export function generateCandidate(
  rng: Rng,
  width: number,
  height: number,
  settings: Pick<GenerationSettings, "extraHints" | "pathStyle" | "crossings">,
): Candidate {
  return completeCandidate(rng, width, height, makePath(settings, rng, width, height), settings);
}

/**
 * Clues from the path, then hints: reveal cells until the solution is unique,
 * drop every hint that isn't needed, then add `extraHints` more.
 *
 * With crossings, a coin flip decides whether the crossing is given as a
 * hint, or the player has to find where the track crosses itself.
 */
function completeCandidate(
  rng: Rng,
  width: number,
  height: number,
  path: RandomPath,
  settings: Pick<GenerationSettings, "extraHints" | "crossings">,
): Candidate {
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
    ...(settings.crossings > 0 ? { crossings: settings.crossings } : {}),
  };
  const hintFor = (cell: Cell): Hint => ({ ...cell, piece: solution[cell.row]![cell.col]! });
  const key = (c: Cell) => `${c.row}:${c.col}`;

  // Crossing squares are either all given up front or never given.
  const crossingCells = [...new Map(cells.filter((c) => solution[c.row]![c.col] === CROSSING).map((c) => [key(c), c])).values()];
  const giveCrossings = crossingCells.length > 0 && rng.next() < 0.5;
  const forced = giveCrossings ? crossingCells.map(hintFor) : [];
  const isUnique = (hints: Hint[]) => hasUniqueSolution({ ...base, hints: [...forced, ...hints] });

  // Candidate hint cells: track cells other than A, B and crossings, in random order.
  const inner = cells.slice(1, -1);
  const distinct = crossingCells.length === 0 ? inner : [...new Map(inner.map((c) => [key(c), c])).values()];
  const candidates = rng.shuffle(crossingCells.length === 0 ? distinct : distinct.filter((c) => solution[c.row]![c.col] !== CROSSING));

  let hints: Hint[] = [];
  let next = 0;
  while (!isUnique(hints)) hints.push(hintFor(candidates[next++]!));

  for (const hint of rng.shuffle(hints)) {
    const without = hints.filter((h) => h !== hint);
    if (isUnique(without)) hints = without;
  }

  const used = new Set(hints.map(key));
  const unused = candidates.filter((c) => !used.has(key(c)));
  hints.push(...forced, ...unused.slice(0, settings.extraHints).map(hintFor));

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

function makePath(settings: Pick<GenerationSettings, "pathStyle" | "crossings">, rng: Rng, width: number, height: number): RandomPath {
  if (settings.pathStyle === "straight") return straightPath(rng, width, height);
  if (settings.crossings > 0) return crossingPath(rng, width, height, settings.crossings);
  return randomPath(rng, width, height);
}

/**
 * Like randomPath, but the walk must cross itself exactly `crossings` times:
 * it may step onto a square it crossed straight earlier, at right angles, and
 * then carries straight on to a new square. `cells` lists a crossed square
 * twice. A and B are never crossed.
 */
function crossingPath(rng: Rng, width: number, height: number, crossings: number): RandomPath {
  const area = width * height;
  const minLength = Math.max(3, Math.ceil(area * 0.35));
  const maxLength = Math.max(minLength, Math.floor(area * 0.7));
  const key = (c: Cell) => `${c.row}:${c.col}`;
  const step = (c: Cell, d: Dir): Cell => ({ row: c.row + DELTA[d][0], col: c.col + DELTA[d][1] });
  const isVertical = (d: Dir) => d === N || d === S;

  const border: Cell[] = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (outwardDirs(width, height, { row: r, col: c }).length > 0) border.push({ row: r, col: c });
    }
  }

  for (let attempt = 0; attempt < 100_000; attempt++) {
    const first = rng.pick(border);
    const cells: Cell[] = [first];
    /** Index in `cells` of each square's (first) visit. */
    const firstVisit = new Map([[key(first), 0]]);
    const crossed = new Set<string>();

    for (;;) {
      const here = cells[cells.length - 1]!;
      const outs = outwardDirs(width, height, here);
      const length = firstVisit.size;
      const canEnd = length >= minLength && outs.length > 0 && cells.length > 1 && crossed.size === crossings;
      if (canEnd && (length >= maxLength || rng.next() < 0.12)) {
        const start: Endpoint = { ...first, dir: rng.pick(outwardDirs(width, height, first)) };
        const end: Endpoint = { ...here, dir: rng.pick(outs) };
        return { cells, start, end };
      }
      if (length >= maxLength) break;

      // Each option is the squares to step through: one new square, or a
      // crossing plus the new square straight beyond it.
      const options: Cell[][] = [];
      for (const d of DIRS) {
        const next = step(here, d);
        if (!inBounds(width, height, next.row, next.col)) continue;
        const seen = firstVisit.get(key(next));
        if (seen === undefined) {
          options.push([next]);
          continue;
        }
        if (crossed.size >= crossings || seen === 0 || crossed.has(key(next))) continue;
        const before = cells[seen - 1]!;
        const after = cells[seen + 1]!;
        const straightAcross =
          (before.row === after.row && isVertical(d)) || (before.col === after.col && !isVertical(d));
        const beyond = step(next, d);
        if (straightAcross && inBounds(width, height, beyond.row, beyond.col) && !firstVisit.has(key(beyond))) {
          options.push([next, beyond]);
        }
      }
      if (options.length === 0) break;
      for (const c of rng.pick(options)) {
        if (firstVisit.has(key(c))) crossed.add(key(c));
        else firstVisit.set(key(c), cells.length);
        cells.push(c);
      }
    }
  }
  throw new Error(`Could not generate a path with ${crossings} crossings for a ${width}x${height} grid`);
}

/**
 * Edge to opposite edge in a straight line, with (usually) one sideways jog of
 * a single square somewhere in the middle. For the joke level.
 */
function straightPath(rng: Rng, width: number, height: number): RandomPath {
  const horizontal = rng.next() < 0.5;
  // Work in (along, across) coordinates, then map to (row, col).
  const length = horizontal ? width : height;
  const breadth = horizontal ? height : width;
  const at = (along: number, across: number): Cell => (horizontal ? { row: across, col: along } : { row: along, col: across });

  let across = rng.int(breadth);
  const jogAt = length >= 4 && breadth >= 2 && rng.next() < 0.8 ? 1 + rng.int(length - 2) : -1;
  const jogTo = across === 0 ? 1 : across === breadth - 1 ? across - 1 : across + (rng.next() < 0.5 ? 1 : -1);

  const cells: Cell[] = [];
  for (let along = 0; along < length; along++) {
    cells.push(at(along, across));
    if (along === jogAt) {
      across = jogTo;
      cells.push(at(along, across));
    }
  }
  const start: Endpoint = { ...cells[0]!, dir: horizontal ? W : N };
  const end: Endpoint = { ...cells[cells.length - 1]!, dir: horizontal ? E : S };
  return { cells, start, end };
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
    masks[cell.row]![cell.col]! |= m; // a crossing is visited twice
  });
  return masks;
}
