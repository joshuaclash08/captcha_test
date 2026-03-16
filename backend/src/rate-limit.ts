/**
 * ══════════════════════════════════════════════════════════════
 * Rate Limiting Middleware
 * ══════════════════════════════════════════════════════════════
 * 
 * Simple in-memory rate limiter with sliding window.
 * For production with multiple instances, use Redis-based rate limiting.
 */

import type { Context, Next } from "hono";
import { ENV } from "./env";
import { redis } from "./redis";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitCheckResult {
  limited: boolean;
  remaining: number;
  resetSeconds: number;
  currentCount: number;
}

/**
 * Get client IP from request
 */
export function getClientIP(c: Context): string {
  // Check common proxy headers
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  
  const realIP = c.req.header("x-real-ip");
  if (realIP) {
    return realIP.trim();
  }

  // Fallbacks for localhost/dev environments
  let ip = "127.0.0.1";
  if (c.env?.remoteAddress) {
    ip = String(c.env.remoteAddress);
  } else {
    // Bun specific connection info
    const server = c.env?.server as any;
    if (server?.requestIP) {
      const info = server.requestIP(c.req.raw);
      if (info?.address) ip = info.address;
    } else {
      // Try to get IP from the connection info
      try {
        const connInfo = (c as any).env?.remoteAddress || (c.req.raw as any)?.socket?.remoteAddress;
        if (connInfo) ip = String(connInfo);
      } catch {}
    }
  }
  
  // Normalize IPv6 localhost to IPv4 localhost
  if (ip === "::1" || ip === "[::1]") {
    return "127.0.0.1";
  }
  
  return ip;
}

async function checkAndConsumeRateLimit(
  ip: string,
  endpointKey: string,
  limitPerMinute: number
): Promise<RateLimitCheckResult> {
  const key = `ratelimit:${ip}:${endpointKey}`;
  const multi = redis.multi();
  multi.incr(key);
  multi.ttl(key);
  const results = await multi.exec();
  const count = results![0][1] as number;
  let resetSeconds = results![1][1] as number;
  if (count === 1 || resetSeconds === -1) {
    await redis.expire(key, 60);
    resetSeconds = 60;
  }
  const remaining = Math.max(0, limitPerMinute - count);
  return { limited: count > limitPerMinute, remaining, resetSeconds, currentCount: count };
}

export async function enforceRateLimitForKey(
  c: Context,
  ip: string,
  endpointKey: string,
  limitPerMinute: number
): Promise<RateLimitCheckResult> {
  const result = await checkAndConsumeRateLimit(ip, endpointKey, limitPerMinute);

  c.header("X-RateLimit-Limit", String(limitPerMinute));
  c.header("X-RateLimit-Remaining", String(result.remaining));
  c.header("X-RateLimit-Reset", String(result.resetSeconds));

  if (result.limited) {
    c.header("Retry-After", String(result.resetSeconds));
  }

  return result;
}

/**
 * Create rate limit middleware
 * @param limitPerMinute - Maximum requests per minute
 * @param endpointKey - Unique key for this endpoint
 */
export function rateLimit(limitPerMinute: number, endpointKey: string) {
  return async (c: Context, next: Next) => {
    const ip = getClientIP(c);
    const result = await enforceRateLimitForKey(c, ip, endpointKey, limitPerMinute);

    if (result.limited) {
      return c.json(
        { 
          error: "Too many requests", 
          retryAfter: result.resetSeconds 
        }, 
        429
      );
    }
    
    await next();
  };
}

/**
 * Pre-configured rate limiters for CAPTCHA endpoints
 */
export const rateLimitChallenge = rateLimit(ENV.RATE_LIMIT_CHALLENGE, "challenge");
export const rateLimitVerify = rateLimit(ENV.RATE_LIMIT_VERIFY, "verify");
export const rateLimitValidateToken = rateLimit(ENV.RATE_LIMIT_VALIDATE_TOKEN, "validate-token");
