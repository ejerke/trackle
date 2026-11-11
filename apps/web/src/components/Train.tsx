import { DELTA, type Dir, type PuzzleLayout } from "@trackle/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RouteStep } from "../board/model";

/**
 * A little train that runs along a finished track, from A to B, as a
 * celebration. It drives the SVG directly from requestAnimationFrame rather
 * than through React state, so a run costs no re-renders.
 */

type Point = { x: number; y: number };

/** Board units per second. */
const SPEED = 2;
const MIN_MS = 1800;
const MAX_MS = 9000;
/** Space between neighbouring cars (coupler length). */
const CAR_GAP = 0.06;
/** Wagons behind the engine and tender. */
const WAGONS = 4;
/** Steam: a new puff this often, each lasting PUFF_MS. */
const PUFF_EVERY_MS = 95;
const PUFF_MS = 950;
const PUFFS = Math.ceil(PUFF_MS / PUFF_EVERY_MS) + 1;
/** Where the chimney sits on the engine, ahead of its centre. */
const CHIMNEY_X = 0.21;
/** Cars fade in/out over this distance at the stub tips. */
const FADE = 0.35;
/** How far the endpoint stubs reach out of the grid (matches Board's STUB). */
const STUB = 0.45;

const sideMidpoint = (row: number, col: number, d: Dir): Point => ({
  x: col + 0.5 + DELTA[d][1] * 0.5,
  y: row + 0.5 + DELTA[d][0] * 0.5,
});

/** One SVG path through every square of the route, in travel order, stub tip to stub tip. */
export function routePath(layout: PuzzleLayout, steps: RouteStep[]): string {
  const [a, b] = layout.endpoints;
  const aEdge = sideMidpoint(a.row, a.col, a.dir);
  const start = { x: aEdge.x + DELTA[a.dir][1] * STUB, y: aEdge.y + DELTA[a.dir][0] * STUB };
  let d = `M${start.x} ${start.y}L${aEdge.x} ${aEdge.y}`;
  for (const { cell, from, to } of steps) {
    const p1 = sideMidpoint(cell.row, cell.col, from);
    const p2 = sideMidpoint(cell.row, cell.col, to);
    // Opposite sides (a straight) share an x or a y; a curve's sides share neither.
    if (p1.x === p2.x || p1.y === p2.y) {
      d += `L${p2.x} ${p2.y}`;
      continue;
    }
    // Quarter circle of radius 0.5 around the square corner both sides touch.
    const center = { x: cell.col + 0.5, y: cell.row + 0.5 };
    const corner = { x: p1.x + p2.x - center.x, y: p1.y + p2.y - center.y };
    const cross = (p1.x - corner.x) * (p2.y - corner.y) - (p1.y - corner.y) * (p2.x - corner.x);
    d += `A0.5 0.5 0 0 ${cross > 0 ? 1 : 0} ${p2.x} ${p2.y}`;
  }
  const bEdge = sideMidpoint(b.row, b.col, b.dir);
  return `${d}L${bEdge.x + DELTA[b.dir][1] * STUB} ${bEdge.y + DELTA[b.dir][0] * STUB}`;
}

const easeInOut = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;

type CarKind = "engine" | "tender" | "boxcar" | "logs" | "tank";

/** Car lengths along the track, in board units. */
const LENGTH: Record<CarKind, number> = { engine: 0.64, tender: 0.4, boxcar: 0.52, logs: 0.52, tank: 0.5 };
const WAGON_KINDS: CarKind[] = ["boxcar", "logs", "tank"];
const CARS: CarKind[] = [
  "engine",
  "tender",
  ...Array.from({ length: WAGONS }, (_, i) => WAGON_KINDS[i % WAGON_KINDS.length]!),
];

/** How far behind the engine's centre each car's centre runs. */
const OFFSETS = CARS.reduce<number[]>((acc, kind, i) => {
  if (i === 0) return [0];
  const prev = CARS[i - 1]!;
  return [...acc, acc[i - 1]! + LENGTH[prev] / 2 + CAR_GAP + LENGTH[kind] / 2];
}, []);

/** Wheel ends poking out either side, drawn under the body. */
function Wheels({ at }: { at: number[] }) {
  return (
    <>
      {at.map((x) => (
        <rect key={x} x={x - 0.045} y={-0.185} width={0.09} height={0.37} rx={0.02} className="train__wheel" />
      ))}
    </>
  );
}

/** Coupler sticking out of the back of a car of this length. */
const Coupler = ({ length }: { length: number }) => (
  <rect x={-length / 2 - CAR_GAP - 0.01} y={-0.02} width={CAR_GAP + 0.02} height={0.04} className="train__wheel" />
);

/** Every car is drawn facing +x (direction of travel), centred on the origin. */
function Car({ kind }: { kind: CarKind }) {
  const len = LENGTH[kind];
  const half = len / 2;
  switch (kind) {
    case "engine":
      return (
        <>
          {/* Headlamp beam, under everything else. */}
          <path d="M0.31 -0.035L0.68 -0.17L0.68 0.17L0.31 0.035Z" className="train__beam" />
          <Wheels at={[-0.21, -0.04, 0.12]} />
          <rect x={-half} y={-0.15} width={len - 0.03} height={0.3} rx={0.03} className="train__frame train__outline" />
          {/* Red buffer beam and buffers at the front. */}
          <rect x={half - 0.045} y={-0.165} width={0.04} height={0.33} rx={0.01} className="train__buffer" />
          <circle cx={half} cy={-0.105} r={0.024} className="train__frame" />
          <circle cx={half} cy={0.105} r={0.024} className="train__frame" />
          {/* Boiler: a rounded cylinder with a shine, brass bands and a dark smokebox. */}
          <rect x={-0.1} y={-0.115} width={0.39} height={0.23} rx={0.09} className="train__body" />
          <rect x={0.17} y={-0.115} width={0.12} height={0.23} rx={0.08} className="train__smokebox" />
          <rect x={-0.08} y={-0.088} width={0.33} height={0.032} rx={0.016} className="train__shine" />
          <line x1={-0.01} y1={-0.115} x2={-0.01} y2={0.115} className="train__band" />
          <line x1={0.1} y1={-0.115} x2={0.1} y2={0.115} className="train__band" />
          <line x1={0.17} y1={-0.112} x2={0.17} y2={0.112} className="train__band" />
          {/* Steam dome and chimney. */}
          <circle cx={0.045} cy={0} r={0.047} className="train__brass" />
          <circle cx={0.035} cy={-0.015} r={0.014} className="train__shine" />
          <circle cx={CHIMNEY_X} cy={0} r={0.052} className="train__smokebox" />
          <circle cx={CHIMNEY_X} cy={0} r={0.028} className="train__hole" />
          <circle cx={half - 0.015} cy={0} r={0.024} className="train__lamp" />
          {/* Cab, with a lighter roof, a ridge and a vent. */}
          <rect x={-half} y={-0.172} width={0.23} height={0.344} rx={0.04} className="train__cab train__outline" />
          <rect x={-half + 0.016} y={-0.148} width={0.198} height={0.296} rx={0.03} className="train__roof" />
          <line x1={-half + 0.02} y1={0} x2={-half + 0.21} y2={0} className="train__ridge" />
          <rect x={-0.24} y={-0.06} width={0.07} height={0.12} rx={0.015} className="train__cab" />
        </>
      );
    case "tender":
      return (
        <>
          <Coupler length={len} />
          <Wheels at={[-0.11, 0.11]} />
          <rect x={-half} y={-0.155} width={len} height={0.31} rx={0.04} className="train__body train__outline" />
          <rect x={-half + 0.03} y={-0.12} width={len - 0.1} height={0.24} rx={0.03} className="train__coal" />
          {[
            [-0.11, -0.05, 0.035],
            [-0.04, 0.04, 0.04],
            [0.03, -0.04, 0.032],
            [0.08, 0.05, 0.028],
            [-0.12, 0.06, 0.025],
            [0.06, 0.0, 0.022],
          ].map(([x, y, r]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r={r} className="train__lump" />
          ))}
          {/* Water filler hatch at the front. */}
          <circle cx={half - 0.04} cy={0} r={0.035} className="train__brass" />
          <rect x={-half - 0.005} y={-0.155} width={0.025} height={0.31} rx={0.01} className="train__band" />
        </>
      );
    case "boxcar":
      return (
        <>
          <Coupler length={len} />
          <Wheels at={[-0.16, 0.16]} />
          <rect x={-half} y={-0.165} width={len} height={0.33} rx={0.035} className="train__wagon train__outline" />
          {[-0.18, -0.09, 0, 0.09, 0.18].map((x) => (
            <line key={x} x1={x} y1={-0.15} x2={x} y2={0.15} className="train__rib" />
          ))}
          {/* Roof walkway. */}
          <rect x={-half + 0.02} y={-0.028} width={len - 0.04} height={0.056} rx={0.01} className="train__wood" />
        </>
      );
    case "logs":
      return (
        <>
          <Coupler length={len} />
          <Wheels at={[-0.16, 0.16]} />
          <rect x={-half} y={-0.15} width={len} height={0.3} rx={0.03} className="train__frame train__outline" />
          {[-0.095, 0, 0.095].map((y) => (
            <g key={y}>
              <rect x={-half + 0.025} y={y - 0.045} width={len - 0.05} height={0.09} rx={0.045} className="train__log" />
              <line x1={-half + 0.05} y1={y - 0.012} x2={half - 0.08} y2={y - 0.012} className="train__grain" />
              <ellipse cx={half - 0.035} cy={y} rx={0.014} ry={0.04} className="train__log-end" />
            </g>
          ))}
          {/* Stakes holding the logs, and a chain across the middle. */}
          {[-0.17, 0.17].flatMap((x) =>
            [-0.15, 0.15].map((y) => (
              <rect key={`${x}${y}`} x={x - 0.018} y={y - 0.018} width={0.036} height={0.036} className="train__wheel" />
            )),
          )}
          <line x1={0.02} y1={-0.15} x2={0.02} y2={0.15} className="train__chain" />
        </>
      );
    case "tank":
      return (
        <>
          <Coupler length={len} />
          <Wheels at={[-0.15, 0.15]} />
          <rect x={-half} y={-0.14} width={len} height={0.28} rx={0.03} className="train__frame train__outline" />
          <rect x={-half + 0.02} y={-0.13} width={len - 0.04} height={0.26} rx={0.13} className="train__tank" />
          <rect x={-half + 0.06} y={-0.095} width={len - 0.12} height={0.03} rx={0.015} className="train__shine" />
          {[-0.12, 0.12].map((x) => (
            <line key={x} x1={x} y1={-0.128} x2={x} y2={0.128} className="train__band" />
          ))}
          <circle cx={0} cy={0} r={0.045} className="train__brass" />
          <circle cx={0} cy={0} r={0.022} className="train__tank" />
        </>
      );
  }
}

interface Puff {
  x: number;
  y: number;
  dx: number;
  dy: number;
  born: number;
}

export function Train({ layout, steps }: { layout: PuzzleLayout; steps: RouteStep[] }) {
  const d = useMemo(() => routePath(layout, steps), [layout, steps]);
  const pathRef = useRef<SVGPathElement>(null);
  const carRefs = useRef<(SVGGElement | null)[]>([]);
  const puffRefs = useRef<(SVGCircleElement | null)[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const length = path.getTotalLength();
    // The engine travels until the last car has left through B.
    const travel = length + OFFSETS[OFFSETS.length - 1]!;
    const duration = Math.min(MAX_MS, Math.max(MIN_MS, (travel / SPEED) * 1000));
    const puffs: (Puff | null)[] = Array.from({ length: PUFFS }, () => null);
    let nextPuff = 0;
    let lastPuffAt = -Infinity;
    let frame = 0;
    let startedAt: number | null = null;

    /** Positions one car; returns its heading (radians) and opacity, or null when off the track. */
    const place = (car: SVGGElement, at: number) => {
      if (at < 0 || at > length) {
        car.setAttribute("opacity", "0");
        return null;
      }
      const p = path.getPointAtLength(at);
      const ahead = path.getPointAtLength(Math.min(length, at + 0.02));
      const behind = path.getPointAtLength(Math.max(0, at - 0.02));
      const angle = Math.atan2(ahead.y - behind.y, ahead.x - behind.x);
      const opacity = Math.min(1, at / FADE, (length - at) / FADE);
      car.setAttribute("opacity", String(opacity));
      car.setAttribute("transform", `translate(${p.x} ${p.y}) rotate(${(angle * 180) / Math.PI})`);
      return { p, angle, opacity };
    };

    const tick = (now: number) => {
      startedAt ??= now;
      const t = Math.min(1, (now - startedAt) / duration);
      const head = easeInOut(t) * travel;
      let engine: ReturnType<typeof place> = null;
      carRefs.current.forEach((car, i) => {
        if (!car) return;
        const placed = place(car, head - OFFSETS[i]!);
        if (i === 0) engine = placed;
      });

      // Steam: puff from the chimney while the engine is on the board.
      const e = engine as ReturnType<typeof place>;
      if (e && e.opacity > 0.5 && t < 1 && now - lastPuffAt >= PUFF_EVERY_MS) {
        lastPuffAt = now;
        const spread = (Math.random() - 0.5) * 0.12;
        puffs[nextPuff] = {
          x: e.p.x + Math.cos(e.angle) * CHIMNEY_X,
          y: e.p.y + Math.sin(e.angle) * CHIMNEY_X,
          // Drift backwards a little, as if left behind, and to one side.
          dx: -Math.cos(e.angle) * 0.12 - Math.sin(e.angle) * spread,
          dy: -Math.sin(e.angle) * 0.12 + Math.cos(e.angle) * spread,
          born: now,
        };
        nextPuff = (nextPuff + 1) % PUFFS;
      }
      let steaming = false;
      puffs.forEach((puff, i) => {
        const el = puffRefs.current[i];
        if (!el) return;
        const age = puff ? (now - puff.born) / PUFF_MS : 1;
        if (!puff || age >= 1) {
          el.setAttribute("opacity", "0");
          return;
        }
        steaming = true;
        el.setAttribute("cx", String(puff.x + puff.dx * age));
        el.setAttribute("cy", String(puff.y + puff.dy * age));
        el.setAttribute("r", String(0.035 + 0.13 * Math.sqrt(age)));
        el.setAttribute("opacity", String(0.6 * (1 - age) ** 1.5));
      });

      if (t < 1 || steaming) frame = requestAnimationFrame(tick);
      else setDone(true);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [d]);

  if (done) return null;
  return (
    <g className="train" aria-hidden="true">
      <path ref={pathRef} d={d} className="train__route" />
      {/* Drawn back to front, so each car's coupler tucks under the car ahead. */}
      {CARS.map((kind, i) => i)
        .reverse()
        .map((i) => (
          <g key={i} ref={(el) => void (carRefs.current[i] = el)} opacity={0}>
            <Car kind={CARS[i]!} />
          </g>
        ))}
      <g className="train__steam">
        {Array.from({ length: PUFFS }, (_, i) => (
          <circle key={i} ref={(el) => void (puffRefs.current[i] = el)} r={0} opacity={0} className="train__puff" />
        ))}
      </g>
    </g>
  );
}
