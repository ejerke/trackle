import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  isValidPassword,
  isValidUsername,
  type AccountUser,
  type ApiErrorCode,
} from "@trackle/shared";
import { useState, type FormEvent, type ReactNode } from "react";
import { ApiRequestError, changePassword, deleteAccount, login, register, setLeaderboardVisibility } from "../api";
import { useAuth } from "../auth";
import type { ProgressStore } from "../storage/progressStore";
import { Page } from "./Page";
import { Switch } from "./Switch";

const MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  invalid_username: "Usernames are 3–20 letters, digits or underscores.",
  invalid_password: `Passwords need ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters.`,
  username_taken: "That username is taken.",
  invalid_credentials: "Wrong username or password.",
  unauthorized: "You've been signed out. Sign in again.",
  rate_limited: "Too many attempts. Wait a minute and try again.",
};

function messageFor(err: unknown): string {
  if (err instanceof ApiRequestError && err.code && MESSAGES[err.code]) return MESSAGES[err.code]!;
  return "Something went wrong. Try again.";
}

export function AccountPage({ store }: { store: ProgressStore }) {
  const { user } = useAuth();
  return (
    <Page subtitle="Account" store={store}>
      {user === null && <SignIn />}
      {user && <SignedIn user={user} />}
    </Page>
  );
}

// ---- signed out ----

function SignIn() {
  const { signedIn } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === "register" && !isValidUsername(username)) return setError(MESSAGES.invalid_username!);
    if (mode === "register" && !isValidPassword(password)) return setError(MESSAGES.invalid_password!);
    setBusy(true);
    setError(null);
    try {
      const res = await (mode === "login" ? login : register)({ username, password });
      await signedIn(res.user!);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account">
      <section className="account-card">
        <h2>Do you need one?</h2>
        <p className="account-card__text">
          No: everything works without an account, and your progress is kept in this browser. An account adds two
          things:
        </p>
        <ul className="account-list">
          <li>
            <b>The same progress on every device.</b> Solves, streaks, stats and bookmarks follow you.
          </li>
          <li>
            <b>Points on the leaderboard</b> for each Challenge you solve on its day.
          </li>
        </ul>
        <p className="account-card__text">
          It's just a username and a password, no email. What you've already played here comes along when you
          create one.
        </p>
      </section>

      <section className="account-card">
        <div className="segmented account__tabs" role="tablist">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              className="segmented__option"
              aria-selected={mode === m}
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
            >
              {m === "login" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
        <form className="form" onSubmit={onSubmit}>
          <Field label="Username">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={20}
              required
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              maxLength={PASSWORD_MAX_LENGTH}
              required
            />
          </Field>
          {mode === "register" && (
            <p className="form__hint">
              3–20 letters, digits or underscores; a password of at least {PASSWORD_MIN_LENGTH} characters. With no
              email, a forgotten password <b>can't be reset</b>, so use a password manager. What's stored:{" "}
              <a href="/privacy">privacy</a>.
            </p>
          )}
          {error && <p className="form__error" role="alert">{error}</p>}
          <button className="button button--primary" type="submit" disabled={busy}>
            {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </section>
    </div>
  );
}

// ---- signed in ----

function SignedIn({ user }: { user: AccountUser }) {
  const { signOut } = useAuth();
  const since = new Date(user.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="account">
      <section className="account-card account-who">
        <span className="account-who__avatar" aria-hidden="true">
          {user.username.slice(0, 1).toUpperCase()}
        </span>
        <div className="account-who__name">
          <b>{user.username}</b>
          <span>Member since {since}</span>
        </div>
        <button type="button" className="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </section>

      <LeaderboardChoice user={user} />
      <ChangePassword />
      <DeleteAccount />
    </div>
  );
}

function LeaderboardChoice({ user }: { user: AccountUser }) {
  const { userChanged } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const toggle = async (visible: boolean) => {
    setBusy(true);
    setError(false);
    try {
      const res = await setLeaderboardVisibility(visible);
      if (res.user) userChanged(res.user);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="account-card">
      <h2>Leaderboard</h2>
      <p className="account-card__text">
        Challenges you solve on their day earn points either way. This only decides whether other players see your
        name: when it's off, only you see your points. <a href="/leaderboard">See the leaderboard</a>.
      </p>
      <Switch checked={user.onLeaderboard} disabled={busy} onChange={(on) => void toggle(on)}>
        Show <b>{user.username}</b> on the leaderboard
      </Switch>
      {error && <p className="form__error">Couldn't change that. Try again.</p>}
    </section>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidPassword(next)) return setResult({ ok: false, text: MESSAGES.invalid_password! });
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setOpen(false);
      setResult({ ok: true, text: "Password changed. Other devices have been signed out." });
    } catch (err) {
      setResult({ ok: false, text: messageFor(err) });
    }
  };

  return (
    <section className="account-card">
      <h2>Password</h2>
      {!open ? (
        <>
          <p className="account-card__text">Changing it signs you out everywhere else.</p>
          {result && (
            <p className={result.ok ? "form__ok" : "form__error"} role="status">
              {result.text}
            </p>
          )}
          <button
            type="button"
            className="button"
            onClick={() => {
              setOpen(true);
              setResult(null);
            }}
          >
            Change password…
          </button>
        </>
      ) : (
        <form className="form" onSubmit={onSubmit}>
          <Field label="Current password">
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required autoFocus />
          </Field>
          <Field label="New password">
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
          </Field>
          {result && (
            <p className={result.ok ? "form__ok" : "form__error"} role="status">
              {result.text}
            </p>
          )}
          <div className="form__row">
            <button type="button" className="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="button button--primary" type="submit">
              Change password
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function DeleteAccount() {
  const { accountDeleted } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await deleteAccount({ password });
      accountDeleted();
    } catch (err) {
      setError(messageFor(err));
    }
  };

  return (
    <section className="account-card account-card--danger">
      <h2>Delete account</h2>
      <p className="account-card__text">
        Permanently deletes your account, the progress saved in it and your points. The copy in this browser stays.
      </p>
      {!open ? (
        <button type="button" className="button button--danger" onClick={() => setOpen(true)}>
          Delete account…
        </button>
      ) : (
        <form className="form" onSubmit={onSubmit}>
          <Field label="Your password, to confirm">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required autoFocus />
          </Field>
          {error && <p className="form__error" role="alert">{error}</p>}
          <div className="form__row">
            <button type="button" className="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="button button--danger">
              Delete forever
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="form__field">
      <span>{label}</span>
      {children}
    </label>
  );
}
