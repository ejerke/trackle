import { migrateProgress, puzzleKeyId, type PuzzleKey, type PuzzleProgress } from "@trackle/shared";
import type { ProgressStore } from "./progressStore";

export { migrateProgress };

/**
 * The subset of the Web Storage API we use. `window.localStorage` satisfies it,
 * and so does `MemoryStorage` below (used in tests and as a fallback).
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

/** Bump only if the key *layout* changes; record changes use schemaVersion. */
const PREFIX = "trackle:progress:v1:";

export function storageKey(key: PuzzleKey): string {
  return PREFIX + puzzleKeyId(key);
}

export class LocalProgressStore implements ProgressStore {
  private readonly storage: KeyValueStorage;

  constructor(storage: KeyValueStorage) {
    this.storage = storage;
  }

  async get(key: PuzzleKey): Promise<PuzzleProgress | null> {
    return this.read(storageKey(key));
  }

  async save(progress: PuzzleProgress): Promise<void> {
    try {
      this.storage.setItem(storageKey(progress.key), JSON.stringify(progress));
    } catch (err) {
      // Quota exceeded or storage disabled: the game keeps working, it just won't remember.
      console.warn("Could not save progress", err);
    }
  }

  async delete(key: PuzzleKey): Promise<void> {
    try {
      this.storage.removeItem(storageKey(key));
    } catch (err) {
      console.warn("Could not delete progress", err);
    }
  }

  /** Remove every progress record (used when signing out). Leaves other keys alone. */
  async clear(): Promise<void> {
    try {
      const keys: string[] = [];
      for (let i = 0; i < this.storage.length; i++) {
        const k = this.storage.key(i);
        if (k?.startsWith(PREFIX)) keys.push(k);
      }
      for (const k of keys) this.storage.removeItem(k);
    } catch (err) {
      console.warn("Could not clear progress", err);
    }
  }

  async list(): Promise<PuzzleProgress[]> {
    const keys: string[] = [];
    try {
      for (let i = 0; i < this.storage.length; i++) {
        const k = this.storage.key(i);
        if (k?.startsWith(PREFIX)) keys.push(k);
      }
    } catch (err) {
      console.warn("Could not list progress", err);
      return [];
    }
    return keys
      .map((k) => this.read(k))
      .filter((p): p is PuzzleProgress => p !== null)
      .sort(compareProgress);
  }

  private read(storageKeyName: string): PuzzleProgress | null {
    let text: string | null;
    try {
      text = this.storage.getItem(storageKeyName);
    } catch (err) {
      console.warn("Could not read progress", err);
      return null;
    }
    if (text === null) return null;
    try {
      const progress = migrateProgress(JSON.parse(text));
      if (progress === null) console.warn(`Ignoring unreadable progress at ${storageKeyName}`);
      return progress;
    } catch {
      console.warn(`Ignoring corrupt progress at ${storageKeyName}`);
      return null;
    }
  }
}

/** Daily puzzles first (newest date first), then random ones (most recently played first). */
function compareProgress(a: PuzzleProgress, b: PuzzleProgress): number {
  if (a.key.kind !== b.key.kind) return a.key.kind === "daily" ? -1 : 1;
  if (a.key.kind === "daily" && b.key.kind === "daily") {
    return b.key.date.localeCompare(a.key.date) || a.key.difficulty - b.key.difficulty;
  }
  return b.updatedAt.localeCompare(a.updatedAt);
}

/** In-memory KeyValueStorage: test double and fallback when localStorage is unavailable. */
export class MemoryStorage implements KeyValueStorage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
}

/**
 * Pick the best available storage. Accessing `window.localStorage` can itself
 * throw (e.g. blocked site data), so probe it with a real write.
 */
export function createBrowserStorage(): KeyValueStorage {
  try {
    const ls = window.localStorage;
    const probe = "trackle:probe";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return ls;
  } catch {
    console.warn("localStorage unavailable; progress will not persist this session");
    return new MemoryStorage();
  }
}
