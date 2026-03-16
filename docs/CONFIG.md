# Configuration Reference

All configuration is centralized in `backend/src/config.ts`.

## CANVAS

```typescript
export const CANVAS = {
  width: 300,           // Default widget width (px)
  height: 100,          // Default widget height (px)
  cellSize: 1,          // Noise block size (1 = finest, 2-4 = blockier)
  maxDebugWidth: 960,   // Debug page max width
  maxDebugHeight: 540,  // Debug page max height
};
```

| Setting | Default | Description |
|---------|---------|-------------|
| `width` | 300 | Production widget width |
| `height` | 100 | Production widget height |
| `cellSize` | 1 | Noise block size. 1 = fine, 2-4 = chunky |
| `maxDebugWidth` | 960 | Max debug canvas width (WASM memory cap) |
| `maxDebugHeight` | 540 | Max debug canvas height |

## NOISE

```typescript
export const NOISE = {
  textDirection: 90,    // Default text noise scroll direction (degrees)
  bgDirection: 0,       // Default background scroll direction
  textSpeed: 2,         // Default text scroll speed (px/step)
  bgSpeed: 2,           // Default background scroll speed
  minSpeed: 1,          // Minimum random speed
  maxSpeed: 2,          // Maximum random speed
};
```

**Direction compass:**
```
        270° (up)
         │
180° ────┼──── 0° (right)
(left)   │
        90° (down)
```

Note: These are defaults only. The server generates random safe directions for each challenge.

## TIMING

```typescript
export const TIMING = {
  stepMs: 32,           // Milliseconds between animation steps (~30fps)
};
```

| Value | FPS |
|-------|-----|
| 16 | ~60 |
| 32 | ~30 |
| 50 | ~20 |

## SECURITY

```typescript
export const SECURITY = {
  jitterEnabled: true,           // Random per-frame offset
  jitterMagnitude: 3,            // Max jitter pixels
  temporalPhaseEnabled: false,   // Sine-wave brightness modulation
  noiseRegenInterval: 0,         // Regenerate noise every N frames (0 = never)
};
```

| Setting | Description |
|---------|-------------|
| `jitterEnabled` | Randomly offsets mask position each frame |
| `jitterMagnitude` | Maximum jitter displacement in pixels |
| `temporalPhaseEnabled` | Modulates brightness with sine wave |
| `noiseRegenInterval` | Regenerates text noise periodically |

These settings defeat frame-averaging attacks.

## DIRECTION_SAFETY

```typescript
export const DIRECTION_SAFETY = {
  minDirectionGap: 60,  // Minimum angle between text/bg directions
};
```

If text and background move in similar directions, the text becomes invisible. This setting guarantees a minimum angular separation.

| Value | Effect |
|-------|--------|
| 30° | Lenient, some near-overlap |
| 40° | Good balance |
| 60° | Very safe (default) |
| 90° | Perpendicular or wider |

## CAPTCHA_TEXT

```typescript
export const CAPTCHA_TEXT = {
  charset: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",  // No I,O,0,1
  codeLength: 5,        // Characters per code
  ttlMs: 120_000,       // Challenge TTL (2 minutes)
};
```

## Environment Variables

Set in `.env` file or environment.

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `NODE_ENV` | development | Environment mode |

### Security

| Variable | Default | Description |
|----------|---------|-------------|
| `TOKEN_EXPIRY_SECONDS` | 300 | Token lifetime |
| `ALLOWED_ORIGINS` | * | CORS allowed origins |
| `DEBUG_MODE` | false | Enable debug endpoints |

### Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_CHALLENGE` | 30 | Challenge requests per minute per IP |
| `RATE_LIMIT_VERIFY` | 60 | Verify requests per minute per IP |
| `RATE_LIMIT_VALIDATE_TOKEN` | 60 | Token validation requests per minute per IP |

### Challenge

| Variable | Default | Description |
|----------|---------|-------------|
| `CHALLENGE_TTL_SECONDS` | 120 | Challenge lifetime |
| `MAX_ATTEMPTS` | 3 | Max verification attempts per challenge |

### Encryption (Optional)

| Variable | Description |
|----------|-------------|
| `AES_KEY_SEED` | 32-byte hex for key derivation |
| `AES_KEY_MASK` | 32-byte hex for key derivation |

If not set, uses hardcoded development keys.

## Generating Secrets

```bash
# AES keys (optional)
openssl rand -hex 32  # AES_KEY_SEED
openssl rand -hex 32  # AES_KEY_MASK
```

## Example .env

```bash
# Production
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=https://example.com,https://www.example.com
DEBUG_MODE=false
RATE_LIMIT_CHALLENGE=20
RATE_LIMIT_VERIFY=40
RATE_LIMIT_VALIDATE_TOKEN=40
# Optional: custom AES encryption keys (strongly recommended for production)
AES_KEY_SEED=<64 hex chars>
AES_KEY_MASK=<64 hex chars>
```
