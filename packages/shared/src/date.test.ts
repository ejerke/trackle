import { describe, expect, it } from "vitest";
import { isIsoDate, nextUtcMidnight, utcDate } from "./date.ts";

describe("dates", () => {
  it("uses the UTC date, not the local one", () => {
    // 23:30 UTC is already "tomorrow" in Helsinki, but still the same UTC day.
    expect(utcDate(new Date("2026-11-10T23:30:00Z"))).toBe("2026-11-10");
    expect(utcDate(new Date("2026-11-10T23:30:00-05:00"))).toBe("2026-11-11");
  });

  it("validates ISO dates strictly", () => {
    expect(isIsoDate("2026-11-10")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("10-11-2026")).toBe(false);
    expect(isIsoDate("2026-11-10T00:00")).toBe(false);
  });

  it("finds the next UTC midnight, across month and year ends", () => {
    expect(nextUtcMidnight(new Date("2026-11-10T12:00:00Z")).toISOString()).toBe("2026-11-11T00:00:00.000Z");
    expect(nextUtcMidnight(new Date("2026-12-31T23:59:59Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(nextUtcMidnight(new Date("2026-11-10T00:00:00Z")).toISOString()).toBe("2026-11-11T00:00:00.000Z");
  });
});
