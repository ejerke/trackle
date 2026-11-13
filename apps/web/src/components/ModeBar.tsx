import { CHALLENGE_DIFFICULTY, LEVELS, LEVEL_ORDER, isDailyOnly } from "@trackle/shared";
import { archiveUrl, dailyUrl, randomUrl } from "../routes";
import { useAuth } from "../auth";
import { forgetRandomSeeds, lastRandomSeed, loadPreferredDifficulty, rememberDifficulty } from "../storage/preferences";

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

/** The levels in the difficulty picker; the daily-only Challenge has its own button. */
const PICKER_LEVELS = LEVEL_ORDER.filter((d) => !isDailyOnly(d));

/**
 * Difficulty picker, "Today" / "New random", and a Challenge button. On a
 * daily page, picking a difficulty shows that difficulty's daily puzzle; on a
 * random page, the last random puzzle you had at that difficulty (a new one
 * if none). "New random" sits beside all the difficulties, so it starts a new
 * random puzzle for each of them, not just this one. The choice is
 * remembered for "/", and on the account when signed in.
 *
 * The Challenge (ADR 0025) is a daily puzzle of its own, not a difficulty you
 * play randomly, so it's a mode rather than a level: on it, only Today and
 * New random are shown, and they lead back to the level you usually play.
 * It follows the URL; it isn't remembered as your level.
 */
export function ModeBar({ kind, difficulty, date }: ModeBarProps) {
  const { user } = useAuth();
  const challenge = isDailyOnly(difficulty);
  const level = challenge ? loadPreferredDifficulty() : difficulty;
  const go = (url: string, chosen: number) => {
    rememberDifficulty(chosen, user !== null);
    window.location.assign(url);
  };

  const todayAndRandom = (
    <div className="segmented" role="group" aria-label="Puzzle">
      <button
        type="button"
        className="segmented__option"
        aria-pressed={kind === "daily" && !date && !challenge}
        onClick={() => go(dailyUrl(level), level)}
      >
        Today
      </button>
      <button
        type="button"
        className="segmented__option"
        onClick={() => {
          forgetRandomSeeds();
          go(randomUrl(level), level);
        }}
      >
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
  );

  if (challenge) {
    return (
      <nav className="mode-bar" aria-label="Puzzle selection">
        {todayAndRandom}
      </nav>
    );
  }

  return (
    <nav className="mode-bar" aria-label="Puzzle selection">
      <div className="segmented" role="group" aria-label="Difficulty">
        {PICKER_LEVELS.map((d) => ({ d, ...LEVELS[d]! })).map(({ d, name, shortName }) => (
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
      <div className="mode-bar__row">
        {todayAndRandom}
        <a
          className="segmented segmented__link"
          href={kind === "archive" ? archiveUrl(CHALLENGE_DIFFICULTY) : dailyUrl(CHALLENGE_DIFFICULTY)}
          title="The daily Challenge: no hints, and points on the leaderboard"
        >
          <span className="segmented__option">
            <TrophyIcon />
            Challenge
          </span>
        </a>
      </div>
    </nav>
  );
}

export function TrophyIcon({ className = "segmented__icon" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className}>
      <path
        d="M6 3h8v4a4 4 0 0 1-8 0zM6 5H3.5v1A2.5 2.5 0 0 0 6 8.5M14 5h2.5v1A2.5 2.5 0 0 1 14 8.5M10 11v3M7 17h6M8 14h4v3H8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
