import { useState } from "react";
import { AccountPage } from "./components/AccountPage";
import { ArchivePage } from "./components/ArchivePage";
import { BookmarksPage } from "./components/BookmarksPage";
import { DailyPage } from "./components/DailyPage";
import { Lab } from "./components/Lab";
import { LeaderboardPage } from "./components/LeaderboardPage";
import { Page } from "./components/Page";
import { PrivacyPage } from "./components/PrivacyPage";
import { RandomPage } from "./components/RandomPage";
import { StatsPage } from "./components/StatsPage";
import { parseRoute } from "./routes";
import type { ProgressStore } from "./storage/progressStore";

export function App({ store }: { store: ProgressStore }) {
  const [route] = useState(() => parseRoute(window.location.pathname, window.location.search));

  switch (route.kind) {
    case "daily":
      return <DailyPage date={route.date} difficulty={route.difficulty} store={store} />;
    case "random":
      return <RandomPage difficulty={route.difficulty} seed={route.seed} store={store} />;
    case "archive":
      return <ArchivePage difficulty={route.difficulty} store={store} />;
    case "stats":
      return <StatsPage store={store} />;
    case "bookmarks":
      return <BookmarksPage store={store} />;
    case "leaderboard":
      return <LeaderboardPage store={store} />;
    case "privacy":
      return <PrivacyPage />;
    case "account":
      return <AccountPage />;
    case "lab":
      return <Lab difficulty={route.difficulty} seed={route.seed} />;
    case "unknown":
      return (
        <Page>
          <div className="status">
            <p>There's no track here.</p>
            <a className="button button--primary" href="/">
              Play today's track
            </a>
          </div>
        </Page>
      );
  }
}
