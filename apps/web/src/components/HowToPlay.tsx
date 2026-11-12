import { E, S, W, type PuzzleLayout } from "@trackle/shared";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Demo, boardOf, marksOf, script, squares, type Frame } from "./HowToDemo";
import type { CellMark } from "../storage/progressStore";
import { ToolChip } from "./Toolbar";

const SEEN_KEY = "trackle:prefs:seenHowToPlay";

/** First visit in this browser? Then the rules open by themselves, once. */
function firstVisit(): boolean {
  try {
    if (window.localStorage.getItem(SEEN_KEY)) return false;
    window.localStorage.setItem(SEEN_KEY, "1");
    return true;
  } catch {
    return false; // no storage: don't pop up on every page
  }
}

// ---- the example puzzle ------------------------------------------------------
//
// One 4×4 puzzle runs through every page:
//
//       1 3 4 1
//   A ━ ━ ━ ┓ ·  3
//       · · ┃ ·  1
//       · ┏ ┛ ·  2
//       · ┗ ━ ━ B 3
//
// It can be solved from the numbers alone, which the last page shows.

const LAYOUT: PuzzleLayout = {
  width: 4,
  height: 4,
  rowClues: [3, 1, 2, 3],
  colClues: [1, 3, 4, 1],
  endpoints: [
    { row: 0, col: 0, dir: W },
    { row: 3, col: 3, dir: E },
  ],
  hints: [],
};
/** The solution's segments, in order from A to B. */
const PATH = ["h:0:0", "h:0:1", "v:0:2", "v:1:2", "h:2:1", "v:2:1", "h:3:1", "h:3:2"];

/** The same puzzle with one piece given (the turn in the third row, second column). */
const GIVEN = { row: 2, col: 1, piece: E | S };
const LAYOUT_GIVEN: PuzzleLayout = { ...LAYOUT, hints: [GIVEN] };
const PATH_GIVEN = PATH.filter((e) => e !== "h:2:1" && e !== "v:2:1");

/** Lay the solution one segment at a time, on top of `marks`. */
const drawSolution = (ms: number, marks: Record<string, CellMark> = {}) =>
  PATH.map((_, i) => ({ board: boardOf(PATH.slice(0, i + 1), marks), ms }));

const at = (row: number, col: number, down = true) => ({ cell: { row, col }, down });

const COLUMN_2: [number, number][] = [[0, 2], [1, 2], [2, 2], [3, 2]];
const ROW_1: [number, number][] = [[1, 0], [1, 1], [1, 2], [1, 3]];

// ---- the basics: what a first-time player sees -------------------------------
// One idea per animation, slow enough to follow.

const GOAL = script([
  { board: boardOf([]), ms: 1500 },
  ...drawSolution(450),
  { train: true, ms: 8000 },
]);

const NUMBERS = script([
  { board: boardOf(PATH), ms: 1500 },
  { ms: 4000, caption: "This column has 4 squares of track: 4.", highlight: squares(COLUMN_2) },
  { ms: 4000, caption: "This row has just 1.", highlight: squares(ROW_1) },
]);

const DRAW = script([
  { board: boardOf([]), ms: 1200 },
  { pointer: at(0, 0, false), ms: 1000 },
  { pointer: at(0, 0), ms: 600 },
  { pointer: at(0, 1), board: boardOf(PATH.slice(0, 1)), ms: 800 },
  { pointer: at(0, 2), board: boardOf(PATH.slice(0, 2)), ms: 800 },
  { pointer: at(1, 2), board: boardOf(PATH.slice(0, 3)), ms: 800 },
  { pointer: at(1, 2, false), ms: 2500 },
]);

// ---- more help: opened from the end of the basics ----------------------------

const NO_TRACK_LEFT = marksOf("empty", [[1, 0], [2, 0], [3, 0]]);
const MARKING = script([
  { board: boardOf([]), ms: 1200, caption: <><ToolChip mode="noTrack" /> crosses out squares.</> },
  { pointer: at(1, 0, false), ms: 1000 },
  { pointer: at(1, 0), board: boardOf([], marksOf("empty", [[1, 0]])), ms: 800 },
  { pointer: at(2, 0), board: boardOf([], marksOf("empty", [[1, 0], [2, 0]])), ms: 800 },
  { pointer: at(3, 0), board: boardOf([], NO_TRACK_LEFT), ms: 800 },
  { pointer: at(3, 0, false), ms: 2000 },
  { pointer: at(3, 2, false), ms: 1500, caption: <><ToolChip mode="isTrack" /> shades squares that have track.</> },
  { pointer: at(3, 2), board: boardOf([], { ...NO_TRACK_LEFT, ...marksOf("track", [[3, 2]]) }), ms: 800 },
  { pointer: at(3, 2, false), ms: 3000 },
]);

const CLUES = script([
  { board: boardOf(PATH_GIVEN), ms: 4500, caption: "A ticked corner is a given piece.", highlight: squares([[GIVEN.row, GIVEN.col]]) },
  {
    board: boardOf(PATH_GIVEN, marksOf("track", [[1, 1]])),
    ms: 4500,
    caption: "Too much track in a line turns its number red.",
    highlight: squares([[1, 1]]),
  },
]);

const XS_RIGHT = marksOf("empty", [[0, 3], [1, 3], [2, 3]]);
const FULL_COLUMN = marksOf("track", COLUMN_2);
const ROW_DONE = marksOf("empty", [[1, 1]]);
const SOLVED_MARKS = { ...NO_TRACK_LEFT, ...XS_RIGHT, ...FULL_COLUMN, ...ROW_DONE };
const LOGIC = script([
  { board: boardOf([]), ms: 2500, caption: "Start where the numbers leave no choice." },
  {
    board: boardOf([], NO_TRACK_LEFT),
    ms: 4500,
    caption: "This 1 is A's own square, so the rest have no track.",
    highlight: squares([[0, 0], [1, 0], [2, 0], [3, 0]]),
  },
  {
    board: boardOf([], { ...NO_TRACK_LEFT, ...XS_RIGHT }),
    ms: 4000,
    caption: "Same here, with B.",
    highlight: squares([[0, 3], [1, 3], [2, 3], [3, 3]]),
  },
  {
    board: boardOf([], { ...NO_TRACK_LEFT, ...XS_RIGHT, ...FULL_COLUMN }),
    ms: 4500,
    caption: "4 out of 4: every square has track.",
    highlight: squares(COLUMN_2),
  },
  {
    board: boardOf([], SOLVED_MARKS),
    ms: 4500,
    caption: "This row's 1 is used up: the last square is empty.",
    highlight: squares(ROW_1),
  },
  { ms: 2500, caption: "Now there's only one way through." },
  ...drawSolution(450, SOLVED_MARKS),
  { train: true, ms: 8000 },
]);

interface PageDef {
  title: string;
  /** The page's animation, if it has one. */
  demo?: { layout: PuzzleLayout; frames: Frame[] };
  body: ReactNode;
}

const BASICS: PageDef[] = [
  {
    title: "Connect A to B",
    demo: { layout: LAYOUT, frames: GOAL },
    body: (
      <p>
        Build one track from <b>A</b> to <b>B</b>. In each square it runs straight or turns a corner. It never
        branches and never crosses itself.
      </p>
    ),
  },
  {
    title: "Count the squares",
    demo: { layout: LAYOUT, frames: NUMBERS },
    body: <p>The numbers say how many squares of each column (top) and row (right) the track passes through.</p>,
  },
  {
    title: "Draw",
    demo: { layout: LAYOUT, frames: DRAW },
    body: <p>Drag from square to square to lay track. Drag back over it to take it up.</p>,
  },
];

const MORE: PageDef[] = [
  {
    title: "Mark what you know",
    demo: { layout: LAYOUT, frames: MARKING },
    body: (
      <p>
        Pick a tool above the board, or press <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>. With a mouse, right-click
        always marks <b>No track</b> and middle-click <b>Is track</b>.
      </p>
    ),
  },
  {
    title: "Reading the board",
    demo: { layout: LAYOUT_GIVEN, frames: CLUES },
    body: <p>A number fades once its line is complete. Marked squares count too.</p>,
  },
  {
    title: "Work it out",
    demo: { layout: LAYOUT, frames: LOGIC },
    body: <p>Every puzzle has one solution, and reasoning like this always finds it. No guessing needed.</p>,
  },
  {
    title: "Good to know",
    body: (
      <ul>
        <li>The clock starts with your first move and stops as soon as the track is right.</li>
        <li>Stuck? Ask for a hint below the board.</li>
        <li>
          Each difficulty has a new puzzle every day. <b>New random</b> gives you as many more as you like.
        </li>
        <li>
          On <b>Insane</b> the track crosses itself once, over a bridge that's given.
        </li>
        <li>A tap near a square's side lays or lifts the piece across it.</li>
      </ul>
    ),
  },
];

const DECKS = { basics: BASICS, more: MORE };
type Deck = keyof typeof DECKS;

/**
 * The "?" button in the header and the paged how-to-play dialog it opens. A
 * native <dialog> opened with showModal() handles focus, Escape and the backdrop.
 */
export function HowToPlay() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [deck, setDeck] = useState<Deck>("basics");
  const [page, setPage] = useState(0);
  const pages = DECKS[deck];
  const last = page === pages.length - 1;

  const show = () => {
    setDeck("basics");
    setPage(0);
    setOpen(true);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();
  const back = () => {
    if (page > 0) setPage(page - 1);
    else if (deck === "more") {
      setDeck("basics");
      setPage(BASICS.length - 1);
    }
  };
  const next = () => (last ? close() : setPage(page + 1));
  const moreHelp = () => {
    setDeck("more");
    setPage(0);
  };

  useEffect(() => {
    if (firstVisit()) show();
  }, []);

  // Bottom-left: Skip while paging through the basics, More help at their end.
  const corner =
    deck === "basics" && last ? (
      <button type="button" className="link-button link-button--accent" onClick={moreHelp}>
        More help
      </button>
    ) : deck === "basics" ? (
      <button type="button" className="link-button" onClick={close}>
        Skip
      </button>
    ) : last ? (
      <span />
    ) : (
      <button type="button" className="link-button" onClick={close}>
        Close
      </button>
    );

  return (
    <>
      <button type="button" className="icon-button icon-button--text" onClick={show} aria-label="How to play" title="How to play">
        ?
      </button>
      <dialog
        ref={dialog}
        className="how"
        aria-labelledby="how-title"
        onClose={() => setOpen(false)}
        // A click on the backdrop lands on the <dialog> itself: close.
        onClick={(e) => e.target === e.currentTarget && close()}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" && !last) setPage(page + 1);
          if (e.key === "ArrowLeft") back();
        }}
      >
        <div className="how__body">
          <div className="how__top">
            <h2 id="how-title">{pages[page]!.title}</h2>
            <span className="how__count">
              {deck === "more" && "More help · "}
              {page + 1} / {pages.length}
            </span>
          </div>
          {/* A deck's pages share one grid cell, so the dialog keeps the tallest one's height. */}
          <div className="how__pages" key={deck}>
            {pages.map((p, i) => (
              <section key={p.title} className="how__page" aria-hidden={i !== page} data-current={i === page}>
                {p.demo && <Demo layout={p.demo.layout} frames={p.demo.frames} active={open && i === page} />}
                <div className="how__text">{p.body}</div>
              </section>
            ))}
          </div>
          <div className="how__nav">
            {corner}
            <div className="how__dots" aria-hidden="true">
              {pages.map((p, i) => (
                <span key={p.title} className="how__dot" data-current={i === page} />
              ))}
            </div>
            <div className="how__buttons">
              {(page > 0 || deck === "more") && (
                <button type="button" className="button" onClick={back}>
                  Back
                </button>
              )}
              <button type="button" className="button button--primary" onClick={next} autoFocus>
                {last ? "Let's play" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
