import { DIFFICULTY_NAMES } from "@trackle/shared";
import { dailyUrl, randomUrl } from "../routes";
import { savePreferredDifficulty } from "../storage/preferences";

interface ModeBarProps {
  kind: "daily" | "random";
  difficulty: number;
  /** Keep the date when switching difficulty on an archive day. */
  date?: string | null;
}

const LEVELS = Object.entries(DIFFICULTY_NAMES).map(([d, name]) => ({ difficulty: Number(d), name }));

/**
 * Difficulty picker plus "Today" / "New random". On a daily page, picking a
 * difficulty shows that difficulty's daily puzzle; on a random page, a new
 * random puzzle of that difficulty. The choice is remembered for "/".
 */
export function ModeBar({ kind, difficulty, date }: ModeBarProps) {
  const go = (url: string, chosen: number) => {
    savePreferredDifficulty(chosen);
    window.location.assign(url);
  };

  return (
    <nav className="mode-bar" aria-label="Puzzle selection">
      <div className="segmented" role="group" aria-label="Difficulty">
        {LEVELS.map(({ difficulty: d, name }) => (
          <button
            key={d}
            type="button"
            className="segmented__option"
            aria-pressed={d === difficulty}
            onClick={() => d !== difficulty && go(kind === "daily" ? dailyUrl(d, date) : randomUrl(d), d)}
          >
            {name}
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
          New random
        </button>
      </div>
    </nav>
  );
}
