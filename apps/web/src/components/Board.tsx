import { DELTA, DIRS, E, N, S, W, edgeBetween, edgeCells, inBounds, type Cell, type Dir, type PuzzleLayout } from "@trackle/shared";
import { useEffect, useMemo, useRef, type PointerEvent } from "react";
import { allEdges, boardCounts, boardMasks, cellKey, clueStatus, setEdge, setMark, type Mode } from "../board/model";
import type { BoardState, CellMark } from "../storage/progressStore";

export interface Highlight {
  tone: "hint" | "mistake";
  cells: Cell[];
  edges: string[];
}

interface BoardProps {
  layout: PuzzleLayout;
  board: BoardState;
  mode: Mode;
  locked: boolean;
  onChange(fn: (board: BoardState) => BoardState): void;
  /** Briefly marks squares/segments, e.g. a hinted piece or a mistake. */
  highlight?: Highlight | null;
}

// Board geometry, in SVG units where one cell = 1.
const LEFT = 1.5;
const TOP = 1.5;
const RIGHT = 1.5;
/** Clues sit this far outside the grid, leaving room for the A/B stubs. */
const CLUE_OFFSET = 1.0;
const STUB = 0.45;
const BOTTOM = 0.9;
/** A tap closer than this to a cell side toggles the segment across that side. */
const TAP_EDGE_DISTANCE = 0.32;

type Point = { x: number; y: number };

const midpoint = (cell: Cell, d: Dir): Point => ({
  x: cell.col + 0.5 + DELTA[d][1] * 0.5,
  y: cell.row + 0.5 + DELTA[d][0] * 0.5,
});

/** SVG path for one cell's track: a straight, a quarter-circle curve, or a half-length stub. */
function piecePath(cell: Cell, mask: number): string {
  const dirs = DIRS.filter((d) => mask & d);
  const center = { x: cell.col + 0.5, y: cell.row + 0.5 };
  if (dirs.length === 1) {
    const p = midpoint(cell, dirs[0]!);
    return `M${center.x} ${center.y}L${p.x} ${p.y}`;
  }
  const [d1, d2] = dirs as [Dir, Dir];
  const p1 = midpoint(cell, d1);
  const p2 = midpoint(cell, d2);
  if ((d1 | d2) === (N | S) || (d1 | d2) === (E | W)) return `M${p1.x} ${p1.y}L${p2.x} ${p2.y}`;
  // Curve: arc of radius 0.5 centred on the cell corner between the two sides.
  const corner = { x: p1.x + p2.x - center.x, y: p1.y + p2.y - center.y };
  const cross = (p1.x - corner.x) * (p2.y - corner.y) - (p1.y - corner.y) * (p2.x - corner.x);
  return `M${p1.x} ${p1.y}A0.5 0.5 0 0 ${cross > 0 ? 1 : 0} ${p2.x} ${p2.y}`;
}

/** Railway look: sleepers, two rails, sleepers visible between the rails. */
function Rails({ d, kind, gap }: { d: string; kind: "player" | "fixed"; gap: string }) {
  return (
    <g className={`rails rails--${kind}`}>
      <path d={d} className="rails__sleepers" />
      <path d={d} className="rails__rail" />
      <path d={d} className="rails__gap" style={{ stroke: gap }} />
      <path d={d} className="rails__sleepers rails__sleepers--inner" />
    </g>
  );
}

export function Board({ layout, board, mode, locked, onChange, highlight }: BoardProps) {
  const { width, height } = layout;
  const svgRef = useRef<SVGSVGElement>(null);
  const boardRef = useRef(board);
  boardRef.current = board;

  const masks = useMemo(() => boardMasks(layout, board), [layout, board]);
  const counts = useMemo(() => boardCounts(layout, board), [layout, board]);
  const playerEdges = useMemo(() => new Set(board.edges), [board.edges]);
  const hintCells = useMemo(() => new Set(layout.hints.map(cellKey)), [layout]);
  const edges = useMemo(() => allEdges(layout, board), [layout, board]);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  // `touch-action: none` (styles.css) should stop the page scrolling while
  // drawing, but some mobile browsers (notably iOS Safari on SVG) still scroll
  // or pull-to-refresh. A non-passive touch listener can veto that; React's
  // own touch handlers are passive and can't. Pointer events still fire.
  useEffect(() => {
    const svg = svgRef.current!;
    const stop = (e: TouchEvent) => {
      if (!lockedRef.current && e.cancelable) e.preventDefault();
    };
    svg.addEventListener("touchstart", stop, { passive: false });
    svg.addEventListener("touchmove", stop, { passive: false });
    return () => {
      svg.removeEventListener("touchstart", stop);
      svg.removeEventListener("touchmove", stop);
    };
  }, []);

  // ---- pointer handling -------------------------------------------------
  const drag = useRef<{
    last: Cell | null;
    start: Point;
    moved: boolean;
    edgeAction: boolean | null; // true = adding, false = removing
    mark: CellMark | null | undefined; // value to paint in mark modes
  } | null>(null);

  const toGrid = (e: PointerEvent): Point => {
    const svg = svgRef.current!;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: pt.x, y: pt.y };
  };
  const cellAt = (p: Point): Cell | null => {
    const cell = { row: Math.floor(p.y), col: Math.floor(p.x) };
    return inBounds(width, height, cell.row, cell.col) ? cell : null;
  };

  const markTarget: CellMark = mode === "isTrack" ? "track" : "empty";
  const paintMark = (cell: Cell) => {
    const state = drag.current!;
    if (state.mark === undefined) {
      state.mark = boardRef.current.marks[cellKey(cell)] === markTarget ? null : markTarget;
    }
    const value = state.mark;
    onChange((b) => setMark(layout, b, cell, value));
  };

  const layEdge = (from: Cell, to: Cell) => {
    const key = edgeBetween(from, to);
    const state = drag.current!;
    if (!key || edges.has(key) !== playerEdges.has(key)) return; // fixed edge: skip
    // The first segment of a drag decides whether the whole drag adds or removes.
    if (state.edgeAction === null) state.edgeAction = !boardRef.current.edges.includes(key);
    const on = state.edgeAction;
    onChange((b) => setEdge(layout, b, key, on));
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (locked || e.button > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toGrid(e);
    const cell = cellAt(p);
    drag.current = { last: cell, start: p, moved: false, edgeAction: null, mark: undefined };
    if (cell && mode !== "track") paintMark(cell);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const state = drag.current;
    if (!state) return;
    const cell = cellAt(toGrid(e));
    if (!cell) return;
    if (!state.last) {
      state.last = cell;
      return;
    }
    // Walk one orthogonal step at a time, so fast or diagonal drags stay continuous.
    while (state.last.row !== cell.row || state.last.col !== cell.col) {
      const from: Cell = state.last;
      const dr = cell.row - from.row;
      const dc = cell.col - from.col;
      const next: Cell =
        Math.abs(dr) >= Math.abs(dc)
          ? { row: from.row + Math.sign(dr), col: from.col }
          : { row: from.row, col: from.col + Math.sign(dc) };
      state.moved = true;
      if (mode === "track") layEdge(from, next);
      else paintMark(next);
      state.last = next;
    }
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const state = drag.current;
    drag.current = null;
    if (!state || state.moved || mode !== "track") return;
    // A tap near a cell side toggles the segment across it.
    const p = toGrid(e);
    const cell = cellAt(p);
    if (!cell) return;
    const fx = p.x - cell.col;
    const fy = p.y - cell.row;
    const sides: [Dir, number][] = [
      [N, fy],
      [S, 1 - fy],
      [W, fx],
      [E, 1 - fx],
    ];
    const [dir, dist] = sides.reduce((best, s) => (s[1] < best[1] ? s : best));
    if (dist > TAP_EDGE_DISTANCE) return;
    const neighbour = { row: cell.row + DELTA[dir][0], col: cell.col + DELTA[dir][1] };
    if (!inBounds(width, height, neighbour.row, neighbour.col)) return;
    drag.current = { last: null, start: p, moved: true, edgeAction: null, mark: undefined };
    layEdge(cell, neighbour);
    drag.current = null;
  };

  // ---- rendering ---------------------------------------------------------
  const cells: Cell[] = [];
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) cells.push({ row: r, col: c });

  const fillFor = (cell: Cell) =>
    board.marks[cellKey(cell)] === "track" ? "var(--cell-marked)" : "var(--cell)";

  return (
    <svg
      ref={svgRef}
      className={`board board--${mode}${locked ? " board--locked" : ""}`}
      viewBox={`${-LEFT} ${-TOP} ${width + LEFT + RIGHT} ${height + TOP + BOTTOM}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      onContextMenu={(e) => e.preventDefault()}
      role="img"
      aria-label={`Puzzle grid, ${width} by ${height}`}
    >
      <rect x={0} y={0} width={width} height={height} className="board__frame" />

      {cells.map((cell) => (
        <rect
          key={`bg${cellKey(cell)}`}
          x={cell.col}
          y={cell.row}
          width={1}
          height={1}
          style={{ fill: fillFor(cell) }}
          className="board__cell"
        />
      ))}

      {cells.map((cell) =>
        board.marks[cellKey(cell)] === "empty" ? (
          <path
            key={`x${cellKey(cell)}`}
            className="board__cross"
            d={`M${cell.col + 0.36} ${cell.row + 0.36}L${cell.col + 0.64} ${cell.row + 0.64}M${cell.col + 0.64} ${cell.row + 0.36}L${cell.col + 0.36} ${cell.row + 0.64}`}
          />
        ) : null,
      )}

      {/* Endpoint stubs reaching out of the grid, labelled A/B beside the stub. */}
      {layout.endpoints.map((ep, i) => {
        const edge = midpoint(ep, ep.dir);
        const [dr, dc] = DELTA[ep.dir];
        const tip = { x: edge.x + dc * STUB, y: edge.y + dr * STUB };
        const vertical = ep.dir === N || ep.dir === S;
        const label = {
          x: edge.x + dc * 0.24 + (vertical ? 0.46 : 0),
          y: edge.y + dr * 0.24 + (vertical ? 0 : -0.46),
        };
        return (
          <g key={`ep${i}`}>
            <Rails d={`M${edge.x} ${edge.y}L${tip.x} ${tip.y}`} kind="fixed" gap="var(--bg)" />
            <text x={label.x} y={label.y} className="board__endpoint">
              {i === 0 ? "A" : "B"}
            </text>
          </g>
        );
      })}

      {cells.map((cell) => {
        const m = masks[cell.row]![cell.col]!;
        if (m === 0) return null;
        const fixed = hintCells.has(cellKey(cell));
        // A cell with one player segment and one fixed segment is drawn as player track.
        const anyPlayer = DIRS.some((d) => {
          if (!(m & d)) return false;
          const key = edgeBetween(cell, { row: cell.row + DELTA[d][0], col: cell.col + DELTA[d][1] });
          return key !== null && playerEdges.has(key);
        });
        return (
          <Rails
            key={`t${cellKey(cell)}`}
            d={piecePath(cell, m)}
            kind={fixed || !anyPlayer ? "fixed" : "player"}
            gap={fillFor(cell)}
          />
        );
      })}

      {/* Hint squares get a subtle corner tick so they read as "given". */}
      {layout.hints.map((h) => (
        <path key={`h${cellKey(h)}`} className="board__hint" d={`M${h.col + 0.06} ${h.row + 0.26}V${h.row + 0.06}H${h.col + 0.26}`} />
      ))}

      {Array.from({ length: width - 1 }, (_, i) => (
        <line key={`gv${i}`} x1={i + 1} y1={0} x2={i + 1} y2={height} className="board__gridline" />
      ))}
      {Array.from({ length: height - 1 }, (_, i) => (
        <line key={`gh${i}`} x1={0} y1={i + 1} x2={width} y2={i + 1} className="board__gridline" />
      ))}

      {highlight?.cells.map((cell) => (
        <rect
          key={`hl${cellKey(cell)}`}
          x={cell.col + 0.04}
          y={cell.row + 0.04}
          width={0.92}
          height={0.92}
          rx={0.12}
          className={`board__highlight board__highlight--${highlight.tone}`}
        />
      ))}
      {highlight?.edges.map((edge) => {
        const [a, b] = edgeCells(edge);
        return (
          <line
            key={`hle${edge}`}
            x1={a.col + 0.5}
            y1={a.row + 0.5}
            x2={b.col + 0.5}
            y2={b.row + 0.5}
            className={`board__highlight-edge board__highlight-edge--${highlight.tone}`}
          />
        );
      })}

      {layout.colClues.map((clue, c) => (
        <text key={`cc${c}`} x={c + 0.5} y={-CLUE_OFFSET} className={`clue clue--${clueStatus(counts.cols[c]!, clue)}`}>
          {clue}
        </text>
      ))}
      {layout.rowClues.map((clue, r) => (
        <text key={`rc${r}`} x={width + CLUE_OFFSET} y={r + 0.5} className={`clue clue--${clueStatus(counts.rows[r]!, clue)}`}>
          {clue}
        </text>
      ))}
    </svg>
  );
}

