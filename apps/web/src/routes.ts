import { DEFAULT_DIFFICULTY, DIFFICULTY_NAMES, isIsoDate, isRandomSeed } from "@trackle/shared";

/**
 * URL scheme (no router library needed yet):
 *   /                          today's daily puzzle (difficulty: ?difficulty=N, else the saved preference)
 *   /YYYY-MM-DD                that day's daily puzzle, if it was ever generated
 *   /random/<difficulty>/<seed> a random puzzle; the URL is the puzzle, so it can be shared
 *   /archive                   past daily puzzles (?difficulty=N)
 *   /stats                     personal statistics (from this browser's progress)
 *   /lab/<difficulty>/<seed>   development-only puzzle lab
 */
export type Route =
  /** `date` null = today; `difficulty` null = not in the URL (use the saved preference). */
  | { kind: "daily"; date: string | null; difficulty: number | null }
  | { kind: "random"; difficulty: number; seed: string }
  | { kind: "archive"; difficulty: number | null }
  | { kind: "stats" }
  | { kind: "lab"; difficulty: number; seed: string }
  | { kind: "unknown" };

export const isKnownDifficulty = (d: number): boolean => Number.isInteger(d) && d in DIFFICULTY_NAMES;

export function parseRoute(pathname: string, search: string): Route {
  const path = pathname.replace(/\/+$/, "");

  const lab = /^\/lab(?:\/(\d+))?(?:\/([^/]+))?$/.exec(path);
  if (lab) return { kind: "lab", difficulty: Number(lab[1] ?? DEFAULT_DIFFICULTY), seed: decodeURIComponent(lab[2] ?? "lab-0") };

  const random = /^\/random\/(\d+)\/([^/]+)$/.exec(path);
  if (random) {
    const difficulty = Number(random[1]);
    const seed = random[2]!;
    return isKnownDifficulty(difficulty) && isRandomSeed(seed) ? { kind: "random", difficulty, seed } : { kind: "unknown" };
  }

  if (path === "/stats") return { kind: "stats" };

  const param = new URLSearchParams(search).get("difficulty");
  const difficulty = param === null ? null : Number(param);
  if (difficulty !== null && !isKnownDifficulty(difficulty)) return { kind: "unknown" };
  if (path === "/archive") return { kind: "archive", difficulty };
  if (path === "") return { kind: "daily", date: null, difficulty };
  const date = path.slice(1);
  return isIsoDate(date) ? { kind: "daily", date, difficulty } : { kind: "unknown" };
}

export function dailyUrl(difficulty: number, date?: string | null): string {
  const query = difficulty === DEFAULT_DIFFICULTY ? "" : `?difficulty=${difficulty}`;
  return `/${date ?? ""}${query}`;
}

export function archiveUrl(difficulty: number): string {
  return difficulty === DEFAULT_DIFFICULTY ? "/archive" : `/archive?difficulty=${difficulty}`;
}

export function randomUrl(difficulty: number, seed: string = newRandomSeed()): string {
  return `/random/${difficulty}/${seed}`;
}

export function labUrl(difficulty: number, seed: string): string {
  return `/lab/${difficulty}/${encodeURIComponent(seed)}`;
}

/** 8 random characters from [a-z0-9], matching RANDOM_SEED_PATTERN. */
export function newRandomSeed(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
