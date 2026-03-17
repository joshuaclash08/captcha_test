/**
 * ══════════════════════════════════════════════════════════════
 * Environment Configuration
 * ══════════════════════════════════════════════════════════════
 * 
 * Centralized environment variable handling with validation.
 * All environment variables should be accessed through this module.
 */

// Use Bun.env for Bun runtime
const env = typeof Bun !== "undefined" ? Bun.env : process.env;

function getEnv(key: string, defaultValue?: string): string {
  const value = env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = env[key];
  if (value === undefined) return defaultValue;
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    console.warn(`Invalid number for ${key}: ${value}, using default: ${defaultValue}`);
    return defaultValue;
  }
  return num;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

function getEnvArray(key: string, defaultValue: string[]): string[] {
  const value = env[key];
  if (value === undefined) return defaultValue;
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

// ══════════════════════════════════════════════════════════════
// Environment Configuration Object
// ══════════════════════════════════════════════════════════════

export const ENV = {
  // Server
  PORT: getEnvNumber("PORT", 3000),
  NODE_ENV: getEnv("NODE_ENV", "development"),
  
  // Is production?
  get IS_PRODUCTION() {
    return this.NODE_ENV === "production";
  },
  
  // CORS & Security
  ALLOWED_ORIGINS: getEnvArray("ALLOWED_ORIGINS", ["*"]),
  
  // Tokens
  TOKEN_EXPIRY_SECONDS: getEnvNumber("TOKEN_EXPIRY_SECONDS", 120),
  
  // Rate limiting (requests per minute)
  RATE_LIMIT_CHALLENGE: getEnvNumber("RATE_LIMIT_CHALLENGE", 30),
  RATE_LIMIT_VERIFY: getEnvNumber("RATE_LIMIT_VERIFY", 60),
  RATE_LIMIT_VALIDATE_TOKEN: getEnvNumber("RATE_LIMIT_VALIDATE_TOKEN", 60),
  
  // Challenge
  CHALLENGE_TTL_SECONDS: getEnvNumber("CHALLENGE_TTL_SECONDS", 60),
  MAX_ATTEMPTS: getEnvNumber("MAX_ATTEMPTS", 3),
  
  // AES Keys (hex encoded)
  AES_KEY_SEED: process.env.AES_KEY_SEED,
  AES_KEY_MASK: process.env.AES_KEY_MASK,
  AES_KEY_SEED_PREV: process.env.AES_KEY_SEED_PREV,
  AES_KEY_MASK_PREV: process.env.AES_KEY_MASK_PREV,
  
  // Redis
  REDIS_URL: process.env.REDIS_URL,

  // Optional site registry file path (relative to server root or absolute)
  SITE_REGISTRY_PATH: process.env.SITE_REGISTRY_PATH,

  // Security audit log (JSONL)
  ENABLE_SECURITY_AUDIT_LOG: getEnvBoolean("ENABLE_SECURITY_AUDIT_LOG", true),
  SECURITY_AUDIT_LOG_PATH: process.env.SECURITY_AUDIT_LOG_PATH,
  SECURITY_AUDIT_DAILY_ROLLING: getEnvBoolean("SECURITY_AUDIT_DAILY_ROLLING", true),
  SECURITY_AUDIT_STRICT: getEnvBoolean("SECURITY_AUDIT_STRICT", false),
  INSTANCE_ID: getEnv("INSTANCE_ID", "local"),
  
  // Logging
  LOG_LEVEL: getEnv("LOG_LEVEL", "info"),
  
  // Debug
  DEBUG_MODE: getEnvBoolean("DEBUG_MODE", false),

  // Risk scoring
  RISK_SCORE_THRESHOLD: getEnvNumber("RISK_SCORE_THRESHOLD", 85),
  RISK_WINDOW_SECONDS: getEnvNumber("RISK_WINDOW_SECONDS", 120),
} as const;

// ══════════════════════════════════════════════════════════════
// Validation
// ══════════════════════════════════════════════════════════════

export function validateEnv(): void {
  const warnings: string[] = [];
  const errors: string[] = [];

  function isHex32(value: string): boolean {
    return /^[0-9a-fA-F]{64}$/.test(value);
  }
  
  // Production checks
  if (ENV.IS_PRODUCTION) {
    // CORS
    if (ENV.ALLOWED_ORIGINS.includes("*")) {
      warnings.push("ALLOWED_ORIGINS contains '*' - consider restricting to specific domains");
    }
    
    // Debug mode
    if (ENV.DEBUG_MODE) {
      errors.push("DEBUG_MODE must be false in production!");
    }
  }

  // AES Keys (Required in all environments now)
  if (!ENV.AES_KEY_SEED || !ENV.AES_KEY_MASK) {
    errors.push("AES_KEY_SEED and AES_KEY_MASK are required");
  } else {
    if (!isHex32(ENV.AES_KEY_SEED) || !isHex32(ENV.AES_KEY_MASK)) {
      errors.push("AES_KEY_SEED and AES_KEY_MASK must be 64-char hex strings");
    }
  }

  if (ENV.CHALLENGE_TTL_SECONDS < 30 || ENV.CHALLENGE_TTL_SECONDS > 600) {
    warnings.push("CHALLENGE_TTL_SECONDS should be between 30 and 600");
  }

  if (ENV.TOKEN_EXPIRY_SECONDS < 30 || ENV.TOKEN_EXPIRY_SECONDS > 3600) {
    warnings.push("TOKEN_EXPIRY_SECONDS should be between 30 and 3600");
  }

  if (ENV.MAX_ATTEMPTS < 1 || ENV.MAX_ATTEMPTS > 5) {
    warnings.push("MAX_ATTEMPTS should be between 1 and 5");
  }

  if (ENV.RISK_SCORE_THRESHOLD < 1 || ENV.RISK_SCORE_THRESHOLD > 100) {
    warnings.push("RISK_SCORE_THRESHOLD should be between 1 and 100");
  }

  if (ENV.SECURITY_AUDIT_STRICT && !ENV.ENABLE_SECURITY_AUDIT_LOG) {
    warnings.push("SECURITY_AUDIT_STRICT is enabled but ENABLE_SECURITY_AUDIT_LOG is false");
  }
  
  // Log warnings
  warnings.forEach((w) => console.warn(`⚠️  [ENV] ${w}`));
  
  // Throw on errors
  if (errors.length > 0) {
    errors.forEach((e) => console.error(`❌ [ENV] ${e}`));
    throw new Error(`Environment validation failed with ${errors.length} error(s)`);
  }
}

// ══════════════════════════════════════════════════════════════
// Info display
// ══════════════════════════════════════════════════════════════

export function logEnvInfo(): void {
  console.log("📋 Environment Configuration:");
  console.log(`   NODE_ENV: ${ENV.NODE_ENV}`);
  console.log(`   PORT: ${ENV.PORT}`);
  console.log(`   ALLOWED_ORIGINS: ${ENV.ALLOWED_ORIGINS.join(", ")}`);
  console.log(`   DEBUG_MODE: ${ENV.DEBUG_MODE}`);
  console.log(`   REDIS_URL: ${ENV.REDIS_URL || "redis://localhost:6379 (default)"}`);
  console.log(`   SECURITY_AUDIT_LOG: ${ENV.ENABLE_SECURITY_AUDIT_LOG ? "enabled" : "disabled"}`);
  console.log(`   SECURITY_AUDIT_DAILY_ROLLING: ${ENV.SECURITY_AUDIT_DAILY_ROLLING}`);
}
