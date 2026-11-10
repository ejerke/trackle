import {
  isValidPassword,
  isValidUsername,
  PASSWORD_MAX_LENGTH,
  type AccountUser,
  type ApiError,
  type AuthResponse,
  type ChangePasswordRequest,
  type Credentials,
  type DeleteAccountRequest,
} from "@trackle/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "../db/connection.ts";
import type { RateLimits } from "../rateLimit/rateLimit.ts";
import { Accounts, SESSION_DAYS } from "./accounts.ts";
import { parseCookies, serializeCookie } from "./cookies.ts";
import { DEFAULT_PARAMS, hashPassword, verifyPassword, type ScryptParams } from "./password.ts";

export const SESSION_COOKIE = "trackle_session";

export interface AuthOptions {
  db: Db;
  now: () => Date;
  limits: RateLimits;
  /** Set the cookie's Secure flag (HTTPS only). True in production. */
  secureCookies: boolean;
  /** Lower in tests to keep them fast. */
  passwordParams?: ScryptParams;
}

const error = (code: ApiError["error"]): ApiError => ({ error: code });

// Bodies are validated by Fastify before handlers run. maxLength keeps
// attackers from making us hash megabytes; the real rules are checked in code
// so the client gets specific error codes.
const text = (max: number) => ({ type: "string", maxLength: max }) as const;
const credentialsSchema = {
  type: "object",
  required: ["username", "password"],
  additionalProperties: false,
  properties: { username: text(64), password: text(PASSWORD_MAX_LENGTH) },
} as const;
const changePasswordSchema = {
  type: "object",
  required: ["currentPassword", "newPassword"],
  additionalProperties: false,
  properties: { currentPassword: text(PASSWORD_MAX_LENGTH), newPassword: text(PASSWORD_MAX_LENGTH) },
} as const;
const passwordOnlySchema = {
  type: "object",
  required: ["password"],
  additionalProperties: false,
  properties: { password: text(PASSWORD_MAX_LENGTH) },
} as const;

/**
 * Username + password accounts with cookie sessions (ADR 0012):
 *   POST /api/auth/register, /login, /logout, /password, /delete-account
 *   GET  /api/auth/me
 */
export function registerAuthRoutes(
  app: FastifyInstance,
  options: AuthOptions,
): { currentUser: (req: FastifyRequest) => AccountUser | null } {
  const accounts = new Accounts(options.db, options.now);
  const params = options.passwordParams ?? DEFAULT_PARAMS;
  // Verifying against this when a username doesn't exist makes "no such user"
  // take as long as "wrong password", so timing doesn't reveal which it was.
  const dummyHash = hashPassword("not-a-real-password", params);

  const tokenOf = (req: FastifyRequest): string | undefined => parseCookies(req.headers.cookie)[SESSION_COOKIE];
  const currentUser = (req: FastifyRequest): AccountUser | null => {
    const token = tokenOf(req);
    return token ? accounts.userForToken(token) : null;
  };
  const startSession = (reply: FastifyReply, userId: number) => {
    const token = accounts.createSession(userId);
    reply.header("Set-Cookie", serializeCookie(SESSION_COOKIE, token, {
      maxAgeSeconds: SESSION_DAYS * 86_400,
      secure: options.secureCookies,
    }));
  };
  const clearSession = (reply: FastifyReply) => {
    reply.header("Set-Cookie", serializeCookie(SESSION_COOKIE, "", { maxAgeSeconds: 0, secure: options.secureCookies }));
  };

  app.get("/api/auth/me", async (req) => {
    const body: AuthResponse = { user: currentUser(req) };
    return body;
  });

  app.post<{ Body: Credentials }>("/api/auth/register", { schema: { body: credentialsSchema } }, async (req, reply) => {
    const { username, password } = req.body;
    if (!isValidUsername(username)) return reply.code(400).send(error("invalid_username"));
    if (!isValidPassword(password)) return reply.code(400).send(error("invalid_password"));
    if (!options.limits.allowAuthAttempt(req, reply)) return reply;

    const created = accounts.createUser(username, await hashPassword(password, params));
    if (!created) return reply.code(409).send(error("username_taken"));
    startSession(reply, created.user.id);
    req.log.info({ userId: created.user.id }, "Account created");
    const body: AuthResponse = { user: created.user };
    return reply.code(201).send(body);
  });

  app.post<{ Body: Credentials }>("/api/auth/login", { schema: { body: credentialsSchema } }, async (req, reply) => {
    if (!options.limits.allowAuthAttempt(req, reply)) return reply;
    const found = accounts.findByUsername(req.body.username);
    const ok = await verifyPassword(req.body.password, found?.passwordHash ?? (await dummyHash));
    // One generic answer: don't reveal whether the username exists.
    if (!found || !ok) return reply.code(401).send(error("invalid_credentials"));
    startSession(reply, found.user.id);
    const body: AuthResponse = { user: found.user };
    return body;
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const token = tokenOf(req);
    if (token) accounts.deleteSession(token);
    clearSession(reply);
    return reply.code(204).send();
  });

  app.post<{ Body: ChangePasswordRequest }>(
    "/api/auth/password",
    { schema: { body: changePasswordSchema } },
    async (req, reply) => {
      const user = currentUser(req);
      if (!user) return reply.code(401).send(error("unauthorized"));
      if (!isValidPassword(req.body.newPassword)) return reply.code(400).send(error("invalid_password"));
      if (!options.limits.allowAuthAttempt(req, reply)) return reply;
      const stored = accounts.findById(user.id)!;
      if (!(await verifyPassword(req.body.currentPassword, stored.passwordHash))) {
        return reply.code(401).send(error("invalid_credentials"));
      }
      accounts.setPassword(user.id, await hashPassword(req.body.newPassword, params));
      // A changed password should lock out anyone else who had a session.
      accounts.deleteOtherSessions(user.id, tokenOf(req));
      return reply.code(204).send();
    },
  );

  app.post<{ Body: DeleteAccountRequest }>(
    "/api/auth/delete-account",
    { schema: { body: passwordOnlySchema } },
    async (req, reply) => {
      const user = currentUser(req);
      if (!user) return reply.code(401).send(error("unauthorized"));
      if (!options.limits.allowAuthAttempt(req, reply)) return reply;
      const stored = accounts.findById(user.id)!;
      if (!(await verifyPassword(req.body.password, stored.passwordHash))) {
        return reply.code(401).send(error("invalid_credentials"));
      }
      accounts.deleteUser(user.id);
      clearSession(reply);
      req.log.info({ userId: user.id }, "Account deleted");
      return reply.code(204).send();
    },
  );

  return { currentUser };
}
