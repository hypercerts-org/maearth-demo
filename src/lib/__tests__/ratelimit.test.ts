import { describe, it, expect } from "vitest";
import { checkRateLimit } from "../ratelimit";

describe("checkRateLimit", () => {
  it("allows requests within limit", async () => {
    const key = `test-allow-${Date.now()}`;
    const result = await checkRateLimit(key, 5, 60000);
    expect(result.allowed).toBe(true);
    expect(result.retryAfter).toBeUndefined();
  });

  it("blocks requests over limit", async () => {
    const key = `test-block-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(key, 3, 60000);
    }
    const result = await checkRateLimit(key, 3, 60000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("tracks limits per key independently", async () => {
    const key1 = `test-key1-${Date.now()}`;
    const key2 = `test-key2-${Date.now()}`;

    // Exhaust key1
    for (let i = 0; i < 2; i++) {
      await checkRateLimit(key1, 2, 60000);
    }
    expect((await checkRateLimit(key1, 2, 60000)).allowed).toBe(false);

    // key2 should still work
    expect((await checkRateLimit(key2, 2, 60000)).allowed).toBe(true);
  });

  it("returns retryAfter in seconds", async () => {
    const key = `test-retry-${Date.now()}`;
    await checkRateLimit(key, 1, 60000); // use the one token
    const result = await checkRateLimit(key, 1, 60000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(60); // 60000ms = 60s
  });
});
