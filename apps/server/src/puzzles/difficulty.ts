import type { PuzzleMetrics } from "@trackle/shared";

/**
 * SERVER ONLY. One entry per difficulty level. Adding a level = adding an entry
 * here (and a display name in @trackle/shared DIFFICULTY_NAMES).
 *
 * Changing any value changes which puzzles get generated for a given seed, so
 * bump GENERATOR_VERSION in generator.ts when you do. Stored puzzles are
 * unaffected.
 */
export interface DifficultyProfile {
  name: string;
  width: number;
  height: number;
  /** Hints given on top of the minimum needed for a unique solution. */
  extraHints: number;
  /**
   * Candidates to try before falling back to the best one seen. A count, never
   * a time limit: time limits would make output depend on machine speed.
   */
  maxAttempts: number;
  filters: DifficultyFilters;
}

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
  /** Allowed hardest tiers (null = needs guessing). */
  tiers?: Array<PuzzleMetrics["tier"]>;
}

export const DIFFICULTIES: readonly DifficultyProfile[] = [
  {
    // The original generator: random path, minimum hints for uniqueness + 2,
    // no filtering. Playtesting showed this is easy (or very easy).
    name: "Easy",
    width: 6,
    height: 6,
    extraHints: 2,
    maxAttempts: 1,
    filters: {},
  },
  {
    // First draft; tune with `npm run lab -- --difficulty 1`.
    name: "Medium",
    width: 6,
    height: 6,
    extraHints: 0,
    maxAttempts: 2000,
    filters: {
      trackCells: [16, 26],
      toPlace: [13, 24],
      maxGiveawayLines: 1,
      maxHints: 3,
      maxTier1Progress: 0.6,
      tiers: [2],
    },
  },
];

export function profileFor(difficulty: number): DifficultyProfile {
  const profile = DIFFICULTIES[difficulty];
  if (!profile) throw new Error(`Unknown difficulty ${difficulty}`);
  return profile;
}

const outside = (value: number, [min, max]: [number, number]) => value < min || value > max;

/** Filters that only need the path and clues; checked before the expensive steps. */
export function cheapViolations(f: DifficultyFilters, m: Pick<PuzzleMetrics, "trackCells" | "giveawayLines">): string[] {
  const v: string[] = [];
  if (f.trackCells && outside(m.trackCells, f.trackCells)) v.push("trackCells");
  if (f.maxGiveawayLines !== undefined && m.giveawayLines > f.maxGiveawayLines) v.push("giveawayLines");
  return v;
}

/** Names of all filters the metrics fail. Empty = accepted. */
export function violations(f: DifficultyFilters, m: PuzzleMetrics): string[] {
  const v = cheapViolations(f, m);
  if (f.toPlace && outside(m.toPlace, f.toPlace)) v.push("toPlace");
  if (f.maxHints !== undefined && m.hints > f.maxHints) v.push("hints");
  if (f.maxTier1Progress !== undefined && m.tier1Progress > f.maxTier1Progress) v.push("tier1Progress");
  if (f.tiers && !f.tiers.includes(m.tier)) v.push("tier");
  return v;
}
