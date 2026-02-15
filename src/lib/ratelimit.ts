import { Redis } from "@upstash/redis";

// --- Redis client (optional, for persistent rate limiting in serverless) ---

let redis: Redis | null = null;
if (
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// --- In-memory fallback (for local dev / when Redis is not configured) ---

const buckets = new Map<string, { tokens: number; lastRefill: number }>();

const CLEANUP_INTERVAL_MS = 60 * 1000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup(windowMs: number) {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.lastRefill > windowMs * 2) buckets.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
  if (cleanupTimer.unref) cleanupTimer.unref();
}

function checkRateLimitMemory(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; retryAfter?: number } {
  ensureCleanup(windowMs);
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: maxRequests, lastRefill: now };
    buckets.set(key, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  const refill = Math.floor((elapsed / windowMs) * maxRequests);
  if (refill > 0) {
    bucket.tokens = Math.min(maxRequests, bucket.tokens + refill);
    bucket.lastRefill = now;
  }

  if (bucket.tokens > 0) {
    bucket.tokens--;
    return { allowed: true };
  }

  const retryAfter = Math.ceil(windowMs / 1000);
  return { allowed: false, retryAfter };
}

// --- Redis-based rate limiting (sliding window counter) ---

async function checkRateLimitRedis(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const windowSec = Math.ceil(windowMs / 1000);
  const redisKey = `rl:${key}`;

  const count = await redis!.incr(redisKey);
  if (count === 1) {
    await redis!.expire(redisKey, windowSec);
  }

  if (count <= maxRequests) {
    return { allowed: true };
  }

  const ttl = await redis!.ttl(redisKey);
  return { allowed: false, retryAfter: ttl > 0 ? ttl : windowSec };
}

// --- Public API ---

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  if (redis) {
    try {
      return await checkRateLimitRedis(key, maxRequests, windowMs);
    } catch (err) {
      console.warn("[ratelimit] Redis error, falling back to memory:", err);
    }
  }
  return checkRateLimitMemory(key, maxRequests, windowMs);
}

// --- Daily spending tracking ---

export async function getDailyTotal(did: string): Promise<number> {
  const today = new Date().toISOString().split("T")[0]!;
  const key = `daily:${did}:${today}`;

  if (redis) {
    try {
      const val = await redis.get<string>(key);
      return val ? parseFloat(val) : 0;
    } catch {
      return 0;
    }
  }

  // In-memory fallback
  const entry = dailyTotalsMemory.get(did);
  if (!entry || entry.date !== today) return 0;
  return entry.total;
}

export async function addDailyTotal(
  did: string,
  amount: number,
): Promise<void> {
  const today = new Date().toISOString().split("T")[0]!;
  const key = `daily:${did}:${today}`;

  if (redis) {
    try {
      const current = await redis.get<string>(key);
      const newTotal = (current ? parseFloat(current) : 0) + amount;
      await redis.set(key, newTotal.toString(), { ex: 86400 });
      return;
    } catch {
      /* fall through to memory */
    }
  }

  // In-memory fallback
  const entry = dailyTotalsMemory.get(did);
  if (!entry || entry.date !== today) {
    dailyTotalsMemory.set(did, { total: amount, date: today });
  } else {
    entry.total += amount;
  }
}

const dailyTotalsMemory = new Map<string, { total: number; date: string }>();
