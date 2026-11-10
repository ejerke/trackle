import type { ReactNode } from "react";
import { useAuth } from "../auth";
import { HowToPlay } from "./HowToPlay";

/** Common page frame: title, subtitle, navigation (with the how-to-play button), content. */
export function Page({ subtitle, badge, children }: { subtitle?: ReactNode; badge?: string; children: ReactNode }) {
  const { user } = useAuth();
  return (
    <main className="app">
      <header className="header">
        <h1 className="header__title">
          <a href="/">Trackle</a>
          {badge && <span className="lab-badge">{badge}</span>}
        </h1>
        <HowToPlay />
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
    </main>
  );
}
