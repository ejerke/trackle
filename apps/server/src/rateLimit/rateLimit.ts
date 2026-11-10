import type { ApiError } from "@trackle/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { clientIp } from "./clientIp.ts";
import { RateLimiter, type RateLimitPolicy } from "./tokenBucket.ts";

/**
 * Rate-limiting middleware for the API. Two layers:
 *
 *  - `api`: every /api/* request, per client. Generous; stops floods.
 *  - `generation`: charged only when a request makes the server *generate* a
 *    puzzle (a random-puzzle cache miss, ~0.1-0.6 s of CPU each). Strict, per
 *    client, plus one bucket shared by all clients (`generationGlobal`) that
 *    caps total CPU even if an attacker spreads requests over many IPs.
 *
 * Denied requests get 429 { error: "rate_limited" } with a Retry-After header.
 */
export interface RateLimitPolicies {
  api: RateLimitPolicy;
  generation: RateLimitPolicy;
  generationGlobal: RateLimitPolicy;
}

export const DEFAULT_POLICIES: RateLimitPolicies = {
  // Bursts of 120, then 2 requests/s. A person never gets near this.
  api: { capacity: 120, refillPerSecond: 2 },
  // 10 new random puzzles at once, then one every 6 s (10/min).
  generation: { capacity: 10, refillPerSecond: 1 / 6 },
  // All clients together: at most ~2 generations/s sustained (~20-60% of a core).
  generationGlobal: { capacity: 30, refillPerSecond: 2 },
};

export interface RateLimitOptions {
  policies?: Partial<RateLimitPolicies>;
  /** Header holding the real client IP when behind our proxy, e.g. "cf-connecting-ip". */
  clientIpHeader?: string;
  now?: () => number;
}

export interface RateLimits {
  /**
   * Charge one puzzle generation to this request's client (and the global
   * budget). Returns true if allowed; otherwise it has already sent the 429.
   */
  allowGeneration(req: FastifyRequest, reply: FastifyReply): boolean;
}

const tooMany: ApiError = { error: "rate_limited" };

function deny(reply: FastifyReply, retryAfterSeconds: number): FastifyReply {
  return reply.code(429).header("Retry-After", String(retryAfterSeconds)).send(tooMany);
}

/** Install the `api` limit as an onRequest hook and return the generation limiter. */
export function registerRateLimits(app: FastifyInstance, options: RateLimitOptions = {}): RateLimits {
  const policies = { ...DEFAULT_POLICIES, ...options.policies };
  const clock = { now: options.now };
  const api = new RateLimiter(policies.api, clock);
  const generation = new RateLimiter(policies.generation, clock);
  const generationGlobal = new RateLimiter(policies.generationGlobal, clock);
  const keyOf = (req: FastifyRequest) => clientIp(req.socket.remoteAddress, req.headers, options.clientIpHeader);

  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return; // static files are cheap (and cached by Cloudflare)
    const decision = api.take(keyOf(req));
    if (!decision.allowed) {
      req.log.warn({ client: keyOf(req), limit: "api" }, "Rate limited");
      return deny(reply, decision.retryAfterSeconds);
    }
  });

  return {
    allowGeneration(req, reply) {
      const client = keyOf(req);
      const own = generation.take(client);
      if (!own.allowed) {
        req.log.warn({ client, limit: "generation" }, "Rate limited");
        deny(reply, own.retryAfterSeconds);
        return false;
      }
      const global = generationGlobal.take("*");
      if (!global.allowed) {
        req.log.warn({ client, limit: "generationGlobal" }, "Rate limited (global generation budget)");
        deny(reply, global.retryAfterSeconds);
        return false;
      }
      return true;
    },
  };
}
