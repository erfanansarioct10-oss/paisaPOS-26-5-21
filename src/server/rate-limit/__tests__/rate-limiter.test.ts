import { afterEach, describe, expect, test, vi } from "vitest";

describe("RateLimiter fail-closed behavior", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  test("fails closed by default in production when Upstash is unreachable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));

    const { RateLimiter } = await import("../rate-limiter");
    const result = await new RateLimiter(2, 60_000).check("login_ip:127.0.0.1");

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  test("honors explicit fail-open override for emergency rollback", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_LIMIT_FAIL_CLOSED", "false");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network unavailable");
    }));

    const { RateLimiter } = await import("../rate-limiter");
    const result = await new RateLimiter(2, 60_000).check("login_ip:127.0.0.1");

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(2);
  });
});
