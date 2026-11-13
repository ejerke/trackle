import { createHash, randomBytes } from "node:crypto";
import type { AccountUser } from "@trackle/shared";
import type { Db } from "../db/connection.ts";

/** All SQL for users and sessions. Tokens are only ever stored hashed. */

export const SESSION_DAYS = 30;

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
  preferred_difficulty: number | null;
  on_leaderboard: number;
}

export interface StoredUser {
  user: AccountUser;
  passwordHash: string;
}

const toUser = (row: UserRow): StoredUser => ({
  user: {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
    preferredDifficulty: row.preferred_difficulty,
    onLeaderboard: row.on_leaderboard === 1,
  },
  passwordHash: row.password_hash,
});

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export class Accounts {
  private readonly db: Db;
  private readonly now: () => Date;

  constructor(db: Db, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  /** Null if the username is taken (case-insensitively). */
  createUser(username: string, passwordHash: string): StoredUser | null {
    const row = this.db
      .prepare(
        `INSERT INTO users (username, password_hash) VALUES (?, ?)
         ON CONFLICT (username) DO NOTHING
         RETURNING id, username, password_hash, created_at, preferred_difficulty, on_leaderboard`,
      )
      .get(username, passwordHash) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  findByUsername(username: string): StoredUser | null {
    const row = this.db
      .prepare("SELECT id, username, password_hash, created_at, preferred_difficulty, on_leaderboard FROM users WHERE username = ?")
      .get(username) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  findById(id: number): StoredUser | null {
    const row = this.db
      .prepare("SELECT id, username, password_hash, created_at, preferred_difficulty, on_leaderboard FROM users WHERE id = ?")
      .get(id) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  setPassword(userId: number, passwordHash: string): void {
    this.db
      .prepare("UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?")
      .run(passwordHash, this.now().toISOString(), userId);
  }

  setPreferredDifficulty(userId: number, difficulty: number): void {
    this.db.prepare("UPDATE users SET preferred_difficulty = ? WHERE id = ?").run(difficulty, userId);
  }

  setOnLeaderboard(userId: number, visible: boolean): void {
    this.db.prepare("UPDATE users SET on_leaderboard = ? WHERE id = ?").run(visible ? 1 : 0, userId);
  }

  /** Deletes the user; their sessions go with them (ON DELETE CASCADE). */
  deleteUser(userId: number): void {
    this.db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  }

  // ---- sessions ----

  /** Returns the raw token for the cookie. Only its hash is stored. */
  createSession(userId: number): string {
    const token = randomBytes(32).toString("base64url");
    const now = this.now();
    const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
    this.db
      .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(hashToken(token), userId, now.toISOString(), expires.toISOString());
    // Housekeeping: drop expired sessions now and then (cheap with few rows).
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now.toISOString());
    return token;
  }

  /** The signed-in user for a cookie token, or null if unknown/expired. */
  userForToken(token: string): AccountUser | null {
    const row = this.db
      .prepare(
        `SELECT u.id, u.username, u.password_hash, u.created_at, u.preferred_difficulty, u.on_leaderboard
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(hashToken(token), this.now().toISOString()) as UserRow | undefined;
    return row ? toUser(row).user : null;
  }

  deleteSession(token: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  }

  /** Sign out everywhere except (optionally) the current session. */
  deleteOtherSessions(userId: number, keepToken?: string): void {
    this.db
      .prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?")
      .run(userId, keepToken ? hashToken(keepToken) : "");
  }
}
