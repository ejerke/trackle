import { puzzleKeyId, type PuzzleKey, type PuzzleProgress } from "@trackle/shared";
import type { KeyValueStorage, LocalProgressStore } from "./localProgressStore";
import type { ProgressStore } from "./progressStore";
import { mergeOnDevice, summaryKey, toSummary } from "./syncMerge";

/** The server side of sync, as this store needs it (api.ts implements it). */
export interface RemoteProgress {
  list(): Promise<PuzzleProgress[]>;
  /** Automatic sync of account-level facts; returns the stored version of each. */
  sync(records: PuzzleProgress[], keepalive?: boolean): Promise<PuzzleProgress[]>;
  /** Explicit Save, board included; returns the stored version. */
  save(record: PuzzleProgress): Promise<PuzzleProgress>;
  delete(keyId: string): Promise<void>;
}

/** Which account the progress in this browser belongs to (absent: nobody's). */
const OWNER_KEY = "trackle:sync:owner";
const REMOTE_DELAY_MS = 1500;
/** The server accepts at most 200 records per request. */
const BATCH = 100;

const sameRecord = (a: PuzzleProgress, b: PuzzleProgress) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Progress store for everyone (ADR 0013). The browser's local store is always
 * where the game reads and autosaves boards. While signed in:
 *
 *  - account-level facts (solves with their finished track, checks) sync
 *    automatically; board edits alone don't trigger any request;
 *  - an unfinished board reaches the account only via saveToAccount() (the
 *    Save button);
 *  - signIn() merges this browser with the account (mergeOnDevice).
 */
export class SyncedProgressStore implements ProgressStore {
  private readonly local: LocalProgressStore;
  private readonly remote: RemoteProgress;
  private readonly meta: KeyValueStorage;
  private userId: number | null = null;
  private readonly pending = new Map<string, PuzzleProgress>();
  /** summaryKey() of what the account has, per puzzle, to skip no-op syncs. */
  private readonly synced = new Map<string, string>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(local: LocalProgressStore, remote: RemoteProgress, meta: KeyValueStorage) {
    this.local = local;
    this.remote = remote;
    this.meta = meta;
    // Pages are often closed or backgrounded (mobile) without warning: send what's pending.
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") void this.flush(true);
      });
    }
  }

  get signedIn(): boolean {
    return this.userId !== null;
  }

  get(key: PuzzleKey) {
    return this.local.get(key);
  }

  list() {
    return this.local.list();
  }

  async save(progress: PuzzleProgress): Promise<void> {
    await this.local.save(progress);
    if (this.userId === null) return;
    const id = puzzleKeyId(progress.key);
    if (this.synced.get(id) === summaryKey(progress)) return; // only the board changed: stays local
    this.pending.set(id, progress);
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    if (progress.solvedAt || hidden) {
      await this.flush(hidden); // solves matter most: don't wait
    } else {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.flush(), REMOTE_DELAY_MS);
    }
  }

  /** The Save button: put this board in the account. Returns the record as stored there. */
  async saveToAccount(progress: PuzzleProgress): Promise<PuzzleProgress> {
    if (this.userId === null) throw new Error("Not signed in");
    const stored = await this.remote.save({ ...progress, replay: null }); // a replay stays on this device
    const id = puzzleKeyId(stored.key);
    this.synced.set(id, summaryKey(stored));
    this.pending.delete(id); // the save carried the summary too
    return stored;
  }

  async delete(key: PuzzleKey): Promise<void> {
    await this.local.delete(key);
    if (this.userId === null) return;
    const id = puzzleKeyId(key);
    this.pending.delete(id);
    this.synced.delete(id);
    await this.remote.delete(id).catch((err) => console.warn("Could not delete synced progress", err));
  }

  /**
   * Start syncing for a signed-in user: on every page load and right after
   * signing in. Solves and checks from this browser's anonymous play are
   * imported; progress left by a *different* account is dropped first.
   */
  async signIn(userId: number): Promise<void> {
    const owner = this.meta.getItem(OWNER_KEY);
    if (owner !== null && owner !== String(userId)) await this.local.clear();

    const [remote, local] = await Promise.all([this.remote.list(), this.local.list()]);
    const remoteById = new Map(remote.map((r) => [puzzleKeyId(r.key), r]));
    const localById = new Map(local.map((l) => [puzzleKeyId(l.key), l]));
    this.synced.clear();

    const toPush: PuzzleProgress[] = [];
    for (const id of new Set([...remoteById.keys(), ...localById.keys()])) {
      const mine = localById.get(id) ?? null;
      const theirs = remoteById.get(id) ?? null;
      const { local: merged, push } = mergeOnDevice(mine, theirs);
      if (!mine || !sameRecord(mine, merged)) await this.local.save(merged);
      if (push) toPush.push(toSummary(merged));
      else if (theirs) this.synced.set(id, summaryKey(theirs));
    }
    for (let i = 0; i < toPush.length; i += BATCH) {
      for (const stored of await this.remote.sync(toPush.slice(i, i + BATCH))) {
        this.synced.set(puzzleKeyId(stored.key), summaryKey(stored));
      }
    }

    this.meta.setItem(OWNER_KEY, String(userId));
    this.userId = userId;
  }

  /** Send pending changes, then remove this account's progress from the browser. */
  async signOut(): Promise<void> {
    await this.flush();
    await this.local.clear();
    this.meta.removeItem(OWNER_KEY);
    this.synced.clear();
    this.userId = null;
  }

  /** The account is gone (deleted): stop syncing but keep the browser's copy. */
  forgetAccount(): void {
    clearTimeout(this.timer);
    this.pending.clear();
    this.synced.clear();
    this.meta.removeItem(OWNER_KEY);
    this.userId = null;
  }

  /** Send pending account-level changes now. Failed sends stay pending for the next try. */
  async flush(keepalive = false): Promise<void> {
    clearTimeout(this.timer);
    if (this.userId === null || this.pending.size === 0) return;
    const batch = [...this.pending.values()];
    this.pending.clear();
    try {
      const stored = await this.remote.sync(batch.map(toSummary), keepalive);
      for (const record of stored) {
        this.synced.set(puzzleKeyId(record.key), summaryKey(record));
        // If the account knew better (e.g. solved on another device), take that here.
        const mine = await this.local.get(record.key);
        const { local: merged } = mergeOnDevice(mine, record);
        if (!mine || !sameRecord(mine, merged)) await this.local.save(merged);
      }
    } catch (err) {
      console.warn("Progress sync failed; will retry", err);
      for (const record of batch) {
        const id = puzzleKeyId(record.key);
        if (!this.pending.has(id)) this.pending.set(id, record); // a newer save wins
      }
    }
  }
}
