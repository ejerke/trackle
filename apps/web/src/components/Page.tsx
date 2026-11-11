import type { ReactNode } from "react";
import { HowToPlay } from "./HowToPlay";
import { SiteMenu } from "./SiteMenu";

/**
 * Common page frame: one compact header row (title and subtitle on the left,
 * how-to-play and the site menu on the right), then the content. Kept short
 * so the board gets as much of a phone screen as possible.
 */
export function Page({ subtitle, badge, children }: { subtitle?: ReactNode; badge?: string; children: ReactNode }) {
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
          <HowToPlay />
          <SiteMenu />
        </div>
      </header>
      {children}
    </main>
  );
}
