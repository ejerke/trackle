import { isRandomSeed } from "@trackle/shared";
import { describe, expect, it } from "vitest";
import { dailyUrl, newRandomSeed, parseRoute, randomUrl } from "./routes";

describe("parseRoute", () => {
  it("parses daily puzzles with and without difficulty", () => {
    expect(parseRoute("/", "")).toEqual({ kind: "daily", date: null, difficulty: null });
    expect(parseRoute("/", "?difficulty=0")).toEqual({ kind: "daily", date: null, difficulty: 0 });
    expect(parseRoute("/2026-11-10", "?difficulty=1")).toEqual({ kind: "daily", date: "2026-11-10", difficulty: 1 });
  });

  it("parses random puzzles", () => {
    expect(parseRoute("/random/0/abcd1234", "")).toEqual({ kind: "random", difficulty: 0, seed: "abcd1234" });
  });

  it("parses the archive and stats pages", () => {
    expect(parseRoute("/archive", "?difficulty=2")).toEqual({ kind: "archive", difficulty: 2 });
    expect(parseRoute("/archive/", "")).toEqual({ kind: "archive", difficulty: null });
    expect(parseRoute("/stats", "")).toEqual({ kind: "stats" });
    expect(parseRoute("/bookmarks", "")).toEqual({ kind: "bookmarks" });
    expect(parseRoute("/account", "")).toEqual({ kind: "account" });
    expect(parseRoute("/leaderboard", "")).toEqual({ kind: "leaderboard" });
  });

  it("rejects unknown paths, difficulties and seeds", () => {
    expect(parseRoute("/nope", "").kind).toBe("unknown");
    expect(parseRoute("/", "?difficulty=9").kind).toBe("unknown");
    expect(parseRoute("/random/9/abcd", "").kind).toBe("unknown");
    expect(parseRoute("/random/1/AB", "").kind).toBe("unknown");
    expect(parseRoute("/random/5/abcd1234", "").kind).toBe("unknown"); // the Challenge is daily only
  });

  it("round-trips the URLs it builds", () => {
    expect(parseRoute(...split(dailyUrl(0, "2026-11-10")))).toEqual({ kind: "daily", date: "2026-11-10", difficulty: 0 });
    expect(dailyUrl(1)).toBe("/"); // default difficulty keeps the plain URL
    expect(parseRoute(...split(randomUrl(1, "seed1234")))).toEqual({ kind: "random", difficulty: 1, seed: "seed1234" });
  });
});

describe("newRandomSeed", () => {
  it("makes valid, different seeds", () => {
    const seeds = new Set(Array.from({ length: 50 }, newRandomSeed));
    expect(seeds.size).toBe(50);
    for (const s of seeds) expect(isRandomSeed(s)).toBe(true);
  });
});

function split(url: string): [string, string] {
  const i = url.indexOf("?");
  return i < 0 ? [url, ""] : [url.slice(0, i), url.slice(i)];
}
