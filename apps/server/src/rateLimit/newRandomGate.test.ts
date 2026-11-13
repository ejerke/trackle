import { describe, expect, it } from "vitest";
import { NewRandomGate } from "./newRandomGate.ts";

function setup(intervalSeconds = 5, maxKeys?: number) {
  let ms = 0;
  const gate = new NewRandomGate(intervalSeconds, { now: () => ms, maxKeys });
  /** Ask for a puzzle; hand it out if allowed. Returns the wait (0 = given). */
  const ask = (seed: string, client = "a", difficulty = 0) => {
    const wait = gate.waitSeconds(client, difficulty, seed);
    if (wait === 0) gate.handOut(client, difficulty, seed);
    return wait;
  };
  return { gate, ask, advance: (seconds: number) => (ms += seconds * 1000) };
}

describe("NewRandomGate", () => {
  it("allows the first puzzle, then one per interval", () => {
    const { ask, advance } = setup(5);
    expect(ask("aaaa")).toBe(0);
    expect(ask("bbbb")).toBe(5);
    advance(3.2);
    expect(ask("bbbb")).toBe(2); // rounded up
    advance(1.8);
    expect(ask("bbbb")).toBe(0);
    expect(ask("cccc")).toBe(5); // the clock restarts at each new puzzle
  });

  it("always allows going back to the last puzzle", () => {
    const { ask } = setup(5);
    ask("aaaa");
    expect(ask("aaaa")).toBe(0);
    expect(ask("bbbb")).toBe(5); // re-asking didn't restart the clock or count as new
  });

  it("allows a new puzzle at once after finishing the last one", () => {
    const { gate, ask } = setup(5);
    ask("aaaa");
    expect(gate.finish("a", 0, "aaaa")).toBe(true);
    expect(ask("bbbb")).toBe(0);
    expect(ask("cccc")).toBe(5); // bbbb isn't finished
  });

  it("only rewards finishing the last puzzle, once", () => {
    const { gate, ask, advance } = setup(5);
    ask("aaaa");
    advance(5);
    ask("bbbb");
    expect(gate.finish("a", 0, "aaaa")).toBe(false); // an older puzzle
    expect(ask("cccc")).toBe(5);
    expect(gate.finish("a", 0, "bbbb")).toBe(true);
    expect(gate.finish("a", 0, "bbbb")).toBe(false); // already counted
    expect(gate.finish("a", 0, "zzzz")).toBe(false); // never handed out
  });

  it("paces each client and difficulty separately", () => {
    const { ask } = setup(5);
    ask("aaaa", "a", 0);
    expect(ask("bbbb", "a", 1)).toBe(0); // another difficulty
    expect(ask("cccc", "b", 0)).toBe(0); // another client
    expect(ask("dddd", "a", 0)).toBe(5);
  });

  it("stays bounded, forgetting the least recently used", () => {
    const { gate, ask } = setup(5, 2);
    ask("aaaa", "a");
    ask("bbbb", "b");
    ask("cccc", "c");
    expect(gate.size).toBe(2);
    expect(ask("dddd", "a")).toBe(0); // "a" was forgotten: allowed again
    expect(ask("eeee", "c")).toBe(5);
  });
});
