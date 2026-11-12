import { describe, expect, it } from "vitest";
import { betterSolve, emptyProgress, isProgressRecord, mergeSummary, migrateProgress, saveBoard, type PuzzleProgress } from "./progress.ts";

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
    expect(migrateProgress(v3)).toMatchObject({ schemaVersion: 7, emptyHintsUsed: 0, boardSavedAt: null, boardDirty: true });
    const empty = { ...v3, board: { edges: [], marks: {} } };
    expect(migrateProgress(empty)).toMatchObject({ boardDirty: false });
  });

  it("upgrades v4 records: no hints used, answer never shown", () => {
    const v4 = { ...emptyProgress(key, "fp"), schemaVersion: 4 } as Record<string, unknown>;
    delete v4.hintsUsed;
    delete v4.revealedAt;
    expect(migrateProgress(v4)).toMatchObject({ schemaVersion: 7, emptyHintsUsed: 0, hintsUsed: 0, revealedAt: null });
  });

  it("upgrades v5 records: not timed yet", () => {
    const v5 = { ...emptyProgress(key, "fp"), schemaVersion: 5 } as Record<string, unknown>;
    delete v5.timeMs;
    expect(migrateProgress(v5)).toMatchObject({ schemaVersion: 7, emptyHintsUsed: 0, timeMs: 0 });
  });

  it("upgrades v6 records: no 'no track' hints used", () => {
    const v6 = { ...emptyProgress(key, "fp"), schemaVersion: 6, hintsUsed: 2 } as Record<string, unknown>;
    delete v6.emptyHintsUsed;
    expect(migrateProgress(v6)).toMatchObject({ schemaVersion: 7, hintsUsed: 2, emptyHintsUsed: 0 });
  });
});

describe("solving time on the account", () => {
  const rec = (over: Partial<PuzzleProgress>): PuzzleProgress => ({ ...emptyProgress(key, "fp"), ...over });
  const solve = { solvedAt: "2026-11-10T09:00:00.000Z", solvedCells: [[0]] };

  it("keeps the time of the solve that counts", () => {
    expect(mergeSummary(null, rec({ ...solve, timeMs: 90_000 })).timeMs).toBe(90_000);
    const stored = rec({ ...solve, timeMs: 90_000 });
    // A later solve from another device doesn't count, nor does its time.
    expect(mergeSummary(stored, rec({ solvedAt: "2026-11-10T10:00:00.000Z", solvedCells: [[0]], timeMs: 30_000 })).timeMs).toBe(90_000);
    // Unsolved play elsewhere doesn't change a finished time.
    expect(mergeSummary(stored, rec({ timeMs: 500_000 })).timeMs).toBe(90_000);
  });

  it("keeps the longer time while unsolved", () => {
    expect(saveBoard(rec({ timeMs: 40_000 }), rec({ timeMs: 10_000 }), new Date()).timeMs).toBe(40_000);
    expect(saveBoard(rec({ timeMs: 10_000 }), rec({ timeMs: 40_000 }), new Date()).timeMs).toBe(40_000);
  });
});
