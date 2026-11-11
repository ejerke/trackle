import { useEffect, useRef } from "react";

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

/**
 * The "?" button in the header and the rules dialog it opens. A native
 * <dialog> opened with showModal() handles focus, Escape and the backdrop.
 */
export function HowToPlay() {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (firstVisit()) dialog.current?.showModal();
  }, []);

  return (
    <>
      <button
        type="button"
        className="icon-button icon-button--text"
        onClick={() => dialog.current?.showModal()}
        aria-label="How to play"
        title="How to play"
      >
        ?
      </button>
      <dialog
        ref={dialog}
        className="how"
        aria-labelledby="how-title"
        // A click on the backdrop lands on the <dialog> itself: close.
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      >
        <div className="how__body">
          <h2 id="how-title">How to play</h2>
          <ul>
            <li>
              Build one track from <b>A</b> to <b>B</b>. It can go straight or turn 90° inside a square, but never
              branches or crosses itself.
            </li>
            <li>
              Except on <b>Insane</b>: there the track crosses itself once, straight over at right angles. Draw all four
              sides of that square. Sometimes the crossing is given; sometimes you have to find it.
            </li>
            <li>The numbers say how many squares in each column (top) and row (right) contain track.</li>
            <li>Pieces with a corner tick are given and can't be changed.</li>
            <li>
              <b>Track</b>: drag between squares to lay track, or tap near a square's edge. Drag over existing track to
              remove it.
            </li>
            <li>
              <b>Is track</b> / <b>No track</b>: mark squares you've worked out. Keys 1, 2, 3 switch modes.
            </li>
            <li>
              You're timed: the clock starts with your first move and stops as soon as the track is right. It pauses
              while the page is in the background.
            </li>
            <li>
              Every difficulty has its own puzzle each day. <b>New random</b> makes an endless supply; its link can be
              shared.
            </li>
          </ul>
          <form method="dialog">
            <button className="button button--primary">Got it</button>
          </form>
        </div>
      </dialog>
    </>
  );
}
