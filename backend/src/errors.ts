/**
 * ══════════════════════════════════════════════════════════════
 * Standardized Error Codes
 * ══════════════════════════════════════════════════════════════
 * 
 * Consistent error codes similar to Cloudflare Turnstile / reCAPTCHA.
 * Clients can programmatically handle errors based on these codes.
 */

export enum ErrorCode {
  // Challenge errors
  MISSING_SITE_KEY = "missing-site-key",
  INVALID_SITE_KEY = "invalid-site-key",
  SITE_DISABLED = "site-disabled",
  ORIGIN_NOT_ALLOWED = "origin-not-allowed",
  
  // Verification errors
  MISSING_CHALLENGE_ID = "missing-challenge-id",
  MISSING_ANSWER = "missing-answer",
  INVALID_CHALLENGE = "invalid-or-expired-challenge",
  CHALLENGE_EXPIRED = "challenge-expired",
  ORIGIN_MISMATCH = "origin-mismatch",
  INCORRECT_ANSWER = "incorrect-answer",
  MAX_ATTEMPTS_EXCEEDED = "max-attempts-exceeded",
  NO_ANSWER_PROVIDED = "no-answer-provided",
  
  // Token errors
  MISSING_SECRET_KEY = "missing-secret-key",
  INVALID_SECRET_KEY = "invalid-secret-key",
  MISSING_TOKEN = "missing-token",
  INVALID_TOKEN_FORMAT = "invalid-token-format",
  INVALID_SIGNATURE = "invalid-signature",
  TOKEN_EXPIRED = "token-expired",
  TOKEN_ALREADY_USED = "token-already-used",
  TOKEN_SITE_MISMATCH = "token-site-mismatch",
  TOKEN_VERIFICATION_FAILED = "token-verification-failed",
  
  // General errors  
  INVALID_JSON = "invalid-json-body",
  RATE_LIMITED = "rate-limited",
  INTERNAL_ERROR = "internal-error",
}

export interface CaptchaError {
  success: false;
  error: string;
  "error-codes": ErrorCode[];
}

export function makeError(message: string, ...codes: ErrorCode[]): CaptchaError {
  return {
    success: false,
    error: message,
    "error-codes": codes,
  };
}
