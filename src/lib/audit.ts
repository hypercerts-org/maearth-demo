import { Redis } from "@upstash/redis";
import { sanitizeForLog } from "./validation";

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

export interface TransactionLog {
  did: string;
  to: string;
  amount: number;
  status: "success" | "failed";
  txHash?: string;
  userOpHash?: string;
  error?: string;
  ip: string;
}

export async function logTransaction(entry: TransactionLog): Promise<void> {
  const record = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  // Always emit structured console log (captured by Vercel log drain)
  console.log(
    JSON.stringify({
      event: "transaction",
      did: sanitizeForLog(entry.did),
      to: entry.to,
      amount: entry.amount,
      status: entry.status,
      txHash: entry.txHash,
      error: entry.error,
      timestamp: record.timestamp,
    }),
  );

  // Persist to Redis if available (append to list, keep last 1000 per DID)
  if (redis) {
    try {
      const key = `audit:tx:${entry.did}`;
      await redis.lpush(key, JSON.stringify(record));
      await redis.ltrim(key, 0, 999);
      // Also append to global audit log
      await redis.lpush("audit:tx:all", JSON.stringify(record));
      await redis.ltrim("audit:tx:all", 0, 9999);
    } catch (err) {
      console.warn("[audit] Redis write failed:", err);
    }
  }
}
