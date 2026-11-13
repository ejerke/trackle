import type { ReactNode } from "react";
import type { ProgressStore } from "../storage/progressStore";
import { HowToPlay } from "./HowToPlay";
import { HeaderStreak } from "./StreakNote";
import { SiteMenu } from "./SiteMenu";

/**
 * Common page frame: one compact header row (title and subtitle on the left,
 * the streak, how-to-play and the site menu on the right), then the content. Kept short
 * so the board gets as much of a phone screen as possible.
 */
interface PageProps {
  subtitle?: ReactNode;
  badge?: string;
  /** Where progress lives; shows the streak in the header. Omitted (the lab): no streak. */
  store?: ProgressStore;
  children: ReactNode;
}

export function Page({ subtitle, badge, store, children }: PageProps) {
  return (
    <main className="app">
      <header className="header">
        <div className="header__brand">
          <h1 className="header__title">
            <a href="/">Trackle</a>
            {badge && <span className="lab-badge">{badge}</span>}
          </h1>
          {subtitle && <p className="header__date">{subtitle}</p>}
        </div>
        <div className="header__actions">
          {store && <HeaderStreak store={store} />}
          <HowToPlay />
          <SiteMenu />
        </div>
      </header>
      {children}
    </main>
  );
}
