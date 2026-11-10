import type { AccountUser } from "@trackle/shared";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchMe } from "./api";

/**
 * Who is signed in, for any component that needs to know. The session itself
 * is an HttpOnly cookie, invisible to JavaScript; this only mirrors
 * GET /api/auth/me.
 */
interface AuthState {
  /** undefined while loading, null when signed out. */
  user: AccountUser | null | undefined;
  setUser(user: AccountUser | null): void;
}

const AuthContext = createContext<AuthState>({ user: undefined, setUser: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AccountUser | null | undefined>(undefined);
  const setUser = useCallback((u: AccountUser | null) => setUserState(u), []);

  useEffect(() => {
    fetchMe().then(
      (res) => setUserState(res.user),
      () => setUserState(null), // offline or server error: act signed out
    );
  }, []);

  return <AuthContext.Provider value={{ user, setUser }}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthState => useContext(AuthContext);
