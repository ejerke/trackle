import { fileURLToPath } from "node:url";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type AppOptions } from "../app.ts";
import { openDatabase, type Db } from "../db/connection.ts";
import { loadMigrations, migrate } from "../db/migrate.ts";
import { hashToken } from "./accounts.ts";
import { SESSION_COOKIE } from "./routes.ts";

const migrationsDir = fileURLToPath(new URL("../../migrations", import.meta.url));
let app: FastifyInstance;
let db: Db;
let now = new Date("2026-11-10T12:00:00Z");

async function setup(extra: Partial<AppOptions> = {}) {
  db = openDatabase(":memory:");
  migrate(db, loadMigrations(migrationsDir));
  app = await buildApp({ db, now: () => now, passwordParams: { N: 2 ** 10, r: 8, p: 1 }, ...extra });
}

afterEach(async () => {
  await app?.close();
  db?.close();
  now = new Date("2026-11-10T12:00:00Z");
});

/** The session token from a response's Set-Cookie, if any. */
function sessionFrom(res: LightMyRequestResponse): string | undefined {
  const header = [res.headers["set-cookie"]].flat().find((c) => c?.startsWith(`${SESSION_COOKIE}=`));
  return header?.split(";")[0]!.split("=")[1] || undefined;
}
const post = (url: string, payload: object, token?: string) =>
  app.inject({ method: "POST", url, payload, headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {} });
const me = async (token?: string) =>
  (await app.inject({ url: "/api/auth/me", headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {} })).json().user;

describe("accounts", () => {
  it("registers, signs in automatically, and knows who you are", async () => {
    await setup();
    const res = await post("/api/auth/register", { username: "Alice_1", password: "correct horse" });
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({ username: "Alice_1" });
    const cookie = [res.headers["set-cookie"]].flat()[0]!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure"); // only in production
    expect(await me(sessionFrom(res))).toMatchObject({ username: "Alice_1" });
    expect(await me()).toBeNull();
  });

  it("stores neither the password nor the session token in plain text", async () => {
    await setup();
    const res = await post("/api/auth/register", { username: "alice", password: "correct horse" });
    const token = sessionFrom(res)!;
    const dump = JSON.stringify([db.prepare("SELECT * FROM users").all(), db.prepare("SELECT * FROM sessions").all()]);
    expect(dump).not.toContain("correct horse");
    expect(dump).not.toContain(token);
    expect(dump).toContain(hashToken(token));
  });

  it("treats usernames case-insensitively but keeps the spelling", async () => {
    await setup();
    await post("/api/auth/register", { username: "Alice", password: "correct horse" });
    expect((await post("/api/auth/register", { username: "ALICE", password: "another one" })).json()).toEqual({
      error: "username_taken",
    });
    const login = await post("/api/auth/login", { username: "alice", password: "correct horse" });
    expect(login.json().user.username).toBe("Alice");
  });

  it("validates usernames and passwords", async () => {
    await setup();
    for (const username of ["ab", "has space", "x".repeat(21), "émile"]) {
      const res = await post("/api/auth/register", { username, password: "long enough" });
      expect(res.json(), username).toEqual({ error: "invalid_username" });
    }
    expect((await post("/api/auth/register", { username: "bob", password: "short" })).json()).toEqual({
      error: "invalid_password",
    });
    expect((await post("/api/auth/register", { username: "bob" })).json()).toEqual({ error: "invalid_body" });
    expect((await post("/api/auth/register", { username: "bob", password: "x".repeat(201) })).statusCode).toBe(400);
  });

  it("gives the same answer for an unknown user and a wrong password", async () => {
    await setup();
    await post("/api/auth/register", { username: "alice", password: "correct horse" });
    const wrongPassword = await post("/api/auth/login", { username: "alice", password: "wrong horse" });
    const noSuchUser = await post("/api/auth/login", { username: "mallory", password: "wrong horse" });
    expect(wrongPassword.statusCode).toBe(401);
    expect(noSuchUser.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(noSuchUser.json());
    expect(sessionFrom(wrongPassword)).toBeUndefined();
  });

  it("signs out: the session stops working and the cookie is cleared", async () => {
    await setup();
    const token = sessionFrom(await post("/api/auth/register", { username: "alice", password: "correct horse" }))!;
    const res = await post("/api/auth/logout", {}, token);
    expect(res.statusCode).toBe(204);
    expect([res.headers["set-cookie"]].flat()[0]).toContain("Max-Age=0");
    expect(await me(token)).toBeNull();
  });

  it("expires sessions after 30 days", async () => {
    await setup();
    const token = sessionFrom(await post("/api/auth/register", { username: "alice", password: "correct horse" }))!;
    now = new Date("2026-12-09T11:00:00Z"); // 29 days later
    expect(await me(token)).not.toBeNull();
    now = new Date("2026-12-10T12:00:01Z"); // 30 days later
    expect(await me(token)).toBeNull();
  });

  it("changes the password and signs out other devices", async () => {
    await setup();
    const phone = sessionFrom(await post("/api/auth/register", { username: "alice", password: "correct horse" }))!;
    const laptop = sessionFrom(await post("/api/auth/login", { username: "alice", password: "correct horse" }))!;

    expect((await post("/api/auth/password", { currentPassword: "wrong", newPassword: "new password" }, phone)).statusCode).toBe(401);
    const res = await post("/api/auth/password", { currentPassword: "correct horse", newPassword: "new password" }, phone);
    expect(res.statusCode).toBe(204);

    expect(await me(phone)).not.toBeNull(); // the device that changed it stays signed in
    expect(await me(laptop)).toBeNull();
    expect((await post("/api/auth/login", { username: "alice", password: "correct horse" })).statusCode).toBe(401);
    expect((await post("/api/auth/login", { username: "alice", password: "new password" })).statusCode).toBe(200);
  });

  it("deletes the account and everything attached to it, given the password", async () => {
    await setup();
    const token = sessionFrom(await post("/api/auth/register", { username: "alice", password: "correct horse" }))!;
    expect((await post("/api/auth/delete-account", { password: "nope" }, token)).statusCode).toBe(401);
    expect((await post("/api/auth/delete-account", { password: "correct horse" }, token)).statusCode).toBe(204);
    expect(await me(token)).toBeNull();
    expect(db.prepare("SELECT COUNT(*) FROM users").pluck().get()).toBe(0);
    expect(db.prepare("SELECT COUNT(*) FROM sessions").pluck().get()).toBe(0);
    // The name is free again.
    expect((await post("/api/auth/register", { username: "alice", password: "fresh start" })).statusCode).toBe(201);
  });

  it("requires a session for account changes", async () => {
    await setup();
    expect((await post("/api/auth/password", { currentPassword: "a", newPassword: "long enough" })).json()).toEqual({
      error: "unauthorized",
    });
    expect((await post("/api/auth/delete-account", { password: "x" })).statusCode).toBe(401);
    expect((await post("/api/auth/password", { currentPassword: "a", newPassword: "b" }, "made-up-token")).statusCode).toBe(401);
  });

  it("rate limits password guessing", async () => {
    await setup({ rateLimit: { policies: { auth: { capacity: 3, refillPerSecond: 0.01 } } } });
    await post("/api/auth/register", { username: "alice", password: "correct horse" }); // 1
    await post("/api/auth/login", { username: "alice", password: "guess one" }); // 2
    await post("/api/auth/login", { username: "alice", password: "guess two" }); // 3
    const res = await post("/api/auth/login", { username: "alice", password: "correct horse" });
    expect(res.statusCode).toBe(429);
  });

  it("marks the cookie Secure in production", async () => {
    await setup({ secureCookies: true });
    const res = await post("/api/auth/register", { username: "alice", password: "correct horse" });
    expect([res.headers["set-cookie"]].flat()[0]).toContain("Secure");
  });
});

describe("preferences", () => {
  const prefs = (body: object, token?: string) =>
    app.inject({ method: "PUT", url: "/api/auth/preferences", payload: body, headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {} });

  it("remembers the chosen difficulty on the account, for every device", async () => {
    await setup();
    const phone = sessionFrom(await post("/api/auth/register", { username: "alice", password: "correct horse" }))!;
    expect(await me(phone)).toMatchObject({ preferredDifficulty: null });

    expect((await prefs({ preferredDifficulty: 2 }, phone)).json().user.preferredDifficulty).toBe(2);
    const laptop = await post("/api/auth/login", { username: "alice", password: "correct horse" });
    expect(laptop.json().user.preferredDifficulty).toBe(2);
    expect(await me(sessionFrom(laptop))).toMatchObject({ preferredDifficulty: 2 });
  });

  it("rejects unknown difficulties and anonymous requests", async () => {
    await setup();
    const token = sessionFrom(await post("/api/auth/register", { username: "alice", password: "correct horse" }))!;
    expect((await prefs({ preferredDifficulty: 9 }, token)).json()).toEqual({ error: "invalid_difficulty" });
    expect((await prefs({ preferredDifficulty: "hard" }, token)).statusCode).toBe(400);
    expect((await prefs({ preferredDifficulty: 1 })).statusCode).toBe(401);
  });
});

describe("CSRF protection", () => {
  it("rejects API writes that aren't JSON (e.g. a cross-site form post)", async () => {
    await setup();
    const form = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "username=alice&password=correct+horse",
    });
    expect(form.statusCode).toBe(415);
    const textPlain = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { "content-type": "text/plain" },
      payload: "{}",
    });
    expect(textPlain.statusCode).toBe(415);
  });
});
