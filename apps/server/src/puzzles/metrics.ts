import { CROSSING, E, N, S, W, type PuzzleLayout, type PuzzleMetrics } from "@trackle/shared";
import { rateLogic } from "./logic.ts";

/** Clues of 0 or the full line length: they decide a whole line at a glance. */
export function giveawayLines(layout: Pick<PuzzleLayout, "width" | "height" | "rowClues" | "colClues">): number {
  return (
    layout.rowClues.filter((c) => c === 0 || c === layout.width).length +
    layout.colClues.filter((c) => c === 0 || c === layout.height).length
  );
}

/** Corner pieces in a solution: every track square that isn't a straight or a crossing. */
export function countTurns(solution: number[][]): number {
  let turns = 0;
  for (const row of solution) {
    for (const m of row) if (m !== 0 && m !== CROSSING && m !== (N | S) && m !== (E | W)) turns++;
  }
  return turns;
}

export function measure(layout: PuzzleLayout, solution: number[][]): PuzzleMetrics {
  const trackCells = layout.rowClues.reduce((s, n) => s + n, 0);
  const given = new Set([...layout.hints, ...layout.endpoints].map((c) => `${c.row}:${c.col}`));
  const rating = rateLogic(layout);
  return {
    trackCells,
    toPlace: trackCells - given.size,
    hints: layout.hints.length,
    giveawayLines: giveawayLines(layout),
    turns: countTurns(solution),
    tier: rating.tier,
    tier1Progress: rating.tier1Progress,
    tier2Steps: rating.tier2Steps,
    tier3Steps: rating.tier3Steps,
  };
}
