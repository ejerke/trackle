import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  isValidPassword,
  isValidUsername,
  type ApiErrorCode,
} from "@trackle/shared";
import { useState, type FormEvent, type ReactNode } from "react";
import { ApiRequestError, changePassword, deleteAccount, login, logout, register } from "../api";
import { useAuth } from "../auth";
import { Page } from "./Page";

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

export function AccountPage() {
  const { user } = useAuth();
  return (
    <Page subtitle="Account">
      {user === undefined && <p className="status">Loading…</p>}
      {user === null && <SignIn />}
      {user && <SignedIn username={user.username} createdAt={user.createdAt} />}
    </Page>
  );
}

// ---- signed out ----

function SignIn() {
  const { setUser } = useAuth();
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
      setUser(res.user);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="account">
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
            There's no email, so a forgotten password <b>can't be reset</b>. Use a password manager.
          </p>
        )}
        {error && <p className="form__error" role="alert">{error}</p>}
        <button className="button button--primary" type="submit" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </section>
  );
}

// ---- signed in ----

function SignedIn({ username, createdAt }: { username: string; createdAt: string }) {
  const { setUser } = useAuth();
  const since = new Date(createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  return (
    <section className="account">
      <p className="account__who">
        Signed in as <b>{username}</b> · member since {since}
      </p>
      <p className="notice">
        Accounts don't sync your progress yet; streaks and stats still live in this browser.
      </p>
      <button
        type="button"
        className="button"
        onClick={async () => {
          await logout().catch(() => {});
          setUser(null);
        }}
      >
        Sign out
      </button>
      <ChangePassword />
      <DeleteAccount />
    </section>
  );
}

function ChangePassword() {
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
      setResult({ ok: true, text: "Password changed. Other devices have been signed out." });
    } catch (err) {
      setResult({ ok: false, text: messageFor(err) });
    }
  };

  return (
    <form className="form form--section" onSubmit={onSubmit}>
      <h2>Change password</h2>
      <Field label="Current password">
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </Field>
      <Field label="New password">
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
      </Field>
      {result && (
        <p className={result.ok ? "form__ok" : "form__error"} role="status">
          {result.text}
        </p>
      )}
      <button className="button" type="submit">
        Change password
      </button>
    </form>
  );
}

function DeleteAccount() {
  const { setUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="form--section">
        <button type="button" className="button button--danger" onClick={() => setOpen(true)}>
          Delete account…
        </button>
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await deleteAccount({ password });
      setUser(null);
    } catch (err) {
      setError(messageFor(err));
    }
  };

  return (
    <form className="form form--section" onSubmit={onSubmit}>
      <h2>Delete account</h2>
      <p className="form__hint">This permanently deletes your account. Progress in this browser stays.</p>
      <Field label="Password">
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
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
