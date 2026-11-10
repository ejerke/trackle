import { emptyProgress, type PuzzleProgress } from "@trackle/shared";
import { describe, expect, it } from "vitest";
import { mergeOnDevice, summaryKey, toSummary } from "./syncMerge";

const key = { kind: "daily", date: "2026-11-10", difficulty: 1 } as const;
const rec = (over: Partial<PuzzleProgress>): PuzzleProgress => ({ ...emptyProgress(key, "fp"), ...over });
const board = (...edges: string[]) => ({ edges, marks: {} });

describe("toSummary / summaryKey", () => {
  it("leaves unfinished boards out of automatic sync, but keeps finished tracks", () => {
    expect(toSummary(rec({ board: board("h:0:0") })).board.edges).toEqual([]);
    expect(toSummary(rec({ board: board("h:0:0"), solvedAt: "2026-11-10T09:00:00.000Z" })).board.edges).toEqual(["h:0:0"]);
  });

  it("only changes for account-level changes, not board edits", () => {
    const a = rec({ board: board("h:0:0") });
    expect(summaryKey(a)).toBe(summaryKey({ ...a, board: board("v:1:1"), updatedAt: "later" }));
    expect(summaryKey(a)).not.toBe(summaryKey({ ...a, checks: 1 }));
  });
});

describe("mergeOnDevice", () => {
  it("adopts the account's record when this device has none, and uploads ones the account lacks", () => {
    const remote = rec({ board: board("h:0:0"), boardSavedAt: "2026-11-10T09:00:00.000Z" });
    expect(mergeOnDevice(null, remote)).toEqual({ local: remote, push: false });
    const local = rec({ checks: 1 });
    expect(mergeOnDevice(local, null)).toEqual({ local, push: true });
  });

  it("takes a board saved on another device when there are no unsaved edits here", () => {
    const local = rec({ board: board("h:0:0"), boardSavedAt: "2026-11-10T09:00:00.000Z", boardDirty: false });
    const remote = rec({ board: board("v:2:2"), boardSavedAt: "2026-11-10T10:00:00.000Z" });
    const { local: merged } = mergeOnDevice(local, remote);
    expect(merged.board.edges).toEqual(["v:2:2"]);
    expect(merged.boardSavedAt).toBe("2026-11-10T10:00:00.000Z");
  });

  it("never overwrites unsaved edits on this device", () => {
    const local = rec({ board: board("h:0:0", "h:0:1"), boardSavedAt: "2026-11-10T09:00:00.000Z", boardDirty: true });
    const remote = rec({ board: board("v:2:2"), boardSavedAt: "2026-11-10T10:00:00.000Z" });
    expect(mergeOnDevice(local, remote).local.board.edges).toEqual(["h:0:0", "h:0:1"]);
  });

  it("brings a solve from the account, finished track included, over unsaved edits", () => {
    const local = rec({ board: board("h:0:0"), boardDirty: true });
    const remote = rec({ board: board("v:0:0", "v:1:0"), solvedAt: "2026-11-10T10:00:00.000Z", solvedCells: [[1]], boardSavedAt: "2026-11-10T10:00:00.000Z" });
    const { local: merged, push } = mergeOnDevice(local, remote);
    expect(merged).toMatchObject({ solvedAt: "2026-11-10T10:00:00.000Z", boardDirty: false });
    expect(merged.board.edges).toEqual(["v:0:0", "v:1:0"]);
    expect(push).toBe(false);
  });

  it("uploads what this device knows better: a solve, or more checks", () => {
    const remote = rec({ checks: 1 });
    expect(mergeOnDevice(rec({ checks: 1, solvedAt: "2026-11-10T09:00:00.000Z", solvedCells: [[1]] }), remote).push).toBe(true);
    expect(mergeOnDevice(rec({ checks: 3 }), remote)).toMatchObject({ push: true, local: { checks: 3 } });
    expect(mergeOnDevice(rec({ checks: 1 }), remote).push).toBe(false);
  });
});
