import { validateTrack, type PlayablePuzzle } from "@trackle/shared";
import { generatePuzzle } from "./generator.ts";

const CACHE_SIZE = 500;

interface Entry {
  puzzle: PlayablePuzzle;
  /** PRIVATE: never send to clients. */
  solution: number[][];
}

/**
 * Random puzzles are not stored: a (difficulty, seed) pair *is* the puzzle,
 * because generation is deterministic (ADR 0009). Checking regenerates it.
 *
 * Generation costs up to ~0.6 s of CPU for Medium, so recent puzzles are kept
 * in a small LRU cache: loading and then checking a puzzle generates it once.
 * Callers must validate difficulty and seed first.
 */
export class RandomPuzzles {
  private readonly cache = new Map<string, Entry>();

  /** True if serving this puzzle won't need a (costly) generation. */
  has(difficulty: number, seed: string): boolean {
    return this.cache.has(`${difficulty}:${seed}`);
  }

  get(difficulty: number, seed: string): Entry {
    const key = `${difficulty}:${seed}`;
    const hit = this.cache.get(key);
    if (hit) {
      // Map keeps insertion order: re-insert to mark as most recently used.
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    // Prefixed so random seeds can never reproduce a daily puzzle.
    const { layout, solution } = generatePuzzle({ difficulty, seed: `random:${seed}` });
    const entry: Entry = { puzzle: { ...layout, difficulty }, solution };
    this.cache.set(key, entry);
    if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
    return entry;
  }

  check(difficulty: number, seed: string, cells: number[][]): boolean {
    return validateTrack(this.get(difficulty, seed).puzzle, cells).ok;
  }

  get size(): number {
    return this.cache.size;
  }
}
