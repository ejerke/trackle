/**
 * Puzzle lab: generate many puzzles for a difficulty and print how their
 * metrics are distributed, to tune the profiles in puzzles/difficulty.ts.
 *
 *   npm run lab -- --difficulty 1 --count 200
 *   npm run lab -- --difficulty 1 --raw          # unfiltered candidates: what would each filter reject?
 *   npm run lab -- --difficulty 1 --show 5 --solution
 *
 * Every puzzle printed comes with its seed; play it at
 * http://localhost:5173/lab/<difficulty>/<seed> while `npm run dev` is running.
 */
import { parseArgs } from "node:util";
import type { PuzzleMetrics } from "@trackle/shared";
import { profileFor, violations } from "../puzzles/difficulty.ts";
import { attemptRng, generateCandidate, generatePuzzle } from "../puzzles/generator.ts";
import { measure } from "../puzzles/metrics.ts";
import { renderPuzzle } from "./render.ts";

const { values } = parseArgs({
  options: {
    difficulty: { type: "string", short: "d", default: "1" },
    count: { type: "string", short: "n", default: "100" },
    prefix: { type: "string", default: "lab-" },
    show: { type: "string", default: "3" },
    raw: { type: "boolean", default: false },
    solution: { type: "boolean", default: false },
  },
});

const difficulty = Number(values.difficulty);
const count = Number(values.count);
const show = Number(values.show);
const profile = profileFor(difficulty);

interface Sample {
  seed: string;
  metrics: PuzzleMetrics;
  ms: number;
  attempts: number;
  accepted: boolean;
  failed: string[];
}

const samples: Sample[] = [];
const shown: string[] = [];

for (let i = 0; i < count; i++) {
  const seed = `${values.prefix}${i}`;
  const t = performance.now();
  if (values.raw) {
    // A single unfiltered candidate, built exactly like the generator's attempt 0.
    const { layout, solution } = generateCandidate(attemptRng(seed, 0), profile.width, profile.height, profile.extraHints);
    const metrics = measure(layout);
    const failed = violations(profile.filters, metrics);
    samples.push({ seed, metrics, ms: performance.now() - t, attempts: 1, accepted: failed.length === 0, failed });
    if (shown.length < show) shown.push(describe(seed, metrics, failed) + "\n" + renderPuzzle(layout, values.solution ? solution : undefined));
  } else {
    const g = generatePuzzle({ difficulty, seed });
    samples.push({ seed, metrics: g.metrics, ms: performance.now() - t, attempts: g.attempts, accepted: g.accepted, failed: g.violations });
    if (shown.length < show) shown.push(describe(seed, g.metrics, g.violations) + "\n" + renderPuzzle(g.layout, values.solution ? g.solution : undefined));
  }
}

// ---- report -------------------------------------------------------------------

function describe(seed: string, m: PuzzleMetrics, failed: string[]): string {
  return [
    `seed ${seed}  →  http://localhost:5173/lab/${difficulty}/${seed}`,
    `  tier ${m.tier ?? "guess"}, tier1 ${(m.tier1Progress * 100).toFixed(0)}%, track ${m.trackCells}, to place ${m.toPlace}, hints ${m.hints}, giveaway lines ${m.giveawayLines}` +
      (failed.length ? `  ✗ ${failed.join(", ")}` : ""),
  ].join("\n");
}

const quantiles = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
  return [s[0]!, q(0.1), q(0.5), q(0.9), s[s.length - 1]!];
};
const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2)).padStart(7);
const table = (rows: [string, number[]][]) => {
  console.log("  " + "".padEnd(16) + ["min", "p10", "median", "p90", "max"].map((h) => h.padStart(7)).join(""));
  for (const [name, xs] of rows) console.log("  " + name.padEnd(16) + quantiles(xs).map(fmt).join(""));
};
const pct = (n: number) => `${((n / samples.length) * 100).toFixed(0)}%`;

console.log(`\n${profile.name} (difficulty ${difficulty}) · ${samples.length} ${values.raw ? "raw candidates" : "puzzles"} · seeds ${values.prefix}0..${values.prefix}${count - 1}\n`);

const accepted = samples.filter((s) => s.accepted).length;
console.log(values.raw ? `Would pass all filters: ${accepted} (${pct(accepted)})` : `Accepted: ${accepted} (${pct(accepted)}), fell back to best candidate: ${samples.length - accepted}`);

const failCounts = new Map<string, number>();
for (const s of samples) for (const f of s.failed) failCounts.set(f, (failCounts.get(f) ?? 0) + 1);
if (failCounts.size > 0) {
  console.log(values.raw ? "Rejected by filter (a candidate can fail several):" : "Filters failed by fallback puzzles:");
  for (const [f, n] of [...failCounts].sort((a, b) => b[1] - a[1])) console.log(`  ${f.padEnd(16)}${String(n).padStart(5)}  ${pct(n)}`);
}

const tiers = new Map<string, number>();
for (const s of samples) tiers.set(String(s.metrics.tier ?? "guess"), (tiers.get(String(s.metrics.tier ?? "guess")) ?? 0) + 1);
console.log("\nHardest tier needed: " + [...tiers].sort().map(([t, n]) => `${t}: ${n} (${pct(n)})`).join(", "));

console.log("\nMetrics");
table([
  ["trackCells", samples.map((s) => s.metrics.trackCells)],
  ["toPlace", samples.map((s) => s.metrics.toPlace)],
  ["hints", samples.map((s) => s.metrics.hints)],
  ["giveawayLines", samples.map((s) => s.metrics.giveawayLines)],
  ["tier1Progress", samples.map((s) => s.metrics.tier1Progress)],
  ["tier2Steps", samples.map((s) => s.metrics.tier2Steps)],
  ["tier3Steps", samples.map((s) => s.metrics.tier3Steps)],
]);
console.log("\nGeneration");
table([
  ["attempts", samples.map((s) => s.attempts)],
  ["ms", samples.map((s) => Math.round(s.ms))],
]);

if (shown.length) console.log("\n" + shown.join("\n\n"));
