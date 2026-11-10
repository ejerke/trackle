import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthProvider } from "./auth";
import { createProgressStore } from "./storage/localProgressStore";
import "./styles.css";

// The one place that decides where progress is stored (see docs/client-storage.md).
const store = createProgressStore();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App store={store} />
    </AuthProvider>
  </StrictMode>,
);
