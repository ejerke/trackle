import { describe, expect, it, vi } from "vitest";
import { LocalProgressStore, MemoryStorage, migrateProgress, storageKey } from "./localProgressStore";
import { emptyProgress, type PuzzleKey } from "./progressStore";

const key: PuzzleKey = { kind: "daily", date: "2026-11-10", difficulty: 1 };

describe("LocalProgressStore", () => {
  it("returns null when nothing is stored", async () => {
    const store = new LocalProgressStore(new MemoryStorage());
    expect(await store.get(key)).toBeNull();
  });

  it("round-trips saved progress", async () => {
    const store = new LocalProgressStore(new MemoryStorage());
    const progress = emptyProgress(key, "abcd1234", new Date("2026-11-10T08:00:00Z"));
    progress.board.edges.push("h:0:1");
    progress.board.marks["2:3"] = "empty";
    await store.save(progress);
    expect(await store.get(key)).toEqual(progress);
  });

  it("clears all progress but leaves other keys alone", async () => {
    const storage = new MemoryStorage();
    storage.setItem("trackle:prefs:difficulty", "2");
    const store = new LocalProgressStore(storage);
    await store.save(emptyProgress(key));
    await store.save(emptyProgress({ kind: "random", seed: "abcd", difficulty: 1 }));
    await store.clear();
    expect(await store.list()).toEqual([]);
    expect(storage.getItem("trackle:prefs:difficulty")).toBe("2");
  });

  it("deletes one puzzle's progress", async () => {
    const store = new LocalProgressStore(new MemoryStorage());
    await store.save(emptyProgress(key));
    await store.delete(key);
    expect(await store.get(key)).toBeNull();
  });

  it("keeps puzzles separate by date and difficulty", async () => {
    const store = new LocalProgressStore(new MemoryStorage());
    await store.save(emptyProgress(key));
    expect(await store.get({ kind: "daily", date: "2026-11-10", difficulty: 2 })).toBeNull();
    expect(await store.get({ kind: "daily", date: "2026-11-09", difficulty: 1 })).toBeNull();
    expect(await store.get({ kind: "random", seed: "2026-11-10", difficulty: 1 })).toBeNull();
  });

  it("lists only its own keys, newest first", async () => {
    const storage = new MemoryStorage();
    storage.setItem("unrelated", "x");
    const store = new LocalProgressStore(storage);
    await store.save(emptyProgress({ kind: "random", seed: "old1", difficulty: 1 }, null, new Date("2026-11-01T00:00:00Z")));
    await store.save(emptyProgress({ kind: "daily", date: "2026-11-08", difficulty: 1 }));
    await store.save(emptyProgress({ kind: "random", seed: "new1", difficulty: 1 }, null, new Date("2026-11-09T00:00:00Z")));
    await store.save(emptyProgress({ kind: "daily", date: "2026-11-10", difficulty: 1 }));
    const ids = (await store.list()).map((p) => (p.key.kind === "daily" ? p.key.date : p.key.seed));
    expect(ids).toEqual(["2026-11-10", "2026-11-08", "new1", "old1"]);
  });

  it("treats corrupt or unknown data as no progress instead of crashing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = new MemoryStorage();
    storage.setItem(storageKey(key), "{not json");
    storage.setItem(storageKey({ ...key, difficulty: 2 }), JSON.stringify({ schemaVersion: 99 }));
    const store = new LocalProgressStore(storage);
    expect(await store.get(key)).toBeNull();
    expect(await store.get({ ...key, difficulty: 2 })).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  it("does not throw when the storage is full", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = new MemoryStorage();
    storage.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
    await expect(new LocalProgressStore(storage).save(emptyProgress(key))).resolves.toBeUndefined();
  });
});

describe("migrateProgress", () => {
  it("rejects records missing required fields", () => {
    expect(migrateProgress({ schemaVersion: 3, key })).toBeNull();
    expect(migrateProgress(null)).toBeNull();
  });

  it("upgrades v1 records (key without kind) to daily keys", async () => {
    const v1 = {
      schemaVersion: 1,
      key: { date: "2026-11-10", difficulty: 1 },
      board: { edges: ["h:0:0"], marks: {} },
      startedAt: "2026-11-10T08:00:00.000Z",
      updatedAt: "2026-11-10T08:05:00.000Z",
      checks: 1,
      solvedAt: null,
      solvedCells: null,
    };
    expect(migrateProgress(v1)).toEqual({
      ...v1,
      schemaVersion: 5,
      key: { kind: "daily", date: "2026-11-10", difficulty: 1 },
      puzzleFingerprint: null,
      boardSavedAt: null,
      boardDirty: true, // it had a drawn segment that was never saved to an account
      hintsUsed: 0,
      revealedAt: null,
    });

    // And it is found under the same storage key as before the upgrade.
    const storage = new MemoryStorage();
    storage.setItem("trackle:progress:v1:2026-11-10:1", JSON.stringify(v1));
    expect((await new LocalProgressStore(storage).get(key))?.board.edges).toEqual(["h:0:0"]);
  });

  it("stores random puzzles under their own keys", () => {
    expect(storageKey({ kind: "random", seed: "abcd", difficulty: 0 })).toBe("trackle:progress:v1:random:0:abcd");
    expect(storageKey(key)).toBe("trackle:progress:v1:2026-11-10:1");
  });
});
