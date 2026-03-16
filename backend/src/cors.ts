/**
 * ══════════════════════════════════════════════════════════════
 * CORS Middleware Factory
 * ══════════════════════════════════════════════════════════════
 * 
 * Environment-aware CORS configuration.
 */

import { cors } from "hono/cors";
import { ENV } from "./env";

/**
 * Create CORS middleware based on environment configuration.
 * 
 * - If ALLOWED_ORIGINS includes "*", allows all origins
 * - Otherwise, only allows specified origins
 */
export function createCorsMiddleware() {
  const allowAll = ENV.ALLOWED_ORIGINS.includes("*");
  
  if (allowAll) {
    return cors({
      origin: "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      maxAge: 86400, // 24 hours preflight cache
    });
  }
  
  return cors({
    origin: (origin) => {
      // Allow requests with no origin (e.g., same-origin, curl)
      if (!origin) return null;
      
      // Check if origin is in allowed list
      const isAllowed = ENV.ALLOWED_ORIGINS.some((allowed) => {
        // Exact match
        if (origin === allowed) return true;
        
        // Wildcard subdomain match (e.g., *.example.com)
        if (allowed.startsWith("*.")) {
          const domain = allowed.slice(2);
          return origin.endsWith(domain) && 
                 (origin.endsWith(`.${domain}`) || origin === `https://${domain}` || origin === `http://${domain}`);
        }
        
        return false;
      });
      
      return isAllowed ? origin : null;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 86400,
  });
}
