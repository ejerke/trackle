import { LEVELS, type Level, type PuzzleMetrics } from "@trackle/shared";

/**
 * SERVER ONLY. How the generator makes puzzles for each level. The
 * player-facing settings (name, grid size, hint limit) live in LEVELS
 * (@trackle/shared levels.ts); a DifficultyProfile is a level plus these
 * generation settings, one entry per level, in the same order.
 *
 * Changing any value here changes which puzzles get generated for a given
 * seed, so bump GENERATOR_VERSION in generator.ts when you do. Stored puzzles
 * are unaffected.
 */
export interface GenerationSettings {
  /** Hints given on top of the minimum needed for a unique solution. */
  extraHints: number;
  /**
   * Candidates to try before falling back to the best one seen. A count, never
   * a time limit: time limits would make output depend on machine speed.
   */
  maxAttempts: number;
  /**
   * How the track is drawn: "wander" is a random self-avoiding walk;
   * "straight" goes edge to edge across the grid with at most one small jog.
   */
  pathStyle: "wander" | "straight";
  /** How many times the track crosses itself (wander paths only). */
  crossings: number;
  /**
   * Which pieces are given. "minimal" (default): random track squares until
   * the solution is unique, minimised, plus `extraHints`. "ends": exactly the
   * pieces on A's and B's squares and nothing else; a candidate that isn't
   * unique with just those is thrown away, never patched with more hints.
   */
  givens?: "minimal" | "ends";
  /**
   * Search steps one uniqueness check may take while choosing hints; running
   * out counts as "not unique", so another hint is given. Unset = no limit.
   * Needed on big grids: a 10x10 track with only the bridge given can take a
   * minute to prove ambiguous. A count, not a time, so output stays the same.
   */
  uniquenessBudget?: number;
  filters: DifficultyFilters;
}

export type DifficultyProfile = Level & GenerationSettings;

/** Every filter is optional; a candidate is accepted when it violates none. */
export interface DifficultyFilters {
  /** Inclusive range for the total track length. */
  trackCells?: [number, number];
  /** Inclusive range for squares the player must work out. */
  toPlace?: [number, number];
  maxGiveawayLines?: number;
  maxHints?: number;
  /** Reject if tier-1 rules alone decide more than this share of the grid. */
  maxTier1Progress?: number;
  /** Reject if tier-1 rules alone decide less than this share of the grid. */
  minTier1Progress?: number;
  /** Inclusive range for corner pieces in the track (how winding it is). */
  turns?: [number, number];
  /** Allowed hardest tiers (null = needs guessing). */
  tiers?: Array<PuzzleMetrics["tier"]>;
  /** Require at least this many tier-3 (trial) deductions. */
  minTier3Steps?: number;
}

const GENERATION: readonly GenerationSettings[] = [
  {
    // Easy: solvable with local rules alone (tier 1), on a short track that
    // doesn't wind much. Unfiltered, a third of "Easy" puzzles needed Medium
    // or Hard reasoning, and extra hints don't rescue a twisty track.
    extraHints: 1,
    maxAttempts: 500,
    pathStyle: "wander",
    crossings: 0,
    filters: {
      trackCells: [13, 20],
      turns: [4, 8],
      tiers: [1],
      minTier1Progress: 1,
    },
  },
  {
    // Medium: needs "don't close a loop" reasoning, never trial and error.
    extraHints: 0,
    maxAttempts: 2000,
    pathStyle: "wander",
    crossings: 0,
    filters: {
      trackCells: [16, 26],
      toPlace: [13, 24],
      maxGiveawayLines: 1,
      maxHints: 3,
      maxTier1Progress: 0.6,
      tiers: [2],
    },
  },
  {
    // Hard: 8x8, long track, trial reasoning (tier 3) many times, still never guessing.
    extraHints: 0,
    maxAttempts: 3000,
    pathStyle: "wander",
    crossings: 0,
    filters: {
      trackCells: [28, 44],
      maxGiveawayLines: 0,
      maxHints: 1,
      maxTier1Progress: 0.2,
      tiers: [3],
      minTier3Steps: 8,
    },
  },
  {
    // Super-duper hard: a joke. The biggest grid, and the track is (almost) a
    // straight line from one edge to the other.
    extraHints: 0,
    maxAttempts: 1,
    pathStyle: "straight",
    crossings: 0,
    filters: {},
  },
  {
    // Insane: 10x10, one crossing, always given as a hint (a bridge).
    // maxHints counts it, so: at most 3 hints besides the bridge. On 8x8 the
    // bridge pinned down too much of a small grid; the bigger grid and longer
    // track give it room, and asks for half again Hard's trial steps. Each
    // filter is a trade against generation time (ADR 0022).
    extraHints: 0,
    maxAttempts: 3000,
    pathStyle: "wander",
    crossings: 1,
    uniquenessBudget: 1_000,
    filters: {
      trackCells: [42, 66],
      maxGiveawayLines: 0,
      maxHints: 4,
      maxTier1Progress: 0.2,
      tiers: [3],
      minTier3Steps: 12,
    },
  },
  {
    // Challenge (ADR 0025): 10x10, only the two end pieces given, no hints or
    // answer to ask for. Needs at least 20 trial steps (Insane: 12, with up to
    // three pieces given). About 1 path in 20 qualifies, in milliseconds each.
    extraHints: 0,
    maxAttempts: 3000,
    pathStyle: "wander",
    crossings: 0,
    givens: "ends",
    uniquenessBudget: 200_000,
    filters: {
      maxGiveawayLines: 0,
      tiers: [3],
      minTier3Steps: 20,
    },
  },
];

if (GENERATION.length !== LEVELS.length) throw new Error("Every level in LEVELS needs generation settings");

/** One profile per difficulty: the shared level plus how to generate it. */
export const DIFFICULTIES: readonly DifficultyProfile[] = LEVELS.map((level, i) => ({ ...level, ...GENERATION[i]! }));

export function profileFor(difficulty: number): DifficultyProfile {
  const profile = DIFFICULTIES[difficulty];
  if (!profile) throw new Error(`Unknown difficulty ${difficulty}`);
  return profile;
}

const outside = (value: number, [min, max]: [number, number]) => value < min || value > max;

/** Filters that only need the path and clues; checked before the expensive steps. */
export function cheapViolations(
  f: DifficultyFilters,
  m: Pick<PuzzleMetrics, "trackCells" | "giveawayLines" | "turns">,
): string[] {
  const v: string[] = [];
  if (f.trackCells && outside(m.trackCells, f.trackCells)) v.push("trackCells");
  if (f.turns && outside(m.turns, f.turns)) v.push("turns");
  if (f.maxGiveawayLines !== undefined && m.giveawayLines > f.maxGiveawayLines) v.push("giveawayLines");
  return v;
}

/** Names of all filters the metrics fail. Empty = accepted. */
export function violations(f: DifficultyFilters, m: PuzzleMetrics): string[] {
  const v = cheapViolations(f, m);
  if (f.toPlace && outside(m.toPlace, f.toPlace)) v.push("toPlace");
  if (f.maxHints !== undefined && m.hints > f.maxHints) v.push("hints");
  if (f.maxTier1Progress !== undefined && m.tier1Progress > f.maxTier1Progress) v.push("tier1Progress");
  if (f.minTier1Progress !== undefined && m.tier1Progress < f.minTier1Progress) v.push("tier1Progress");
  if (f.tiers && !f.tiers.includes(m.tier)) v.push("tier");
  if (f.minTier3Steps !== undefined && m.tier3Steps < f.minTier3Steps) v.push("tier3Steps");
  return v;
}
