import type { ReactNode } from "react";
import { useAuth } from "../auth";

/** Common page frame: title, subtitle, content, and the how-to-play box. */
export function Page({ subtitle, badge, children }: { subtitle?: ReactNode; badge?: string; children: ReactNode }) {
  const { user } = useAuth();
  return (
    <main className="app">
      <header className="header">
        <h1 className="header__title">
          <a href="/">Trackle</a>
          {badge && <span className="lab-badge">{badge}</span>}
        </h1>
        {subtitle && <p className="header__date">{subtitle}</p>}
        <nav className="site-nav" aria-label="Site">
          <a href="/">Today</a>
          <a href="/archive">Archive</a>
          <a href="/stats">Stats</a>
          <a href="/account" className="site-nav__account">
            {user ? user.username : "Sign in"}
          </a>
        </nav>
      </header>
      {children}
      <HowToPlay />
    </main>
  );
}

function HowToPlay() {
  return (
    <details className="how">
      <summary>How to play</summary>
      <ul>
        <li>
          Build one track from <b>A</b> to <b>B</b>. It can go straight or turn 90° inside a square, but never
          branches or crosses itself.
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
          Every difficulty has its own puzzle each day. <b>New random</b> makes an endless supply; its link can be
          shared.
        </li>
      </ul>
    </details>
  );
}
