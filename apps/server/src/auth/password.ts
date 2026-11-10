import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing with scrypt (built into Node, memory-hard, so GPU guessing
 * is expensive). Stored as "scrypt$N$r$p$salt$hash" so parameters can be raised
 * later without breaking old hashes: each hash carries its own.
 *
 * node:crypto's async scrypt runs on libuv's thread pool, so hashing (~50 ms)
 * doesn't block other requests.
 */
export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/**
 * OWASP's recommended minimum for scrypt: N=2^17, r=8, p=1. Each hash uses
 * 128 MiB of memory and some hundreds of milliseconds, which is what makes
 * guessing expensive. The auth rate limit keeps concurrent hashes few.
 * Tests pass cheaper parameters to stay fast.
 */
export const DEFAULT_PARAMS: ScryptParams = { N: 2 ** 17, r: 8, p: 1 };

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  const options: ScryptOptions = { ...params, maxmem: 256 * params.N * params.r };
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string, params: ScryptParams = DEFAULT_PARAMS): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, params);
  return ["scrypt", params.N, params.r, params.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/** Constant-time comparison; false for malformed hashes rather than throwing. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, salt, hash] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hash, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), { N: Number(N), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
