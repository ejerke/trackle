import type { AccountUser } from "@trackle/shared";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { fetchMe, logout } from "./api";
import { syncDifficultyWithAccount } from "./storage/preferences";
import type { SyncedProgressStore } from "./storage/syncedProgressStore";

/**
 * Who is signed in, and the sign-in/out transitions that also switch progress
 * sync on and off (ADR 0013). The session itself is an HttpOnly cookie,
 * invisible to JavaScript; this mirrors GET /api/auth/me.
 */
interface AuthState {
  /** null when signed out. */
  user: AccountUser | null;
  /** After a successful login/register: merge this browser's progress with the account's. */
  signedIn(user: AccountUser): Promise<void>;
  /** Send pending progress, end the session, remove the account's progress from this browser. */
  signOut(): Promise<void>;
  /** The account was deleted: stop syncing, keep the browser's copy. */
  accountDeleted(): void;
  /** The server returned a changed account (e.g. leaderboard visibility). */
  userChanged(user: AccountUser): void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ store, children }: { store: SyncedProgressStore; children: ReactNode }) {
  // undefined until we know who's signed in *and* their progress is synced, so
  // no page ever renders with stale progress.
  const [user, setUser] = useState<AccountUser | null | undefined>(undefined);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    void (async () => {
      const me = await fetchMe().then((res) => res.user, () => null); // offline/server error: act signed out
      if (me) {
        syncDifficultyWithAccount(me.preferredDifficulty);
        await store.signIn(me.id).catch((err) => console.warn("Progress sync failed", err));
      }
      setUser(me);
    })();
  }, [store]);

  if (user === undefined) return <p className="status">Loading…</p>;
  if (signingOut) return <p className="status">Signing out…</p>;

  const state: AuthState = {
    user,
    async signedIn(u) {
      syncDifficultyWithAccount(u.preferredDifficulty);
      await store.signIn(u.id).catch((err) => console.warn("Progress sync failed", err));
      setUser(u);
    },
    async signOut() {
      // Take the page down first: an open puzzle saves itself as it unmounts,
      // and that save must land *before* this browser's copy is cleared, or
      // the account's progress would be left behind as anonymous progress
      // (and imported into whoever signs in next).
      flushSync(() => setSigningOut(true));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await store.flush().catch(() => {});
      await logout().catch(() => {});
      await store.signOut();
      setUser(null);
      setSigningOut(false);
    },
    accountDeleted() {
      store.forgetAccount();
      setUser(null);
    },
    userChanged(u) {
      setUser(u);
    },
  };
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) throw new Error("useAuth outside AuthProvider");
  return state;
}
