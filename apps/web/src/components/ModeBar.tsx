import { LEVELS } from "@trackle/shared";
import { archiveUrl, dailyUrl, randomUrl } from "../routes";
import { useAuth } from "../auth";
import { lastRandomSeed, rememberDifficulty } from "../storage/preferences";

interface ModeBarProps {
  kind: "daily" | "random" | "archive";
  difficulty: number;
  /** Keep the date when switching difficulty on an archive day. */
  date?: string | null;
}

/**
 * Where picking difficulty `d` leads, staying on the same kind of page. On
 * random puzzles that's the last random puzzle at `d` (a new one only if
 * there's none yet).
 */
function urlFor(kind: ModeBarProps["kind"], d: number, date?: string | null): string {
  if (kind === "daily") return dailyUrl(d, date);
  if (kind === "archive") return archiveUrl(d);
  return randomUrl(d, lastRandomSeed(d) ?? undefined);
}

/**
 * Difficulty picker plus "Today" / "New random". On a daily page, picking a
 * difficulty shows that difficulty's daily puzzle; on a random page, the last
 * random puzzle you had at that difficulty (a new one if none). The choice is remembered for "/", and on
 * the account when signed in.
 */
export function ModeBar({ kind, difficulty, date }: ModeBarProps) {
  const { user } = useAuth();
  const go = (url: string, chosen: number) => {
    rememberDifficulty(chosen, user !== null);
    window.location.assign(url);
  };

  return (
    <nav className="mode-bar" aria-label="Puzzle selection">
      <div className="segmented" role="group" aria-label="Difficulty">
        {LEVELS.map(({ name, shortName }, d) => (
          <button
            key={d}
            type="button"
            className="segmented__option"
            aria-pressed={d === difficulty}
            onClick={() => d !== difficulty && go(urlFor(kind, d, date), d)}
          >
            {shortName ? (
              <>
                <span className="wide-only">{name}</span>
                <span className="narrow-only">{shortName}</span>
              </>
            ) : (
              name
            )}
          </button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label="Puzzle">
        <button
          type="button"
          className="segmented__option"
          aria-pressed={kind === "daily" && !date}
          onClick={() => go(dailyUrl(difficulty), difficulty)}
        >
          Today
        </button>
        <button type="button" className="segmented__option" onClick={() => go(randomUrl(difficulty), difficulty)}>
          <svg viewBox="0 0 20 20" aria-hidden="true" className="segmented__icon">
            <path
              d="M15.5 6.5A6 6 0 1 0 16 12M16 3v4h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {/* "New random" doesn't fit next to the difficulties on a phone. */}
          <span className="wide-only">New random</span>
          <span className="narrow-only">Random</span>
        </button>
      </div>
    </nav>
  );
}
