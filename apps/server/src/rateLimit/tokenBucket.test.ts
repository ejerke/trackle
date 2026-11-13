import { describe, expect, it } from "vitest";
import { RateLimiter } from "./tokenBucket.ts";

/** A limiter with a hand-controlled clock. */
function setup(capacity: number, refillPerSecond: number, maxKeys?: number) {
  let ms = 0;
  const limiter = new RateLimiter({ capacity, refillPerSecond }, { now: () => ms, maxKeys });
  return { limiter, advance: (seconds: number) => (ms += seconds * 1000) };
}

describe("RateLimiter", () => {
  it("allows a burst up to capacity, then denies", () => {
    const { limiter } = setup(3, 1);
    expect([1, 2, 3, 4].map(() => limiter.take("a").allowed)).toEqual([true, true, true, false]);
  });

  it("reports remaining tokens and when to retry", () => {
    const { limiter } = setup(2, 0.5); // one token per 2 s
    expect(limiter.take("a")).toEqual({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
    limiter.take("a");
    expect(limiter.take("a")).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 2 });
  });

  it("refills continuously over time, never above capacity", () => {
    const { limiter, advance } = setup(2, 1);
    limiter.take("a");
    limiter.take("a");
    advance(0.5);
    expect(limiter.take("a").allowed).toBe(false); // only half a token back
    advance(0.5);
    expect(limiter.take("a").allowed).toBe(true);
    advance(3600);
    expect([1, 2, 3].map(() => limiter.take("a").allowed)).toEqual([true, true, false]); // capped at 2
  });

  it("does not count denied requests against the client", () => {
    const { limiter, advance } = setup(1, 1);
    limiter.take("a");
    for (let i = 0; i < 100; i++) limiter.take("a"); // hammering while limited
    advance(1);
    expect(limiter.take("a").allowed).toBe(true);
  });

  it("keeps clients separate", () => {
    const { limiter } = setup(1, 1);
    expect(limiter.take("a").allowed).toBe(true);
    expect(limiter.take("a").allowed).toBe(false);
    expect(limiter.take("b").allowed).toBe(true);
  });

  it("supports costs above one", () => {
    const { limiter } = setup(5, 1);
    expect(limiter.take("a", 4).allowed).toBe(true);
    expect(limiter.take("a", 4)).toMatchObject({ allowed: false, retryAfterSeconds: 3 });
  });

  it("bounds memory by dropping the least recently used client", () => {
    const { limiter } = setup(1, 1, 2);
    limiter.take("a");
    limiter.take("b");
    limiter.take("a"); // a is now the most recent
    limiter.take("c"); // evicts b
    expect(limiter.size).toBe(2);
    expect(limiter.take("a").allowed).toBe(false); // a's empty bucket survived
    expect(limiter.take("b").allowed).toBe(true); // b starts fresh
  });

  it("rejects nonsensical policies", () => {
    expect(() => new RateLimiter({ capacity: 0, refillPerSecond: 1 })).toThrow();
    expect(() => new RateLimiter({ capacity: 1, refillPerSecond: 0 })).toThrow();
  });

  it("gives tokens back, never above capacity", () => {
    const { limiter } = setup(2, 0.001);
    limiter.take("a");
    limiter.take("a");
    expect(limiter.take("a").allowed).toBe(false);
    limiter.give("a");
    expect(limiter.take("a").allowed).toBe(true);
    limiter.give("a", 10);
    expect(limiter.take("a").remaining).toBe(1); // back to 2, minus this one
    limiter.give("unknown"); // no bucket yet: nothing to do
    expect(limiter.size).toBe(1);
  });
});
