import { useState } from "react";
import { ArchivePage } from "./components/ArchivePage";
import { DailyPage } from "./components/DailyPage";
import { Lab } from "./components/Lab";
import { Page } from "./components/Page";
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
