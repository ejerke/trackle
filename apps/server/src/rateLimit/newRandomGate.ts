/**
 * Paces new random puzzles per client and difficulty: a new one is allowed
 * once `intervalSeconds` have passed since the last one, or straight away
 * once the last one was finished (solved, or its answer shown). Going back to
 * that last puzzle is always allowed.
 *
 * "New" means the server has to generate it (a cache miss); the caller only
 * asks on a miss. Like the token buckets this is in memory, bounded to
 * `maxKeys` entries in least-recently-used order; a dropped entry only ever
 * lets an idle client through sooner.
 */
export interface NewRandomGateOptions {
  /** Injectable clock in milliseconds, for tests. */
  now?: () => number;
  maxKeys?: number;
}

interface Last {
  seed: string;
  /** Milliseconds timestamp of when it was handed out. */
  at: number;
  finished: boolean;
}

export class NewRandomGate {
  private readonly intervalMs: number;
  private readonly now: () => number;
  private readonly maxKeys: number;
  private readonly last = new Map<string, Last>();

  constructor(intervalSeconds: number, options: NewRandomGateOptions = {}) {
    if (intervalSeconds < 0) throw new Error("Invalid interval");
    this.intervalMs = intervalSeconds * 1000;
    this.now = options.now ?? Date.now;
    this.maxKeys = options.maxKeys ?? 50_000;
  }

  /** Seconds until this client may have a new puzzle at this difficulty; 0 = now. Changes nothing. */
  waitSeconds(client: string, difficulty: number, seed: string): number {
    const last = this.last.get(`${client}:${difficulty}`);
    if (!last || last.finished || last.seed === seed) return 0;
    const left = last.at + this.intervalMs - this.now();
    return left <= 0 ? 0 : Math.max(1, Math.ceil(left / 1000));
  }

  /** Record that this client was given `seed` (call after waitSeconds said 0). */
  handOut(client: string, difficulty: number, seed: string): void {
    const key = `${client}:${difficulty}`;
    const last = this.last.get(key);
    this.last.delete(key); // re-insert: Map order is least-recently-used first
    this.last.set(key, last?.seed === seed ? last : { seed, at: this.now(), finished: false });
    if (this.last.size > this.maxKeys) this.last.delete(this.last.keys().next().value!);
  }

  /**
   * The client finished `seed`. Returns true if that was its last puzzle at
   * this difficulty and not finished before: only that earns a new one, so
   * re-checking an old solved puzzle earns nothing.
   */
  finish(client: string, difficulty: number, seed: string): boolean {
    const last = this.last.get(`${client}:${difficulty}`);
    if (!last || last.seed !== seed || last.finished) return false;
    last.finished = true;
    return true;
  }

  get size(): number {
    return this.last.size;
  }
}
