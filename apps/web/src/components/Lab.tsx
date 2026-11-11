import { DIFFICULTY_NAMES, type LabPuzzleResponse } from "@trackle/shared";
import { useEffect, useMemo, useState } from "react";
import { ApiRequestError, checkLabTrack, fetchLabPuzzle } from "../api";
import { labUrl } from "../routes";
import { LocalProgressStore, MemoryStorage } from "../storage/localProgressStore";
import type { PuzzleKey } from "../storage/progressStore";
import { Game } from "./Game";
import { Page } from "./Page";

/**
 * DEVELOPMENT ONLY: play any generated puzzle by difficulty and seed, with its
 * metrics shown, to tune difficulty profiles. Progress is kept in memory only,
 * so lab puzzles never mix with real daily progress.
 */
const labStore = new LocalProgressStore(new MemoryStorage());

/** "lab-41" -> "lab-42"; "foo" -> "foo-1". */
function stepSeed(seed: string, delta: number): string {
  const m = /^(.*?)(\d+)$/.exec(seed);
  if (!m) return `${seed}-1`;
  return `${m[1]}${Math.max(0, Number(m[2]) + delta)}`;
}

type State =
  | { status: "loading" }
  | { status: "ready"; data: LabPuzzleResponse }
  | { status: "disabled" }
  | { status: "error" };

export function Lab({ difficulty, seed }: { difficulty: number; seed: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const progressKey = useMemo<PuzzleKey>(() => ({ kind: "random", seed: `lab:${seed}`, difficulty }), [seed, difficulty]);

  useEffect(() => {
    fetchLabPuzzle(difficulty, seed)
      .then((data) => setState({ status: "ready", data }))
      .catch((err: unknown) =>
        setState(err instanceof ApiRequestError && err.status === 404 ? { status: "disabled" } : { status: "error" }),
      );
  }, [difficulty, seed]);

  const randomSeed = () => `r-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <Page
      badge="lab"
      subtitle={
        <>
          {DIFFICULTY_NAMES[difficulty] ?? `Level ${difficulty}`} · seed <code>{seed}</code>
        </>
      }
    >
      <nav className="lab-nav" aria-label="Lab navigation">
        <div className="lab-nav__group">
          {Object.entries(DIFFICULTY_NAMES).map(([d, name]) => (
            <a
              key={d}
              className={`lab-pill${Number(d) === difficulty ? " lab-pill--active" : ""}`}
              href={labUrl(Number(d), seed)}
            >
              {name}
            </a>
          ))}
        </div>
        <div className="lab-nav__group">
          <a className="lab-pill" href={labUrl(difficulty, stepSeed(seed, -1))}>
            ← Prev
          </a>
          <a className="lab-pill" href={labUrl(difficulty, stepSeed(seed, 1))}>
            Next →
          </a>
          <a className="lab-pill" href={labUrl(difficulty, randomSeed())}>
            Random
          </a>
        </div>
      </nav>

      {state.status === "loading" && <p className="status">Generating…</p>}
      {state.status === "error" && <p className="status">Couldn't generate this puzzle.</p>}
      {state.status === "disabled" && (
        <p className="status">
          The lab is disabled or this difficulty doesn't exist. Start the server with <code>ENABLE_LAB=1</code>{" "}
          (<code>npm run dev</code> does).
        </p>
      )}
      {state.status === "ready" && (
        <>
          <Game
            puzzle={state.data.puzzle}
            progressKey={progressKey}
            store={labStore}
            check={(cells) => checkLabTrack(difficulty, seed, cells)}
          />
          <LabMetrics data={state.data} />
        </>
      )}
    </Page>
  );
}

function LabMetrics({ data }: { data: LabPuzzleResponse }) {
  const m = data.metrics;
  const rows: [string, string][] = [
    ["Hardest tier", m.tier === null ? "needs guessing" : `${m.tier} (${["", "local", "connectivity", "trial"][m.tier]})`],
    ["Tier 1 alone decides", `${Math.round(m.tier1Progress * 100)}%`],
    ["Tier 2 / 3 steps", `${m.tier2Steps} / ${m.tier3Steps}`],
    ["Track squares", String(m.trackCells)],
    ["To work out", String(m.toPlace)],
    ["Hints", String(m.hints)],
    ["Turns", String(m.turns)],
    ["Giveaway lines (0 or full)", String(m.giveawayLines)],
    ["Generation", `${data.attempts} attempts, ${data.generationMs} ms`],
    ["Passed filters", data.accepted ? "yes" : `no (best fallback; fails ${data.violations.join(", ")})`],
  ];
  return (
    <section className="lab-metrics">
      <h2>Metrics</h2>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
