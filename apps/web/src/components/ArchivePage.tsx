import { difficultyName, type ArchiveResponse } from "@trackle/shared";
import { useEffect, useMemo, useState } from "react";
import { fetchArchive } from "../api";
import { dailyUrl } from "../routes";
import { loadPreferredDifficulty } from "../storage/preferences";
import type { ProgressStore, PuzzleProgress } from "../storage/progressStore";
import { ModeBar } from "./ModeBar";
import { Page } from "./Page";

type Status = "solved" | "revealed" | "started" | "unplayed";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** Past daily puzzles as month calendars, marked with this browser's progress. */
export function ArchivePage({ difficulty: fromUrl, store }: { difficulty: number | null; store: ProgressStore }) {
  const [difficulty] = useState(() => fromUrl ?? loadPreferredDifficulty());
  const [archive, setArchive] = useState<ArchiveResponse | null>(null);
  const [records, setRecords] = useState<PuzzleProgress[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchArchive(difficulty).then(setArchive, () => setFailed(true));
    void store.list().then(setRecords);
  }, [difficulty, store]);

  const status = useMemo(() => {
    const byDate = new Map<string, Status>();
    for (const p of records) {
      if (p.key.kind === "daily" && p.key.difficulty === difficulty) {
        byDate.set(p.key.date, p.solvedAt ? "solved" : p.revealedAt ? "revealed" : "started");
      }
    }
    return byDate;
  }, [records, difficulty]);

  // Group the available dates by month, newest month first.
  const months = useMemo(() => {
    const groups = new Map<string, Set<string>>();
    for (const date of archive?.dates ?? []) {
      const month = date.slice(0, 7);
      if (!groups.has(month)) groups.set(month, new Set());
      groups.get(month)!.add(date);
    }
    return [...groups];
  }, [archive]);

  return (
    <Page subtitle={`Archive · ${difficultyName(difficulty)}`} store={store}>
      <ModeBar kind="archive" difficulty={difficulty} />
      {failed && <p className="status">Couldn't load the archive. Try reloading.</p>}
      {!failed && !archive && <p className="status">Loading…</p>}
      {archive && months.length === 0 && <p className="status">No {difficultyName(difficulty)} tracks yet.</p>}
      {archive && (
        <>
          {months.map(([month, dates]) => (
            <Month
              key={month}
              month={month}
              dates={dates}
              today={archive.today}
              status={status}
              difficulty={difficulty}
            />
          ))}
          {months.length > 0 && (
            <p className="archive-legend">
              <span className="archive-day archive-day--solved">✓</span> solved
              <span className="archive-day archive-day--revealed">?</span> answer shown
              <span className="archive-day archive-day--started">•</span> started
              <span className="archive-day archive-day--unplayed">·</span> not played
            </p>
          )}
        </>
      )}
    </Page>
  );
}

function Month(props: {
  month: string;
  dates: Set<string>;
  today: string;
  status: Map<string, Status>;
  difficulty: number;
}) {
  const { month, dates, today, status, difficulty } = props;
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  // Monday-first offset of the 1st of the month.
  const offset = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const title = new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <section className="archive-month">
      <h2>{title}</h2>
      <div className="archive-grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="archive-weekday">
            {w}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`pad${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const date = `${month}-${String(day).padStart(2, "0")}`;
          if (!dates.has(date)) {
            return (
              <span key={date} className="archive-day archive-day--none">
                {day}
              </span>
            );
          }
          const s = status.get(date) ?? "unplayed";
          return (
            <a
              key={date}
              href={date === today ? dailyUrl(difficulty) : dailyUrl(difficulty, date)}
              className={`archive-day archive-day--${s}${date === today ? " archive-day--today" : ""}`}
              aria-label={`${date}: ${s}`}
            >
              {day}
            </a>
          );
        })}
      </div>
    </section>
  );
}
