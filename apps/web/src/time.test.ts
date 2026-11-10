import { describe, expect, it } from "vitest";
import { formatDuration } from "./time";

describe("formatDuration", () => {
  it("shows minutes and seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(42_999)).toBe("0:42");
    expect(formatDuration(12 * 60_000 + 5_000)).toBe("12:05");
  });

  it("adds hours past an hour", () => {
    expect(formatDuration(3_723_000)).toBe("1:02:03");
  });
});
