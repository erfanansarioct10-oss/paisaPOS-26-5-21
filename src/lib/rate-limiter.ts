/**
 * PaisaPOS Rate Limiter — Multi-tier abuse protection
 *
 * Provides sliding-window rate limiting with two backends:
 *   1. In-memory Map (default, zero-dependency, local/single-instance)
 *   2. Upstash Redis (production, distributed across Vercel Edge workers)
 *
 * Backend is auto-selected based on environment variables:
 *   - If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN → Upstash
 *   - Otherwise → in-memory fallback
 */

import { headers } from "next/headers";
import { getTrustedClientIp } from "./network";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  /** Whether the request is allowed */
  success: boolean;
  /** Remaining requests in the current window */
  remaining: number;
  /** Unix ms timestamp when the window resets */
  resetAt: number;
}

interface SlidingWindowEntry {
  /** Timestamps of requests within the current window */
  timestamps: number[];
}

// ---------------------------------------------------------------------------
// In-Memory Sliding Window Rate Limiter
// ---------------------------------------------------------------------------

class InMemoryRateLimiter {
  private store = new Map<string, SlidingWindowEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Auto-cleanup expired entries every 60 seconds to prevent memory leaks
    if (typeof setInterval !== "undefined") {
      this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
      // Allow the process to exit even if this timer is still running
      if (this.cleanupTimer && typeof this.cleanupTimer === "object" && "unref" in this.cleanupTimer) {
        (this.cleanupTimer as NodeJS.Timeout).unref();
      }
    }
  }

  check(identifier: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const resetAt = now + this.windowMs;

    let entry = this.store.get(identifier);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(identifier, entry);
    }

    // Remove timestamps outside the current sliding window
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    if (entry.timestamps.length >= this.maxRequests) {
      // Rate limited
      const oldestInWindow = entry.timestamps[0];
      return {
        success: false,
        remaining: 0,
        resetAt: oldestInWindow + this.windowMs,
      };
    }

    // Allow request
    entry.timestamps.push(now);
    return {
      success: true,
      remaining: this.maxRequests - entry.timestamps.length,
      resetAt,
    };
  }

  private cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [key, entry] of this.store) {
      entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);
      if (entry.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }

  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.store.clear();
  }
}

// ---------------------------------------------------------------------------
// Upstash Redis Sliding Window Rate Limiter
// ---------------------------------------------------------------------------

class UpstashRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly restUrl: string;
  private readonly restToken: string;
  private readonly failClosed: boolean;

  constructor(maxRequests: number, windowMs: number, restUrl: string, restToken: string, failClosed: boolean) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.restUrl = restUrl;
    this.restToken = restToken;
    this.failClosed = failClosed;
  }

  private failureResult(now: number): RateLimitResult {
    if (this.failClosed) {
      return { success: false, remaining: 0, resetAt: now + this.windowMs };
    }
    return { success: true, remaining: this.maxRequests, resetAt: now + this.windowMs };
  }

  async check(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowKey = `rl:${identifier}`;
    const windowStart = now - this.windowMs;

    try {
      // Pipeline: ZREMRANGEBYSCORE (prune old) + ZADD (add current) + ZCARD (count) + ZRANGE (oldest) + PEXPIRE (TTL)
      const response = await fetch(`${this.restUrl}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.restToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["ZREMRANGEBYSCORE", windowKey, "0", String(windowStart)],
          ["ZADD", windowKey, String(now), `${now}-${Math.random().toString(36).slice(2, 8)}`],
          ["ZCARD", windowKey],
          ["ZRANGE", windowKey, "0", "0"],
          ["PEXPIRE", windowKey, String(this.windowMs)],
        ]),
      });

      if (!response.ok) {
        console.error(`Upstash rate limiter error: ${response.status}`);
        return this.failureResult(now);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = await response.json() as Array<{ result: any }>;
      const currentCount = results[2]?.result ?? 0;
      const zrangeResult = results[3]?.result as string[];
      const oldestMember = zrangeResult?.[0];

      let resetAt = now + this.windowMs;
      if (oldestMember) {
        const oldestTimestamp = parseInt(oldestMember.split("-")[0], 10);
        if (!isNaN(oldestTimestamp)) {
          resetAt = oldestTimestamp + this.windowMs;
        }
      }

      const remaining = Math.max(0, this.maxRequests - currentCount);

      return {
        success: currentCount <= this.maxRequests,
        remaining,
        resetAt,
      };
    } catch {
      console.error(`Upstash rate limiter unreachable, failing ${this.failClosed ? "closed" : "open"}`);
      return this.failureResult(now);
    }
  }
}

// ---------------------------------------------------------------------------
// Unified Rate Limiter Facade
// ---------------------------------------------------------------------------

export class RateLimiter {
  private memoryLimiter: InMemoryRateLimiter;
  private upstashLimiter: UpstashRateLimiter | null;
  readonly maxRequests: number;
  readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.memoryLimiter = new InMemoryRateLimiter(maxRequests, windowMs);

    const restUrl = process.env.UPSTASH_REDIS_REST_URL;
    const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    const failClosed = process.env.RATE_LIMIT_FAIL_CLOSED === "true";

    // Strict production check (D2)
    if (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production") {
      if (!restUrl || !restToken) {
        throw new Error(
          "FATAL: Missing critical Upstash Redis environment variables in production. " +
          "Ensure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set in the environment."
        );
      }
    }

    this.upstashLimiter =
      restUrl && restToken
        ? new UpstashRateLimiter(maxRequests, windowMs, restUrl, restToken, failClosed)
        : null;
  }

  async check(identifier: string): Promise<RateLimitResult> {
    if (this.upstashLimiter) {
      return this.upstashLimiter.check(identifier);
    }
    return this.memoryLimiter.check(identifier);
  }

  /** Human-readable window description for error messages */
  get windowDescription(): string {
    const seconds = this.windowMs / 1000;
    if (seconds >= 3600) return `${Math.round(seconds / 3600)} hour(s)`;
    if (seconds >= 60) return `${Math.round(seconds / 60)} minute(s)`;
    return `${seconds} second(s)`;
  }
}

// ---------------------------------------------------------------------------
// Preconfigured Rate Limiter Instances
// ---------------------------------------------------------------------------

/** Login attempts per email to prevent brute-forcing: 5 per 15 minutes */
export const loginLimiter = new RateLimiter(5, 15 * 60 * 1000);

/** Login attempts per IP to prevent massive abuse: 30 per 15 minutes */
export const loginIpLimiter = new RateLimiter(30, 15 * 60 * 1000);

/** Account creation: 3 per hour per IP */
export const signupLimiter = new RateLimiter(3, 60 * 60 * 1000);

/** Password reset: 3 per 15 minutes per IP */
export const passwordResetLimiter = new RateLimiter(3, 15 * 60 * 1000);

/** Auth callback: 10 per minute per IP */
export const callbackLimiter = new RateLimiter(10, 60 * 1000);

/** Checkout: 10 per minute per user */
export const checkoutLimiter = new RateLimiter(10, 60 * 1000);

/** Product mutations (upsert/delete): 20 per minute per user */
export const productMutationLimiter = new RateLimiter(20, 60 * 1000);

/** Bulk import: 2 per 5 minutes per user */
export const bulkImportLimiter = new RateLimiter(2, 5 * 60 * 1000);

/** Stock/UI mutations (adjust stock, toggle favorite): 30 per minute per user */
export const uiMutationLimiter = new RateLimiter(30, 60 * 1000);

/** Global request flood protection: 30 per 10 seconds per IP */
export const globalLimiter = new RateLimiter(30, 10 * 1000);

// ---------------------------------------------------------------------------
// Bot Detection Utilities
// ---------------------------------------------------------------------------

/** Known bot/scraper User-Agent patterns (case-insensitive match) */
const BLOCKED_UA_PATTERNS = [
  /curl\//i,
  /wget\//i,
  /python-requests\//i,
  /python-urllib/i,
  /go-http-client/i,
  /node-fetch/i,
  /undici/i,
  /httpie/i,
  /scrapy/i,
  /mechanize/i,
  /phantomjs/i,
  /headlesschrome/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
  /aiohttp/i,
  /axios\//i,
  /java\//i,
  /libwww-perl/i,
  /lwp-/i,
];

/** Legitimate search engine bots we should NOT block */
const ALLOWED_BOT_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /yandexbot/i,
  /duckduckbot/i,
  /baiduspider/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /slackbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /discordbot/i,
];

/**
 * Detect whether a User-Agent string belongs to a bot/scraper that should be blocked.
 * Returns true if the UA should be blocked, false if it's allowed.
 */
export function isBlockedBot(userAgent: string | null): boolean {
  // Empty or missing UA is suspicious
  if (!userAgent || userAgent.trim().length === 0) {
    return true;
  }

  // Allow legitimate search engine / social media bots
  if (ALLOWED_BOT_PATTERNS.some((pattern) => pattern.test(userAgent))) {
    return false;
  }

  // Block known scraper/automation UAs
  return BLOCKED_UA_PATTERNS.some((pattern) => pattern.test(userAgent));
}

// ---------------------------------------------------------------------------
// IP Extraction Helper (Server Actions)
// ---------------------------------------------------------------------------

/**
 * Extract the client IP address from the request headers.
 * Works in both proxy (middleware) and server action contexts.
 */
export async function getClientIp(): Promise<string> {
  return getTrustedClientIp();
}

// ---------------------------------------------------------------------------
// Rate Limit Enforcement Helper (Server Actions)
// ---------------------------------------------------------------------------

/**
 * Check rate limit and throw an error if exceeded.
 * Designed for use inside server actions — extracts IP, checks limiter, logs & throws.
 */
export async function enforceRateLimit(
  limiter: RateLimiter,
  identifier: string,
  actionName: string,
): Promise<void> {
  try {
    const head = await headers();
    const automationBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

    if (
      automationBypassSecret &&
      head.get("x-vercel-protection-bypass") === automationBypassSecret
    ) {
      return;
    }

    // Safe rate-limit bypass for local E2E testing runs.
    if (process.env.NODE_ENV !== "production" && head.get("x-paisapos-e2e-test") === "true") {
      return;
    }
  } catch {
    // Ignore header failures when run outside active HTTP requests.
  }

  const result = await limiter.check(identifier);

  if (!result.success) {
    // Dynamic import to avoid circular dependency issues in edge contexts
    const { writeLog } = await import("@/lib/logger");
    await writeLog("SECURITY", "RATE_LIMIT_EXCEEDED", `Rate limit exceeded for ${actionName}`, {
      identifier,
      action: actionName,
      maxRequests: limiter.maxRequests,
      windowMs: limiter.windowMs,
    });

    const remainingMs = Math.max(0, result.resetAt - Date.now());
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    let timeDescription = "";
    if (remainingSeconds >= 3600) {
      const hours = Math.floor(remainingSeconds / 3600);
      const mins = Math.ceil((remainingSeconds % 3600) / 60);
      timeDescription = `${hours} hour(s) and ${mins} minute(s)`;
    } else if (remainingSeconds >= 60) {
      const mins = Math.floor(remainingSeconds / 60);
      const secs = remainingSeconds % 60;
      timeDescription = secs > 0 ? `${mins} minute(s) and ${secs} second(s)` : `${mins} minute(s)`;
    } else {
      timeDescription = `${remainingSeconds} second(s)`;
    }

    throw new Error(
      `Too many requests. Please try again in ${timeDescription}.`
    );
  }
}
