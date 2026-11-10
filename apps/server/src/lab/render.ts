import { E, N, S, W, type PuzzleLayout } from "@trackle/shared";

const PIECES: Record<number, string> = {
  [N | S]: "│",
  [E | W]: "─",
  [N | E]: "└",
  [E | S]: "┌",
  [S | W]: "┐",
  [N | W]: "┘",
};

/**
 * Draw a puzzle as text: column clues on top, row clues on the right, A/B
 * outside the border where the track leaves, hints as box-drawing pieces.
 * With `solution`, the whole track is drawn (hints still stand out in bold).
 */
export function renderPuzzle(layout: PuzzleLayout, solution?: number[][]): string {
  const { width, height } = layout;
  const hint = new Map(layout.hints.map((h) => [`${h.row}:${h.col}`, h.piece]));
  const endAt = (row: number, col: number, dir: number) => {
    const i = layout.endpoints.findIndex((e) => e.row === row && e.col === col && e.dir === dir);
    return i === 0 ? "A" : i === 1 ? "B" : " ";
  };
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

  const lines: string[] = [];
  lines.push("   " + layout.colClues.map((c) => String(c).padStart(2)).join(""));
  lines.push("   " + Array.from({ length: width }, (_, c) => " " + endAt(0, c, N)).join(""));
  lines.push("  ┏" + "━━".repeat(width) + "━┓");
  for (let r = 0; r < height; r++) {
    let row = `${endAt(r, 0, W)} ┃`;
    for (let c = 0; c < width; c++) {
      const given = hint.get(`${r}:${c}`);
      const piece = given ?? solution?.[r]?.[c] ?? 0;
      const char = piece ? (PIECES[piece] ?? "?") : "·";
      row += " " + (given ? bold(char) : char);
    }
    row += ` ┃${endAt(r, width - 1, E)} ${layout.rowClues[r]}`;
    lines.push(row);
  }
  lines.push("  ┗" + "━━".repeat(width) + "━┛");
  lines.push("   " + Array.from({ length: width }, (_, c) => " " + endAt(height - 1, c, S)).join(""));
  return lines.join("\n");
}
