import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthProvider } from "./auth";
import { deleteProgress, fetchProgress, saveProgressBoard, syncProgress } from "./api";
import { createBrowserStorage, LocalProgressStore } from "./storage/localProgressStore";
import { SyncedProgressStore } from "./storage/syncedProgressStore";
import "./styles.css";

// The one place that decides where progress is stored (docs/client-storage.md):
// always in this browser; while signed in, solves sync to the account and
// boards go there when the player presses Save.
const storage = createBrowserStorage();
const store = new SyncedProgressStore(
  new LocalProgressStore(storage),
  { list: fetchProgress, sync: syncProgress, save: saveProgressBoard, delete: deleteProgress },
  storage,
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider store={store}>
      <App store={store} />
    </AuthProvider>
  </StrictMode>,
);
