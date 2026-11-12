import { DELTA, opposite, type Dir, type PuzzleLayout } from "@trackle/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RouteStep } from "../board/model";

/**
 * A little train that runs along a finished track, from A to B, as a
 * celebration. Until then its engine waits on A's stub, outside the grid, so
 * it's clear which end it starts from. It drives the SVG directly from
 * requestAnimationFrame rather than through React state, so a run costs no
 * re-renders.
 */

type Point = { x: number; y: number };

/** Board units per second. */
const SPEED = 2;
const MIN_MS = 1800;
const MAX_MS = 9000;
/** A long train may take a little longer per wagon, so it doesn't race. */
const MS_PER_WAGON = 250;
/** Space between neighbouring cars (coupler length). */
const CAR_GAP = 0.06;
/** Wagons behind the engine and tender, unless told otherwise (one per streak day in the game). */
export const DEFAULT_WAGONS = 4;
/** More than this and the train would fill the board several times over. */
export const MAX_WAGONS = 60;
/** Where the chimney sits on the engine, ahead of its centre. */
const CHIMNEY_X = 0.21;
/** Cars fade in/out over this distance at the stub tips. */
const FADE = 0.35;
/** How far B's stub reaches out of the grid. */
export const STUB = 0.45;
/** A's stub is longer: the engine waits on it, clear of the grid. */
export const A_STUB = 0.75;
/** Where the waiting engine's centre is, measured out from the grid edge. */
const PARKED_OUT = 0.39;
/** The parked engine's distance along the route path (which starts at A's stub tip). */
const PARKED_AT = A_STUB - PARKED_OUT;

/** Length of endpoint i's stub (0 = A). */
export const stubLength = (i: number) => (i === 0 ? A_STUB : STUB);

const sideMidpoint = (row: number, col: number, d: Dir): Point => ({
  x: col + 0.5 + DELTA[d][1] * 0.5,
  y: row + 0.5 + DELTA[d][0] * 0.5,
});

/** One SVG path through every square of the route, in travel order, stub tip to stub tip. */
export function routePath(layout: PuzzleLayout, steps: RouteStep[]): string {
  const [a, b] = layout.endpoints;
  const aEdge = sideMidpoint(a.row, a.col, a.dir);
  const start = { x: aEdge.x + DELTA[a.dir][1] * A_STUB, y: aEdge.y + DELTA[a.dir][0] * A_STUB };
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
/** Engine, tender, then `wagons` wagons in a repeating mix. */
function carsFor(wagons: number): CarKind[] {
  const n = Math.max(0, Math.min(MAX_WAGONS, Math.floor(wagons)));
  return ["engine", "tender", ...Array.from({ length: n }, (_, i) => WAGON_KINDS[i % WAGON_KINDS.length]!)];
}

/** How far behind the engine's centre each car's centre runs. */
function offsetsFor(cars: CarKind[]): number[] {
  return cars.reduce<number[]>((acc, kind, i) => {
    if (i === 0) return [0];
    const prev = cars[i - 1]!;
    return [...acc, acc[i - 1]! + LENGTH[prev] / 2 + CAR_GAP + LENGTH[kind] / 2];
  }, []);
}

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

/** The engine waiting on A's stub, facing into the grid. */
function parkedTransform(layout: PuzzleLayout): string {
  const a = layout.endpoints[0];
  const edge = sideMidpoint(a.row, a.col, a.dir);
  const [dr, dc] = DELTA[a.dir];
  const [ir, ic] = DELTA[opposite(a.dir)];
  const angle = (Math.atan2(ir, ic) * 180) / Math.PI;
  return `translate(${edge.x + dc * PARKED_OUT} ${edge.y + dr * PARKED_OUT}) rotate(${angle})`;
}

/**
 * With no route, just the engine waiting at A. Given a route (the track is
 * finished), the whole train sets off from there, pulling `wagons` wagons.
 * Remount (change `key`) to run again.
 */
export function Train({
  layout,
  steps,
  wagons = DEFAULT_WAGONS,
}: {
  layout: PuzzleLayout;
  steps: RouteStep[] | null;
  wagons?: number;
}) {
  if (!steps) {
    return (
      <g className="train train--parked" aria-hidden="true">
        <g transform={parkedTransform(layout)}>
          <Car kind="engine" />
        </g>
      </g>
    );
  }
  return <RunningTrain layout={layout} steps={steps} wagons={wagons} />;
}

function RunningTrain({ layout, steps, wagons }: { layout: PuzzleLayout; steps: RouteStep[]; wagons: number }) {
  const d = useMemo(() => routePath(layout, steps), [layout, steps]);
  // Fixed for the run: the train doesn't grow mid-journey.
  const [cars] = useState(() => carsFor(wagons));
  const offsets = useMemo(() => offsetsFor(cars), [cars]);
  const pathRef = useRef<SVGPathElement>(null);
  const carRefs = useRef<(SVGGElement | null)[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const length = path.getTotalLength();
    // The engine sets off from where it was parked and travels until the
    // last car has left through B.
    const travel = length + offsets[offsets.length - 1]! - PARKED_AT;
    const longest = MAX_MS + Math.max(0, cars.length - 2 - DEFAULT_WAGONS) * MS_PER_WAGON;
    const duration = Math.min(longest, Math.max(MIN_MS, (travel / SPEED) * 1000));
    let frame = 0;
    let startedAt: number | null = null;

    /** Positions one car `at` this far along the path (hidden when off it). */
    const place = (car: SVGGElement, at: number) => {
      if (at < 0 || at > length) {
        car.setAttribute("opacity", "0");
        return;
      }
      const p = path.getPointAtLength(at);
      const ahead = path.getPointAtLength(Math.min(length, at + 0.02));
      const behind = path.getPointAtLength(Math.max(0, at - 0.02));
      const angle = Math.atan2(ahead.y - behind.y, ahead.x - behind.x);
      const opacity = Math.min(1, at / FADE, (length - at) / FADE);
      car.setAttribute("opacity", String(opacity));
      car.setAttribute("transform", `translate(${p.x} ${p.y}) rotate(${(angle * 180) / Math.PI})`);
    };

    const tick = (now: number) => {
      startedAt ??= now;
      const t = Math.min(1, (now - startedAt) / duration);
      const head = PARKED_AT + easeInOut(t) * travel;
      carRefs.current.forEach((car, i) => car && place(car, head - offsets[i]!));

      if (t < 1) frame = requestAnimationFrame(tick);
      else setDone(true);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [d, cars, offsets]);

  if (done) return null;
  return (
    <g className="train" aria-hidden="true">
      <path ref={pathRef} d={d} className="train__route" />
      {/* Drawn back to front, so each car's coupler tucks under the car ahead. */}
      {cars.map((_, i) => i)
        .reverse()
        .map((i) => (
          // The engine starts where it was parked, so swapping from the parked
          // engine shows no gap before the first frame.
          <g
            key={i}
            ref={(el) => void (carRefs.current[i] = el)}
            opacity={i === 0 ? 1 : 0}
            transform={i === 0 ? parkedTransform(layout) : undefined}
          >
            <Car kind={cars[i]!} />
          </g>
        ))}
    </g>
  );
}
