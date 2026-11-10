/**
 * Token-bucket rate limiter, in memory.
 *
 * Every key (usually a client IP) has a bucket holding up to `capacity`
 * tokens. Each request takes `cost` tokens; tokens refill continuously at
 * `refillPerSecond`. So a client can burst up to `capacity` requests, then is
 * held to the refill rate. Buckets are created full.
 *
 * Memory is bounded: buckets are kept in least-recently-used order and the
 * oldest is dropped beyond `maxKeys`. A dropped bucket simply starts full
 * again, which only ever favours idle clients.
 *
 * In memory means per process: fine for our single server (ADR 0003). Several
 * processes would need a shared store (e.g. Redis).
 */
export interface RateLimitPolicy {
  /** Burst size: the most requests allowed at once. */
  capacity: number;
  /** Sustained rate: tokens regained per second. */
  refillPerSecond: number;
}

export interface Decision {
  allowed: boolean;
  /** Whole tokens left after this request. */
  remaining: number;
  /** When denied: seconds until enough tokens are back. 0 when allowed. */
  retryAfterSeconds: number;
}

interface Bucket {
  tokens: number;
  /** Seconds timestamp of the last refill calculation. */
  at: number;
}

export interface RateLimiterOptions {
  /** Injectable clock in milliseconds, for tests. */
  now?: () => number;
  maxKeys?: number;
}

export class RateLimiter {
  private readonly policy: RateLimitPolicy;
  private readonly now: () => number;
  private readonly maxKeys: number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(policy: RateLimitPolicy, options: RateLimiterOptions = {}) {
    if (policy.capacity <= 0 || policy.refillPerSecond <= 0) throw new Error("Invalid rate limit policy");
    this.policy = policy;
    this.now = options.now ?? Date.now;
    this.maxKeys = options.maxKeys ?? 50_000;
  }

  take(key: string, cost = 1): Decision {
    const { capacity, refillPerSecond } = this.policy;
    const t = this.now() / 1000;
    const existing = this.buckets.get(key);
    const bucket: Bucket = existing
      ? { tokens: Math.min(capacity, existing.tokens + (t - existing.at) * refillPerSecond), at: t }
      : { tokens: capacity, at: t };

    // Re-insert so the Map's iteration order is least-recently-used first.
    this.buckets.delete(key);
    this.buckets.set(key, bucket);
    if (this.buckets.size > this.maxKeys) this.buckets.delete(this.buckets.keys().next().value!);

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterSeconds: 0 };
    }
    return {
      allowed: false,
      remaining: Math.floor(bucket.tokens),
      retryAfterSeconds: Math.max(1, Math.ceil((cost - bucket.tokens) / refillPerSecond)),
    };
  }

  get size(): number {
    return this.buckets.size;
  }
}
