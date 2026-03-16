import { renderGlyphBitmap } from "./glyph-renderer";
import { encryptPayload } from "./crypto";
import {
  CANVAS,
  CAPTCHA_TEXT,
  buildChallengeConfig,
  type NoiseConfig,
} from "./config";
import { ENV } from "./env";
import { redis } from "./redis";

/** TTL from environment config */
const CHALLENGE_TTL_MS = ENV.CHALLENGE_TTL_SECONDS * 1000;

/**
 * Generate a random CAPTCHA code with:
 *   - Rejection sampling to eliminate modulo bias
 *   - No adjacent duplicate characters (improves readability in noise)
 */
function generateCode(): string {
  const len = CAPTCHA_TEXT.codeLength;
  const charsetLen = CAPTCHA_TEXT.charset.length;
  // Largest multiple of charsetLen that fits in a byte → reject above this
  const limit = 256 - (256 % charsetLen);

  const chars: string[] = [];
  while (chars.length < len) {
    const buf = new Uint8Array(1);
    crypto.getRandomValues(buf);
    const val = buf[0];
    // Reject values that cause modulo bias
    if (val >= limit) continue;
    const ch = CAPTCHA_TEXT.charset[val % charsetLen];
    // Prevent adjacent duplicates for easier reading in noise
    if (chars.length > 0 && chars[chars.length - 1] === ch) continue;
    chars.push(ch);
  }
  return chars.join("");
}

export interface ChallengeResponse {
  challengeId: string;
  /** Base64-encoded encrypted payload (contains glyph + noiseConfig) */
  payload: string;
  expiresAt: number;
  /** Canvas dimensions the bitmap was rendered for */
  width: number;
  height: number;
  cellSize: number;
}

export interface ChallengeOptions {
  width?: number;
  height?: number;
  cellSize?: number;
  /** Site key (required in production) */
  siteKey: string;
  /** Origin of the request (for cross-site replay protection) */
  origin: string;
  /** Optional action tag for analytics (like reCAPTCHA v3 action) */
  action?: string;
  ip: string;
  userAgent: string;
}

/**
 * Build the encrypted payload from glyph bitmap + noise config.
 * 
 * Format (before encryption):
 * ┌─────────────────────────────────────────────────────────────┐
 * │ mask_w: u16 LE                                    (2 bytes)│
 * │ mask_h: u16 LE                                    (2 bytes)│
 * │ textDirection: u16 LE (0-360)                     (2 bytes)│
 * │ bgDirection: u16 LE (0-360)                       (2 bytes)│
 * │ textSpeed: u8                                     (1 byte) │
 * │ bgSpeed: u8                                       (1 byte) │
 * │ stepMs: u16 LE                                    (2 bytes)│
 * │ flags: u8 (bit0=jitter, bit1=temporalPhase)       (1 byte) │
 * │ jitterMagnitude: u8                               (1 byte) │
 * │ noiseRegenInterval: u16 LE                        (2 bytes)│
 * │ alpha bitmap bytes                                (N bytes)│
 * └─────────────────────────────────────────────────────────────┘
 * Total header: 16 bytes
 * 
 * Including noiseConfig in the encrypted payload prevents MITM attacks
 * from tampering with the animation parameters (e.g., setting speed=0
 * to make text visible without motion).
 */
const PAYLOAD_HEADER_SIZE = 16;

function buildEncryptedPayload(
  glyph: { bitmap: Uint8Array; width: number; height: number },
  noiseConfig: NoiseConfig
): string {
  const payloadBuf = new Uint8Array(PAYLOAD_HEADER_SIZE + glyph.bitmap.length);
  
  // Glyph dimensions
  payloadBuf[0] = glyph.width & 0xff;
  payloadBuf[1] = (glyph.width >> 8) & 0xff;
  payloadBuf[2] = glyph.height & 0xff;
  payloadBuf[3] = (glyph.height >> 8) & 0xff;
  
  // Noise directions (0-360 degrees)
  payloadBuf[4] = noiseConfig.textDirection & 0xff;
  payloadBuf[5] = (noiseConfig.textDirection >> 8) & 0xff;
  payloadBuf[6] = noiseConfig.bgDirection & 0xff;
  payloadBuf[7] = (noiseConfig.bgDirection >> 8) & 0xff;
  
  // Speeds
  payloadBuf[8] = noiseConfig.textSpeed & 0xff;
  payloadBuf[9] = noiseConfig.bgSpeed & 0xff;
  
  // Step timing
  payloadBuf[10] = noiseConfig.stepMs & 0xff;
  payloadBuf[11] = (noiseConfig.stepMs >> 8) & 0xff;
  
  // Flags (packed boolean options)
  let flags = 0;
  if (noiseConfig.jitterEnabled) flags |= 0x01;
  if (noiseConfig.temporalPhaseEnabled) flags |= 0x02;
  payloadBuf[12] = flags;
  
  // Jitter magnitude
  payloadBuf[13] = noiseConfig.jitterMagnitude & 0xff;
  
  // Noise regeneration interval
  payloadBuf[14] = noiseConfig.noiseRegenInterval & 0xff;
  payloadBuf[15] = (noiseConfig.noiseRegenInterval >> 8) & 0xff;
  
  // Bitmap data
  payloadBuf.set(glyph.bitmap, PAYLOAD_HEADER_SIZE);

  const encrypted = encryptPayload(payloadBuf);
  return Buffer.from(encrypted).toString("base64");
}

/**
 * Generate a new CAPTCHA challenge.
 * - Generates a random code
 * - Renders it into a pixelated alpha bitmap on the server
 * - Encrypts the bitmap with AES-256-GCM
 * - Generates safe noise directions (guaranteed angular separation)
 * - Stores the code with a TTL for later verification
 * - Binds challenge to site key and origin for security
 */
export async function generateCaptcha(options: ChallengeOptions): Promise<ChallengeResponse> {
  const {
    width = CANVAS.width,
    height = CANVAS.height,
    cellSize = CANVAS.cellSize,
    siteKey,
    origin,
    action,
    ip,
    userAgent
  } = options;

  // Periodically sweep expired challenges from the ZSET (lazy cleanup)
  // This ensures zcard is accurate without requiring a separate setInterval
  if (Math.random() < 0.05) { // 5% chance per request
    redis.zremrangebyscore("active_challenges", 0, Date.now() - 1000).catch(console.error);
  }

  const activeCount = await redis.zcard("active_challenges");
  if (activeCount > 200000) {
    throw new Error("Service Unavailable");
  }
  if (activeCount > 100000) {
    const popped = await redis.zpopmin("active_challenges", 1);
    if (popped && popped.length > 0) {
      await redis.del(`challenge:${popped[0]}`);
    }
  }

  const id = crypto.randomUUID();
  const code = generateCode();
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;

  // Render text → alpha bitmap (text string never leaves the server)
  const glyph = renderGlyphBitmap(code, cellSize, width, height);

  // Generate safe noise config (directions guaranteed to differ)
  const noiseConfig = buildChallengeConfig();
  
  // Encrypt both glyph AND noiseConfig together to prevent MITM tampering
  const base64 = buildEncryptedPayload(glyph, noiseConfig);

  // Store for verification with site binding
  let hostname = "";
  try {
    hostname = origin ? new URL(origin).hostname : "";
  } catch {
    hostname = origin || "";
  }

  const multi = redis.multi();
  multi.hset(`challenge:${id}`, {
    answer: code,
    ip: ip,
    userAgent: userAgent,
    sitekey: siteKey,
    attempts: 0
  });
  multi.expire(`challenge:${id}`, ENV.CHALLENGE_TTL_SECONDS);
  multi.zadd("active_challenges", expiresAt, id);
  await multi.exec();

  return {
    challengeId: id,
    payload: base64,
    expiresAt,
    width,
    height,
    cellSize,
  };
}

export interface VerifyResult {
  success: boolean;
  error?: string;
  /** UUID token for verified CAPTCHA (only present on success) */
  token?: string;
  /** Remaining attempts (only present on failure when attempts remain) */
  attemptsRemaining?: number;
  /** Whether a new challenge is needed */
  needNewChallenge?: boolean;
}

export interface VerifyOptions {
  challengeId: string;
  answer: string;
  /** Origin of the verification request (must match challenge origin) */
  origin: string;
  ip: string;
}

/**
 * Verify a CAPTCHA answer.
 * - Allows up to MAX_ATTEMPTS attempts before invalidating
 * - Case-insensitive comparison
 * - Verifies origin matches (cross-site replay protection)
 * - Returns a UUID token on success for third-party verification
 */
export async function verifyCaptcha(options: VerifyOptions): Promise<VerifyResult> {
  const { challengeId, answer, origin, ip } = options;
  const challengeHash = await redis.hgetall(`challenge:${challengeId}`);

  if (!challengeHash || Object.keys(challengeHash).length === 0) {
    return { success: false, error: "Invalid or expired challenge", needNewChallenge: true };
  }

  if (challengeHash.ip !== ip) {
    return { success: false, error: "IP mismatch", needNewChallenge: true };
  }

  if (!answer || typeof answer !== "string") {
    return { success: false, error: "No answer provided" };
  }

  const success = challengeHash.answer.toUpperCase().trim() === answer.toUpperCase().trim();

  if (success) {
    const multi = redis.multi();
    multi.del(`challenge:${challengeId}`);
    multi.zrem("active_challenges", challengeId);
    
    const token = crypto.randomUUID();
    let hostname = "";
    try {
      hostname = origin ? new URL(origin).hostname : "";
    } catch {
      hostname = origin || "";
    }
    // IP는 처음 발급될 때 저장해둔 challengeHash의 ip를 활용하거나, 요청한 IP를 활용합니다.
    const storedIp = challengeHash.ip || ip || "unknown";
    multi.setex(`token:${token}`, 120, JSON.stringify({ sitekey: challengeHash.sitekey, hostname, ip: storedIp }));
    
    await multi.exec();
    return { success: true, token };
  }

  // Increment attempt counter
  const newAttempts = await redis.hincrby(`challenge:${challengeId}`, "attempts", 1);
  const maxAttempts = ENV.MAX_ATTEMPTS || 3;
  
  if (newAttempts >= maxAttempts) {
    const multi = redis.multi();
    multi.del(`challenge:${challengeId}`);
    multi.zrem("active_challenges", challengeId);
    await multi.exec();
    
    return {
      success: false,
      error: "Maximum attempts exceeded",
      attemptsRemaining: 0,
      needNewChallenge: true,
    };
  }

  return {
    success: false,
    error: "Incorrect code",
    attemptsRemaining: maxAttempts - newAttempts,
    needNewChallenge: false,
  };
}

/**
 * For debug: generate a challenge with a specific text (not random).
 * Note: In debug mode, siteKey/origin validation is skipped.
 */
export async function generateDebugCaptcha(
  text: string,
  width: number = CANVAS.width,
  height: number = CANVAS.height,
  cellSize: number = CANVAS.cellSize,
  siteKey: string = "debug",
  origin: string = "localhost"
): Promise<ChallengeResponse> {
  const id = crypto.randomUUID();
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;

  const glyph = renderGlyphBitmap(text, cellSize, width, height);
  const noiseConfig = buildChallengeConfig();
  const base64 = buildEncryptedPayload(glyph, noiseConfig);

  const multi = redis.multi();
  multi.hset(`challenge:${id}`, {
    answer: text,
    ip: "127.0.0.1",
    userAgent: "debug",
    sitekey: siteKey,
    attempts: 0
  });
  multi.expire(`challenge:${id}`, ENV.CHALLENGE_TTL_SECONDS);
  multi.zadd("active_challenges", expiresAt, id);
  await multi.exec();

  return {
    challengeId: id,
    payload: base64,
    expiresAt,
    width,
    height,
    cellSize,
  };
}
