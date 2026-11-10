import type { PuzzleLayout, PuzzleMetrics } from "@trackle/shared";
import { rateLogic } from "./logic.ts";

/** Clues of 0 or the full line length: they decide a whole line at a glance. */
export function giveawayLines(layout: Pick<PuzzleLayout, "width" | "height" | "rowClues" | "colClues">): number {
  return (
    layout.rowClues.filter((c) => c === 0 || c === layout.width).length +
    layout.colClues.filter((c) => c === 0 || c === layout.height).length
  );
}

export function measure(layout: PuzzleLayout): PuzzleMetrics {
  const trackCells = layout.rowClues.reduce((s, n) => s + n, 0);
  const given = new Set([...layout.hints, ...layout.endpoints].map((c) => `${c.row}:${c.col}`));
  const rating = rateLogic(layout);
  return {
    trackCells,
    toPlace: trackCells - given.size,
    hints: layout.hints.length,
    giveawayLines: giveawayLines(layout),
    tier: rating.tier,
    tier1Progress: rating.tier1Progress,
    tier2Steps: rating.tier2Steps,
    tier3Steps: rating.tier3Steps,
  };
}
