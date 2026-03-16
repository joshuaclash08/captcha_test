import { Hono } from "hono";
import { generateCaptcha, verifyCaptcha, generateDebugCaptcha } from "./captcha";
import { verifyKeySync, getKeyFingerprint } from "./crypto";
import { redis } from "./redis";
import { CANVAS } from "./config";
import { ENV, validateEnv, logEnvInfo } from "./env";
import { createCorsMiddleware } from "./cors";
import { enforceRateLimitForKey, getClientIP, rateLimitChallenge, rateLimitVerify, rateLimitValidateToken } from "./rate-limit";
import { securityHeaders } from "./security-headers";
import { ErrorCode, makeError } from "./errors";
import { 
  validateSiteKey, 
  validateSecretKey, 
  initializeSiteRegistry,
  getSiteBySiteKey,
} from "./sites";
import { assessRisk, getRiskBucketCount, recordRiskEvent } from "./risk-score";
import { validateSecurityAuditSink, writeSecurityAudit } from "./security-audit";
import { join } from "path";

// Validate environment on startup
validateEnv();
logEnvInfo();
validateSecurityAuditSink();

// Verify AES key round-trip (ensures WASM will be able to decrypt)
if (!verifyKeySync()) {
  console.error("❌ AES key round-trip verification failed! WASM decryption will not work.");
  if (ENV.IS_PRODUCTION) {
    throw new Error("AES key verification failed — aborting startup");
  }
} else {
  console.log(`🔑 AES key verified (fingerprint: ${getKeyFingerprint()})`);
}

// Initialize site registry (loads from JSON file)
initializeSiteRegistry();

const app = new Hono();

// Background memory cleanup (Step 4)
setInterval(() => {
  const now = Date.now();
  // Clean up expired scores in sorted set
  redis.zremrangebyscore("active_challenges", 0, now).catch((err) => {
    console.error("Cleanup error:", err);
  });
  // Note: challenge and token map entries are automatically evicted by Redis TTL.
}, 60_000);

// Static files directory (server/public)
const PUBLIC_DIR = join(import.meta.dir, "../public");
const WIDGET_SCRIPT_ROUTE = "/captcha.js";
const RENDER_SCRIPT_ROUTE = "/captcha-render.js";
const DEBUG_ROUTE = "/debug";
const ENGINE_JS_ROUTE = "/engine.js";
const ENGINE_WASM_ROUTE = "/engine.wasm";
const WIDGET_SCRIPT_FILE = join(PUBLIC_DIR, "captcha.js");
const RENDER_SCRIPT_FILE = join(PUBLIC_DIR, "captcha-render.js");
const WASM_ENGINE_JS_FILE = join(PUBLIC_DIR, "engine.js");
const WASM_ENGINE_BINARY_FILE = join(PUBLIC_DIR, "engine.wasm");
const DEBUG_HTML_FILE = join(PUBLIC_DIR, "debug.html");

// CORS middleware based on environment
app.use("/*", createCorsMiddleware());

// Security headers for all responses
app.use("/*", securityHeaders);

// Health check endpoint (no auth needed)
const startTime = Date.now();
app.get("/health", async (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    metrics: {
      activeChallenges: await redis.zcard("active_challenges"),
      riskBuckets: getRiskBucketCount(),
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  });
});

// --- API routes ---

// Generate a new CAPTCHA challenge (rate limited)
app.post("/api/captcha/challenge", rateLimitChallenge, async (c) => {
  const ip = getClientIP(c);
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(makeError("Invalid JSON body", ErrorCode.INVALID_JSON), 400);
  }
  const width = Number(body.width) || CANVAS.width;
  const height = Number(body.height) || CANVAS.height;
  const cellSize = body.cellSize !== undefined ? Number(body.cellSize) : CANVAS.cellSize;
  const siteKey = body.siteKey as string | undefined;
  const action = body.action as string | undefined;
  
  // Get origin from request headers
  const origin = c.req.header("origin") || c.req.header("referer") || "";

  const risk = assessRisk(ip, "challenge", origin);
  if (risk.blocked) {
    recordRiskEvent(ip, "challenge", "blocked", origin);
    writeSecurityAudit("risk-block", "warn", { endpoint: "challenge", ip, origin, score: risk.score });
    return c.json(makeError("Risk threshold exceeded", ErrorCode.RATE_LIMITED), 429);
  }
  
  // Validate site key and origin
  if (!siteKey) {
    return c.json(makeError("Missing siteKey", ErrorCode.MISSING_SITE_KEY), 400);
  }
  
  const validation = validateSiteKey(siteKey, origin);
  if (!validation.valid) {
    recordRiskEvent(ip, "challenge", "failure", origin);
    writeSecurityAudit("site-validation-failed", "warn", { endpoint: "challenge", ip, origin, siteKey, reason: validation.error });
    return c.json(makeError(validation.error || "Invalid site key", ErrorCode.INVALID_SITE_KEY), 403);
  }

  const perSiteChallengeLimit = validation.site?.settings.rateLimitChallenge || ENV.RATE_LIMIT_CHALLENGE;
  const challengeRate = await enforceRateLimitForKey(c, ip, `challenge-site:${siteKey}`, perSiteChallengeLimit);
  if (challengeRate.limited) {
    recordRiskEvent(ip, "challenge", "blocked", origin);
    writeSecurityAudit("rate-limit", "warn", { endpoint: "challenge", ip, origin, siteKey, limit: perSiteChallengeLimit });
    return c.json(makeError("Too many requests", ErrorCode.RATE_LIMITED), 429);
  }

  const userAgent = c.req.header("user-agent") || "";
  const result = await generateCaptcha({
    width,
    height,
    cellSize,
    siteKey,
    origin,
    action,
    ip,
    userAgent,
  });
  recordRiskEvent(ip, "challenge", "success", origin);
  return c.json(result);
});

// Debug endpoint (only available when DEBUG_MODE is enabled)
if (ENV.DEBUG_MODE) {
  console.warn("⚠️  DEBUG_MODE is enabled - debug endpoints are accessible");
  
  app.post("/api/captcha/debug-challenge", async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json(makeError("Invalid JSON body", ErrorCode.INVALID_JSON), 400);
    }
    const text = String(body.text || "HELLO").slice(0, 20); // Limit text length to prevent DoS
    const width = Math.min(Number(body.width) || CANVAS.width, CANVAS.maxDebugWidth);
    const height = Math.min(Number(body.height) || CANVAS.height, CANVAS.maxDebugHeight);
    const cellSize = body.cellSize !== undefined ? Number(body.cellSize) : CANVAS.cellSize;
    const ip = getClientIP(c);
    const userAgent = c.req.header("user-agent") || "";
    
    const result = await generateDebugCaptcha(text, width, height, cellSize, ip, userAgent);
    return c.json(result);
  });
}

// Verify a CAPTCHA answer (rate limited)
app.post("/api/captcha/verify", rateLimitVerify, async (c) => {
  const ip = getClientIP(c);
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(makeError("Invalid JSON body", ErrorCode.INVALID_JSON), 400);
  }
  const { challengeId, answer } = body;

  if (!challengeId || !answer) {
    return c.json(makeError("Missing challengeId or answer", 
      !challengeId ? ErrorCode.MISSING_CHALLENGE_ID : ErrorCode.MISSING_ANSWER), 400);
  }

  // Get origin from request headers
  const origin = c.req.header("origin") || c.req.header("referer") || "";

  const challengeHash = await redis.hgetall(`challenge:${challengeId}`);
  const challengeSiteKey = challengeHash?.sitekey as string | undefined;
  
  if (challengeSiteKey) {
    const site = getSiteBySiteKey(challengeSiteKey);
    const perSiteVerifyLimit = site?.settings.rateLimitVerify || ENV.RATE_LIMIT_VERIFY;
    const verifyRate = await enforceRateLimitForKey(c, ip, `verify-site:${challengeSiteKey}`, perSiteVerifyLimit);
    if (verifyRate.limited) {
      recordRiskEvent(ip, "verify", "blocked", origin);
      writeSecurityAudit("rate-limit", "warn", { endpoint: "verify", ip, origin, siteKey: challengeSiteKey, limit: perSiteVerifyLimit });
      return c.json(makeError("Too many requests", ErrorCode.RATE_LIMITED), 429);
    }
  }

  const risk = assessRisk(ip, "verify", origin);
  if (risk.blocked) {
    recordRiskEvent(ip, "verify", "blocked", origin);
    writeSecurityAudit("risk-block", "warn", { endpoint: "verify", ip, origin, score: risk.score });
    return c.json(makeError("Risk threshold exceeded", ErrorCode.RATE_LIMITED), 429);
  }

  const result = await verifyCaptcha({ challengeId, answer, origin, ip });
  recordRiskEvent(ip, "verify", result.success ? "success" : "failure", origin);
  if (!result.success) {
    writeSecurityAudit("verify-failed", "info", { ip, origin, challengeId, reason: result.error, needNewChallenge: result.needNewChallenge });
  }
  return c.json(result);
});

// Validate a verification token (for third-party servers)
// Requires secret key for authentication
app.post("/api/captcha/validate-token", rateLimitValidateToken, async (c) => {
  const ip = getClientIP(c);
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ valid: false, error: "Invalid JSON body", "error-codes": [ErrorCode.INVALID_JSON] }, 400);
  }
  // The client IP that initially submitted the captcha can optionally be validated
  const { token, secret, ip: clientIp } = body;

  const risk = assessRisk(ip, "validate-token");
  if (risk.blocked) {
    recordRiskEvent(ip, "validate-token", "blocked");
    writeSecurityAudit("risk-block", "warn", { endpoint: "validate-token", ip, score: risk.score });
    return c.json({ valid: false, error: "Risk threshold exceeded", "error-codes": [ErrorCode.RATE_LIMITED] }, 429);
  }

  if (!secret) {
    return c.json({ valid: false, error: "Missing secret key", "error-codes": [ErrorCode.MISSING_SECRET_KEY] }, 400);
  }

  // Validate secret key
  const validation = validateSecretKey(secret);
  if (!validation.valid) {
    recordRiskEvent(ip, "validate-token", "failure");
    writeSecurityAudit("secret-validation-failed", "warn", { endpoint: "validate-token", ip, reason: validation.error });
    return c.json({ valid: false, error: validation.error, "error-codes": [ErrorCode.INVALID_SECRET_KEY] }, 403);
  }

  if (!token) {
    return c.json({ valid: false, error: "Missing token", "error-codes": [ErrorCode.MISSING_TOKEN] }, 400);
  }

  const redisData = await redis.get(`token:${token}`);
  if (!redisData) {
    recordRiskEvent(ip, "validate-token", "failure");
    writeSecurityAudit("token-verify-failed", "info", { endpoint: "validate-token", ip, reason: "Invalid or expired token" });
    return c.json({ valid: false, error: "Invalid or expired token", "error-codes": [ErrorCode.TOKEN_VERIFICATION_FAILED] }, 403);
  }

  let tokenData: any;
  try {
    tokenData = JSON.parse(redisData);
  } catch (err) {
    recordRiskEvent(ip, "validate-token", "failure");
    writeSecurityAudit("token-verify-failed", "info", { endpoint: "validate-token", ip, reason: "Corrupted token data" });
    return c.json({ valid: false, error: "Invalid or expired token", "error-codes": [ErrorCode.TOKEN_VERIFICATION_FAILED] }, 403);
  }
  
  if (tokenData.sitekey !== validation.site!.siteKey) {
    recordRiskEvent(ip, "validate-token", "failure");
    writeSecurityAudit("token-site-mismatch", "warn", { endpoint: "validate-token", ip, tokenSiteKey: tokenData.sitekey, requesterSiteKey: validation.site!.siteKey });
    return c.json({ valid: false, error: "Token does not belong to this site", "error-codes": [ErrorCode.TOKEN_SITE_MISMATCH] }, 403);
  }

  // Client IP validation (Optional but recommended)
  // Check if target ip was provided and matches the initial captcha submission ip
  if (clientIp != null && tokenData.ip && tokenData.ip !== clientIp) {
    recordRiskEvent(ip, "validate-token", "failure");
    writeSecurityAudit("token-ip-mismatch", "warn", { endpoint: "validate-token", ip, tokenIp: tokenData.ip, clientIp });
    return c.json({ valid: false, error: "Token was not issued to this IP address", "error-codes": [ErrorCode.TOKEN_VERIFICATION_FAILED] }, 403);
  }

  // Site key matches — now consume (mark as used by deleting)
  await redis.del(`token:${token}`);

  const result = { valid: true, hostname: tokenData.hostname, siteKey: tokenData.sitekey };
  recordRiskEvent(ip, "validate-token", "success");
  return c.json(result);
});

// --- Static file serving ---
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".ts": "application/javascript",
};

function getMime(path: string): string {
  const ext = path.substring(path.lastIndexOf("."));
  return MIME[ext] || "application/octet-stream";
}

async function serveFile(filePath: string): Promise<Response> {
  const file = Bun.file(filePath);
  if (await file.exists()) {
    return new Response(file, {
      headers: { 
        "Content-Type": getMime(filePath),
        // Widget assets are public and must be importable cross-origin.
        "Access-Control-Allow-Origin": "*",
        // Security headers for static files
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    });
  }
  return new Response("Not Found", { status: 404 });
}

// Production: Only serve essential widget files
// Embeddable widget script (for third-party sites)
app.get(WIDGET_SCRIPT_ROUTE, (c) => serveFile(WIDGET_SCRIPT_FILE));
app.get(RENDER_SCRIPT_ROUTE, (c) => serveFile(RENDER_SCRIPT_FILE));

// Friendly aliases for engine assets
app.get(ENGINE_JS_ROUTE, (c) => serveFile(WASM_ENGINE_JS_FILE));
app.get(ENGINE_WASM_ROUTE, (c) => serveFile(WASM_ENGINE_BINARY_FILE));

// Debug page (only in DEBUG_MODE)
if (ENV.DEBUG_MODE) {
  app.get(DEBUG_ROUTE, (c) => serveFile(DEBUG_HTML_FILE));
} else {
  // In production, redirect root to health check
  app.get("/", (c) => c.redirect("/health"));
}

console.log(`🔒 Noise CAPTCHA API running on http://localhost:${ENV.PORT}`);
console.log(`   Mode: ${ENV.NODE_ENV}`);

export default {
  port: ENV.PORT,
  fetch: app.fetch,
};
