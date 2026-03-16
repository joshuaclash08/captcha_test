# Server Architecture

The CAPTCHA server is a **standalone, self-contained** service that serves:
- The embeddable widget script (`/captcha.js`)
- WASM and JavaScript modules (`/engine.js`, `/engine.wasm`)
- REST APIs for challenge generation and verification

## Overview

```
server/
├── src/
│   ├── index.ts          ← HTTP server & routes
│   ├── config.ts         ← All configuration
│   ├── captcha.ts        ← Challenge generation & verification
│   ├── crypto.ts         ← AES encryption & token generation
│   ├── glyph-renderer.ts ← Text → alpha bitmap
│   ├── sites.ts          ← Site key registry & validation
│   ├── env.ts            ← Environment variables
│   ├── cors.ts           ← CORS middleware
│   ├── rate-limit.ts     ← Rate limiting
│   ├── errors.ts         ← Standardized error codes (ErrorCode enum)
│   └── security-headers.ts ← Security headers middleware
├── public/
│   ├── captcha.js  ← Self-contained widget (served as /captcha.js)
│   ├── debug.html        ← Debug controller (DEBUG_MODE only)
│   ├── engine.js         ← WASM glue module
│   └── engine.wasm       ← Compiled WASM binary
├── wasm/                 ← Rust WASM source
│   └── src/
│       ├── lib.rs
│       ├── decrypt.rs
│       ├── noise.rs
│       └── renderer.rs
└── scripts/
    ├── build-wasm.sh
  └── dev.sh
```

## Site Key System

Similar to Google reCAPTCHA, Cloudflare Turnstile, and hCaptcha, Noise CAPTCHA uses a **site key / secret key** system:

| Key Type | Format | Usage |
|----------|--------|-------|
| **Site Key** | `nc_pk_<hex>` | Public, used in frontend widget |
| **Secret Key** | `nc_sk_<hex>` | Private, used for server-side token validation |

### How It Works

1. **Challenge Request:** Client sends `siteKey` with challenge request
2. **Origin Binding:** Server hashes the `Origin` header and stores it with the challenge
3. **Verification:** Client submits answer; server verifies origin matches
4. **Token Validation:** Your backend uses `secretKey` to validate tokens

### Demo Site Keys (Development)

When no site is registered and `DEBUG_MODE=true`, a localhost demo site key pair is auto-created at startup and printed in server logs.

### Registering Sites

Sites are managed in the JSON registry file at `backend/data/sites.json` (or `SITE_REGISTRY_PATH` if configured).

## Routes

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/captcha.js` | Embeddable widget script | None |
| GET | `/engine.js` | WASM JS glue module | None |
| GET | `/engine.wasm` | Compiled WASM binary | None |
| POST | `/api/captcha/challenge` | Generate new challenge | Site Key |
| POST | `/api/captcha/verify` | Verify user answer | Origin |
| POST | `/api/captcha/validate-token` | Validate token | Secret Key |
| GET | `/health` | Health check | None |
| GET | `/debug` | Debug controller (DEBUG_MODE only) | None |

## API Reference

### POST `/api/captcha/challenge`

**Request Body:**
```json
{
  "siteKey": "nc_pk_xxx",   // Required
  "action": "login",        // Optional: like reCAPTCHA v3 action
  "width": 200,             // Optional
  "height": 80,             // Optional
  "cellSize": 4             // Optional
}
```

**Response:**
```json
{
  "challengeId": "uuid",
  "payload": "base64...",
  "expiresAt": 1234567890,
  "width": 200,
  "height": 80,
  "cellSize": 4
}
```

### POST `/api/captcha/verify`

**Request Body:**
```json
{
  "challengeId": "uuid",
  "answer": "HELLO"
}
```

**Response (Success):**
```json
{
  "success": true,
  "token": "eyJhbGciOi..."
}
```

### POST `/api/captcha/validate-token`

**Request Body:**
```json
{
  "token": "eyJhbGciOi...",
  "secret": "nc_sk_xxx"      // Required: your secret key
}
```

**Response (valid):**
```json
{
  "valid": true,
  "hostname": "example.com",
  "siteKey": "nc_pk_xxx"
}
```

**Response (invalid):**
```json
{
  "valid": false,
  "error": "Token already used",
  "error-codes": ["token-already-used"]
}
```

Tokens are **single-use**. Calling this endpoint with the same token twice will fail on the second call with `token-already-used`.

### `glyph-renderer.ts` — Text → Bitmap

Renders text into a pixelated alpha bitmap:
1. Uses serif font at maximum weight (900)
2. Auto-scales to fit 85% of viewport
3. Extracts bounding box
4. Creates blockSize × blockSize pixelated mask

### `rate-limit.ts` — Rate Limiting

Per-IP sliding window limits:
- Challenge requests: `RATE_LIMIT_CHALLENGE` per minute (default 30)
- Verify requests: `RATE_LIMIT_VERIFY` per minute (default 60)
- Validate-token requests: `RATE_LIMIT_VALIDATE_TOKEN` per minute (default 60)

Returns `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers.

## Challenge Store

Runtime storage is Redis-based:

- `challenge:{id}` hash for answer, site key, attempts, and client metadata
- `active_challenges` sorted set for active challenge tracking and cleanup
- `token:{uuid}` string for short-lived verification tokens
- Per-IP and per-site rate-limit keys

Site registry is JSON-based (`backend/data/sites.json` by default).

## Widget Self-Detection

The `captcha.js` script automatically detects its server URL:

```javascript
const scripts = document.getElementsByTagName("script");
const currentScript = scripts[scripts.length - 1];
const serverUrl = currentScript.src.replace(/\/captcha\.js.*$/, "");
// serverUrl = "https://captcha.example.com"
```

This means the widget works from any domain with zero configuration.

## Error Codes

All API error responses include an `error-codes` array for programmatic handling (similar to Cloudflare Turnstile):

```json
{ "success": false, "error": "Missing siteKey", "error-codes": ["missing-site-key"] }
```

| Code | When |
|------|------|
| `missing-site-key` | `siteKey` not provided |
| `invalid-site-key` | `siteKey` fails registry check |
| `origin-not-allowed` | Request origin not in site's domain list |
| `missing-challenge-id` | `challengeId` not provided |
| `invalid-or-expired-challenge` | Challenge not found or TTL exceeded |
| `incorrect-answer` | Wrong code submitted |
| `max-attempts-exceeded` | Too many wrong attempts |
| `missing-secret-key` | `secret` not provided to validate-token |
| `invalid-secret-key` | `secret` not found in registry |
| `token-already-used` | Token was already validated (single-use) |
| `token-site-mismatch` | Token belongs to different site key |
| `token-expired` | Token expired |
| `rate-limited` | Too many requests from this IP |
| `invalid-json-body` | Request body is not valid JSON |

## CORS & Security

- Configurable `ALLOWED_ORIGINS` for production
- Security headers on all responses:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Strict-Transport-Security` (production only)
- `Cross-Origin-Resource-Policy: cross-origin` on static assets
- Rate limiting on all API endpoints (per-IP sliding window)

## Running

```bash
# Development
cd server
bun run dev

# With WASM rebuild
bash scripts/dev.sh

# Production
bun run src/index.ts
```
