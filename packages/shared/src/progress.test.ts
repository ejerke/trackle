import { describe, expect, it } from "vitest";
import { betterSolve, emptyProgress, isProgressRecord, migrateProgress, type PuzzleProgress } from "./progress.ts";

const key = { kind: "daily", date: "2026-11-10", difficulty: 1 } as const;
const solvedAt = (iso: string | null): PuzzleProgress => ({
  ...emptyProgress(key, "fp"),
  solvedAt: iso,
  solvedCells: iso ? [[0]] : null,
});

describe("betterSolve", () => {
  it("prefers a solve over no solve", () => {
    const solved = solvedAt("2026-11-10T08:00:00Z");
    const unsolved = solvedAt(null);
    expect(betterSolve(solved, unsolved)).toBe(solved);
    expect(betterSolve(unsolved, solved)).toBe(solved);
  });

  it("keeps the first solve when both are solved, and `a` on ties", () => {
    const first = solvedAt("2026-11-10T09:00:00Z");
    const second = solvedAt("2026-11-10T10:00:00Z");
    expect(betterSolve(first, second)).toBe(first);
    expect(betterSolve(second, first)).toBe(first);
    const twin = solvedAt("2026-11-10T09:00:00Z");
    expect(betterSolve(first, twin)).toBe(first);
  });

  it("is null when neither is solved", () => {
    expect(betterSolve(solvedAt(null), solvedAt(null))).toBeNull();
  });
});

describe("records", () => {
  it("validates the current version and rejects malformed ones", () => {
    expect(isProgressRecord(emptyProgress(key))).toBe(true);
    expect(isProgressRecord({ ...emptyProgress(key), schemaVersion: 3 })).toBe(false);
    expect(isProgressRecord({ ...emptyProgress(key), key: { kind: "weekly", difficulty: 1 } })).toBe(false);
    expect(isProgressRecord(null)).toBe(false);
  });

  it("upgrades v3 records: anything already drawn counts as unsaved", () => {
    const v3 = { ...emptyProgress(key, "fp"), schemaVersion: 3, board: { edges: ["h:0:0"], marks: {} } } as Record<string, unknown>;
    delete v3.boardSavedAt;
    delete v3.boardDirty;
    expect(migrateProgress(v3)).toMatchObject({ schemaVersion: 5, boardSavedAt: null, boardDirty: true });
    const empty = { ...v3, board: { edges: [], marks: {} } };
    expect(migrateProgress(empty)).toMatchObject({ boardDirty: false });
  });

  it("upgrades v4 records: no hints used, answer never shown", () => {
    const v4 = { ...emptyProgress(key, "fp"), schemaVersion: 4 } as Record<string, unknown>;
    delete v4.hintsUsed;
    delete v4.revealedAt;
    expect(migrateProgress(v4)).toMatchObject({ schemaVersion: 5, hintsUsed: 0, revealedAt: null });
  });
});
