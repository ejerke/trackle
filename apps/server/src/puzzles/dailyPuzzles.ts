import { utcDate, validateTrack } from "@trackle/shared";
import { GENERATOR_VERSION, generatePuzzle } from "./generator.ts";
import type { PuzzleRepository, StoredPuzzle } from "./repository.ts";

export interface Logger {
  warn(obj: object, msg: string): void;
}

/**
 * The daily-puzzle rules from ADR 0005, per difficulty (each difficulty has
 * its own puzzle each day):
 *  - today (UTC) is generated on first request,
 *  - existing past puzzles are returned,
 *  - missing past days and all future days are null (404).
 * Callers must pass a known difficulty (see difficulty.ts).
 */
export class DailyPuzzles {
  private readonly repo: PuzzleRepository;
  private readonly now: () => Date;

  constructor(repo: PuzzleRepository, now: () => Date = () => new Date()) {
    this.repo = repo;
    this.now = now;
  }

  today(): string {
    return utcDate(this.now());
  }

  get(date: string, difficulty: number): StoredPuzzle | null {
    const today = this.today();
    if (date > today) return null; // ISO dates compare correctly as strings
    const existing = this.repo.find(date, difficulty);
    if (existing || date !== today) return existing;

    const seed = `daily:${date}:${difficulty}:v${GENERATOR_VERSION}`;
    const { layout, solution } = generatePuzzle({ difficulty, seed });
    this.repo.insertIfAbsent({
      puzzle: { ...layout, date, difficulty },
      solution,
      seed,
      generatorVersion: GENERATOR_VERSION,
    });
    // Read back: if another request won the race, we return *its* puzzle.
    return this.repo.find(date, difficulty);
  }

  /** Null if the puzzle doesn't exist. Never generates. */
  check(date: string, difficulty: number, cells: number[][], log?: Logger): boolean | null {
    const stored = date > this.today() ? null : this.repo.find(date, difficulty);
    if (!stored) return null;
    const valid = validateTrack(stored.puzzle, cells).ok;
    if (valid && JSON.stringify(cells) !== JSON.stringify(stored.solution)) {
      // Rules satisfied but not the stored answer: the generator made a non-unique puzzle.
      log?.warn({ date, difficulty, puzzleId: stored.id }, "Valid track differs from stored solution");
    }
    return valid;
  }
}
