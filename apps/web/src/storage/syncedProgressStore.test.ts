import {
  emptyProgress,
  mergeSummary,
  puzzleKeyId,
  saveBoard,
  type PuzzleKey,
  type PuzzleProgress,
} from "@trackle/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalProgressStore, MemoryStorage } from "./localProgressStore";
import { SyncedProgressStore, type RemoteProgress } from "./syncedProgressStore";

/** An in-memory server using the same merge functions as the real one. */
class FakeServer implements RemoteProgress {
  records = new Map<string, PuzzleProgress>();
  requests = 0;
  failNext = false;
  async list() {
    return [...this.records.values()];
  }
  async sync(incoming: PuzzleProgress[]) {
    this.requests++;
    if (this.failNext) {
      this.failNext = false;
      throw new Error("offline");
    }
    return incoming.map((r) => this.put(r, mergeSummary(this.records.get(puzzleKeyId(r.key)) ?? null, r)));
  }
  async save(r: PuzzleProgress) {
    this.requests++;
    return this.put(r, saveBoard(this.records.get(puzzleKeyId(r.key)) ?? null, r, new Date("2026-11-10T12:00:00Z")));
  }
  async delete(id: string) {
    this.records.delete(id);
  }
  private put(r: PuzzleProgress, stored: PuzzleProgress) {
    this.records.set(puzzleKeyId(r.key), stored);
    return stored;
  }
}

const day = (date: string): PuzzleKey => ({ kind: "daily", date, difficulty: 1 });
const rec = (date: string, over: Partial<PuzzleProgress> = {}): PuzzleProgress => ({
  ...emptyProgress(day(date), "fp"),
  ...over,
});
const solved = (date: string) => rec(date, { solvedAt: `${date}T09:00:00.000Z`, solvedCells: [[1]], checks: 1, board: { edges: ["h:0:0"], marks: {} } });
const edited = (date: string, ...edges: string[]) => rec(date, { board: { edges, marks: {} }, boardDirty: true });

let storage: MemoryStorage;
let local: LocalProgressStore;
let server: FakeServer;
let store: SyncedProgressStore;
beforeEach(() => {
  storage = new MemoryStorage();
  local = new LocalProgressStore(storage);
  server = new FakeServer();
  store = new SyncedProgressStore(local, server, storage);
});
afterEach(() => vi.useRealTimers());

describe("SyncedProgressStore", () => {
  it("is purely local while signed out", async () => {
    await store.save(solved("2026-11-10"));
    await store.flush();
    expect(server.requests).toBe(0);
    expect(store.signedIn).toBe(false);
  });

  it("on sign-in imports anonymous solves but not unfinished boards", async () => {
    await store.save(solved("2026-11-09"));
    await store.save(edited("2026-11-10", "h:0:0", "h:0:1"));
    await store.signIn(7);
    expect(server.records.get("2026-11-09:1")?.solvedAt).not.toBeNull();
    expect(server.records.get("2026-11-10:1")?.board.edges ?? []).toEqual([]);
    // ...and the unfinished board is still here, unsaved.
    expect((await store.get(day("2026-11-10")))?.board.edges).toEqual(["h:0:0", "h:0:1"]);
  });

  it("creating an account keeps the streak, help and bookmarks from playing signed out", async () => {
    const { computeStats } = await import("../stats");
    const days = ["2026-11-08", "2026-11-09", "2026-11-10"];
    for (const d of days) await store.save(solved(d));
    await store.save(rec("2026-11-07", { revealedAt: "2026-11-07T10:00:00.000Z", hintsUsed: 4 }));
    await store.save(rec("2026-11-06", { bookmark: { on: true, at: "2026-11-06T10:00:00.000Z" } }));
    const before = computeStats(await store.list(), "2026-11-10");
    expect(before.streak.current).toBe(3);

    await store.signIn(7); // a brand-new account
    expect(server.records.size).toBe(5);
    expect(server.records.get("2026-11-07:1")).toMatchObject({ revealedAt: "2026-11-07T10:00:00.000Z", hintsUsed: 4 });
    expect(server.records.get("2026-11-06:1")?.bookmark?.on).toBe(true);
    // Another device signing in to the account sees the same streak.
    const otherStorage = new MemoryStorage();
    const laptop = new SyncedProgressStore(new LocalProgressStore(otherStorage), server, otherStorage);
    await laptop.signIn(7);
    expect(computeStats(await laptop.list(), "2026-11-10")).toEqual(before);
  });

  it("removing a bookmark on one device removes it on the others", async () => {
    await store.signIn(7);
    await store.save(rec("2026-11-10", { bookmark: { on: true, at: "2026-11-10T09:00:00.000Z" } }));
    await store.flush();
    const otherStorage = new MemoryStorage();
    const laptop = new SyncedProgressStore(new LocalProgressStore(otherStorage), server, otherStorage);
    await laptop.signIn(7);
    const there = (await laptop.get(day("2026-11-10")))!;
    await laptop.save({ ...there, bookmark: { on: false, at: "2026-11-10T10:00:00.000Z" } });
    await laptop.flush();
    await store.signIn(7); // next page load on the first device, which still has it on
    expect((await store.get(day("2026-11-10")))?.bookmark?.on).toBe(false);
  });

  it("a replay stays on this device", async () => {
    await store.signIn(7);
    await store.save(solved("2026-11-10"));
    const replay = { startedAt: "2026-11-10T11:00:00.000Z", board: { edges: ["h:1:1"], marks: {} }, hintsUsed: 1, emptyHintsUsed: 0, solvedAt: null, revealedAt: null, timeMs: 3000 };
    await store.save({ ...(await store.get(day("2026-11-10")))!, replay });
    await store.flush();
    expect(server.records.get("2026-11-10:1")?.replay).toBeNull();
    await store.signIn(7);
    expect((await store.get(day("2026-11-10")))?.replay).toEqual(replay);
  });

  it("board edits alone never contact the server; solves sync straight away", async () => {
    vi.useFakeTimers();
    await store.signIn(7);
    const before = server.requests;
    await store.save(edited("2026-11-10", "h:0:0"));
    await store.save(edited("2026-11-10", "h:0:0", "h:0:1"));
    await vi.advanceTimersByTimeAsync(5000);
    const afterEdits = server.requests;
    expect(afterEdits - before).toBeLessThanOrEqual(1); // at most registering the puzzle once
    await store.save(edited("2026-11-10", "h:0:0", "h:0:1", "v:1:1"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(server.requests).toBe(afterEdits); // further edits: nothing
    expect(server.records.get("2026-11-10:1")?.board.edges ?? []).toEqual([]);

    await store.save(solved("2026-11-10"));
    expect(server.records.get("2026-11-10:1")?.solvedAt).toBe("2026-11-10T09:00:00.000Z");
  });

  it("Save puts the board in the account, and another device picks it up", async () => {
    await store.signIn(7);
    const stored = await store.saveToAccount(edited("2026-11-10", "h:0:0", "h:0:1"));
    expect(stored.boardSavedAt).toBe("2026-11-10T12:00:00.000Z");

    const otherStorage = new MemoryStorage();
    const laptop = new SyncedProgressStore(new LocalProgressStore(otherStorage), server, otherStorage);
    await laptop.signIn(7);
    expect((await laptop.get(day("2026-11-10")))?.board.edges).toEqual(["h:0:0", "h:0:1"]);
  });

  it("a saved board from elsewhere never replaces unsaved edits here", async () => {
    await store.signIn(7);
    await store.save(edited("2026-11-10", "v:3:3"));
    server.records.set("2026-11-10:1", rec("2026-11-10", { board: { edges: ["h:0:0"], marks: {} }, boardSavedAt: "2026-11-10T12:00:00.000Z" }));
    await store.signIn(7); // next page load
    expect((await store.get(day("2026-11-10")))?.board.edges).toEqual(["v:3:3"]);
  });

  it("never mixes another account's leftover progress into this one", async () => {
    await store.signIn(1);
    await local.save(solved("2026-11-10"));
    const secondServer = new FakeServer();
    const asBob = new SyncedProgressStore(local, secondServer, storage); // next page load, other account
    await asBob.signIn(2);
    expect(secondServer.records.size).toBe(0);
    expect(await asBob.list()).toEqual([]);
  });

  it("keeps failed sends pending and retries them", async () => {
    await store.signIn(7);
    server.failNext = true;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await store.save(solved("2026-11-10"));
    expect(server.records.size).toBe(0);
    await store.flush();
    expect(server.records.get("2026-11-10:1")?.solvedAt).not.toBeNull();
  });

  it("signing out sends pending solves, then clears this browser", async () => {
    vi.useFakeTimers();
    await store.signIn(7);
    await store.save(rec("2026-11-10", { checks: 2 })); // pending (debounced)
    await store.signOut();
    expect(server.records.get("2026-11-10:1")?.checks).toBe(2);
    expect(await store.list()).toEqual([]);
    expect(storage.getItem("trackle:sync:owner")).toBeNull();
  });

  it("after account deletion keeps the browser's copy and stops syncing", async () => {
    await store.signIn(7);
    await store.save(solved("2026-11-10"));
    store.forgetAccount();
    const requests = server.requests;
    await store.save(solved("2026-11-09"));
    expect(server.requests).toBe(requests);
    expect(await store.list()).toHaveLength(2);
    await expect(store.saveToAccount(edited("2026-11-08"))).rejects.toThrow();
  });
});
