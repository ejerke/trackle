/** Dates are ISO "YYYY-MM-DD" strings in UTC everywhere (see ADR 0005). */

/** The UTC calendar date of `now`. */
export function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** True only for real calendar dates in YYYY-MM-DD form ("2026-02-30" is false). */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && utcDate(parsed) === value;
}

/** The start of the next UTC day after `now`. */
export function nextUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}
