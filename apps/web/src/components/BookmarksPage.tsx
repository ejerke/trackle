import {
  BOOKMARK_NAME_MAX,
  cleanBookmarkName,
  difficultyName,
  isBookmarked,
  played,
  puzzleKeyId,
  totalHints,
  utcDate,
} from "@trackle/shared";
import { useEffect, useState, type FormEvent } from "react";
import { dailyUrl, randomUrl } from "../routes";
import type { ProgressStore, PuzzleProgress } from "../storage/progressStore";
import { Page } from "./Page";

/** Solved, the first time or (after the answer was shown) on a retry. */
const solvedSomehow = (p: PuzzleProgress) => p.solvedAt !== null || p.replay?.solvedAt != null;

function title(p: PuzzleProgress): string {
  if (p.key.kind === "random") return `Random · ${difficultyName(p.key.difficulty)}`;
  const date = new Date(`${p.key.date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${date} · ${difficultyName(p.key.difficulty)}`;
}

function status(p: PuzzleProgress): string {
  if (p.solvedAt) return totalHints(p) === 0 ? "Solved on your own" : `Solved with ${totalHints(p)} hint${totalHints(p) === 1 ? "" : "s"}`;
  if (p.revealedAt) return p.replay?.solvedAt ? "Answer shown, then solved on a retry" : "Answer shown";
  return played(p) ? "In progress" : "Not started";
}

function href(p: PuzzleProgress): string {
  if (p.key.kind === "random") return randomUrl(p.key.difficulty, p.key.seed);
  return p.key.date === utcDate(new Date()) ? dailyUrl(p.key.difficulty) : dailyUrl(p.key.difficulty, p.key.date);
}

/** Puzzles the player bookmarked: the ones still to solve first. */
export function BookmarksPage({ store }: { store: ProgressStore }) {
  const [records, setRecords] = useState<PuzzleProgress[] | null>(null);

  useEffect(() => {
    void store.list().then((all) => setRecords(all.filter(isBookmarked)));
  }, [store]);

  const remove = (p: PuzzleProgress) => {
    void store.save({ ...p, bookmark: { ...p.bookmark, on: false, at: new Date().toISOString() } });
    setRecords((rs) => rs && rs.filter((r) => r !== p));
  };

  const rename = async (p: PuzzleProgress, typed: string) => {
    // Re-read first: the record may have changed since the list was loaded (another tab).
    const fresh = (await store.get(p.key)) ?? p;
    const name = cleanBookmarkName(typed);
    const { name: _old, ...rest } = fresh.bookmark ?? { on: true, at: "" };
    const next = { ...fresh, bookmark: { ...rest, on: true, at: new Date().toISOString(), ...(name ? { name } : {}) } };
    await store.save(next);
    setRecords((rs) => rs && rs.map((r) => (puzzleKeyId(r.key) === puzzleKeyId(p.key) ? next : r)));
  };

  const open = records?.filter((p) => !solvedSomehow(p)) ?? [];
  const done = records?.filter(solvedSomehow) ?? [];

  return (
    <Page subtitle="Bookmarks" store={store}>
      {!records ? (
        <p className="status">Loading…</p>
      ) : records.length === 0 ? (
        <p className="status">
          No bookmarks yet. Tap the bookmark next to the clock on any puzzle to keep it here, for example one you
          want to come back to.
        </p>
      ) : (
        <>
          <List
            heading="Still to solve"
            records={open}
            empty="Nothing left: you've solved every bookmarked puzzle."
            onRemove={remove}
            onRename={rename}
          />
          {done.length > 0 && <List heading="Solved" records={done} onRemove={remove} onRename={rename} />}
        </>
      )}
    </Page>
  );
}

interface ListProps {
  heading: string;
  records: PuzzleProgress[];
  empty?: string;
  onRemove(p: PuzzleProgress): void;
  onRename(p: PuzzleProgress, name: string): Promise<void>;
}

function List({ heading, records, empty, onRemove, onRename }: ListProps) {
  return (
    <section className="bookmarks">
      <h2>{heading}</h2>
      {records.length === 0 && empty && <p className="bookmarks__empty">{empty}</p>}
      <ul>
        {records.map((p) => (
          <Item key={puzzleKeyId(p.key)} record={p} onRemove={onRemove} onRename={onRename} />
        ))}
      </ul>
    </section>
  );
}

function Item({ record: p, onRemove, onRename }: { record: PuzzleProgress } & Pick<ListProps, "onRemove" | "onRename">) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const name = p.bookmark?.name;
  const label = name ?? title(p);

  const startEditing = () => {
    setDraft(name ?? "");
    setEditing(true);
  };
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onRename(p, draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="bookmarks__item">
        <form className="bookmarks__rename" onSubmit={onSubmit}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={BOOKMARK_NAME_MAX}
            placeholder={title(p)}
            aria-label={`Name for ${title(p)}`}
            autoFocus
            onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          />
          <button type="submit" className="button button--primary">
            Save
          </button>
          <button type="button" className="link-button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      </li>
    );
  }

  return (
    <li className="bookmarks__item">
      <a href={href(p)} className="bookmarks__link">
        <span className="bookmarks__title">{label}</span>
        <span className="bookmarks__status">
          {name ? `${title(p)} · ` : ""}
          {status(p)}
        </span>
      </a>
      <button type="button" className="link-button" onClick={startEditing} aria-label={`Rename bookmark: ${label}`}>
        {name ? "Rename" : "Name"}
      </button>
      <button type="button" className="link-button" onClick={() => onRemove(p)} aria-label={`Remove bookmark: ${label}`}>
        Remove
      </button>
    </li>
  );
}
