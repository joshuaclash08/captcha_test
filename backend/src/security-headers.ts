/**
 * ══════════════════════════════════════════════════════════════
 * Security Headers Middleware
 * ══════════════════════════════════════════════════════════════
 * 
 * Adds security-related HTTP headers to all responses.
 * Similar to helmet.js but lightweight for Hono.
 */

import type { Context, Next } from "hono";
import { ENV } from "./env";

export async function securityHeaders(c: Context, next: Next) {
  await next();
  
  // Prevent MIME type sniffing
  c.header("X-Content-Type-Options", "nosniff");
  
  // Prevent clickjacking — CAPTCHA should not be framed by untrusted sites
  // Allow framing for widget embedding (CAPTCHA needs to work in iframes)
  // Use CSP frame-ancestors instead for more granular control
  c.header("X-Frame-Options", "SAMEORIGIN");
  
  // XSS protection (legacy, but harmless to include)
  c.header("X-XSS-Protection", "1; mode=block");
  
  // Referrer policy — don't leak full URL to third parties
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  
  // Permissions policy — disable unnecessary browser features
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  
  // Only set HSTS in production (requires HTTPS)
  if (ENV.IS_PRODUCTION) {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}
