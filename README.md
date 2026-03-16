# Noise CAPTCHA

A visual CAPTCHA system where text is hidden behind **moving binary noise**.  
The text is only readable through **temporal observation** (watching for a few seconds),  
not from a single screenshot — defeating automated screen-capture attacks.

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  CAPTCHA Server (Standalone)                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ Text → Bitmap│→ │ AES-256-GCM  │→ │ /captcha.js          │ │
│  │ (@napi-rs/   │  │ Encrypt      │  │ /engine.js           │ │
│  │  canvas)     │  └──────────────┘  │ /engine.wasm         │ │
│  └──────────────┘                    │ /api/captcha/*       │ │
│  └──────────────┘                    └──────────────────────┘ │
└───────────────────────┬───────────────────────────────────────┘
                        │
              One script tag loads everything
                        │
                        ▼
┌───────────────────────────────────────────────────────────────┐
│  Any Website                                                   │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ <script src="https://captcha.example.com/captcha.js">   │ │
│  │ <div data-noise-captcha></div>                           │ │
│  │                                                          │ │
│  │ → Widget auto-renders                                    │ │
│  │ → WASM loads automatically from same server              │ │
│  │ → User completes challenge                               │ │
│  │ → Token sent to your backend for validation              │ │
│  └──────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Rust** | stable (1.70+) | Compile WASM engine |
| **wasm-pack** | 0.12+ | Rust → WASM build tool |
| **Bun** | 1.0+ | Server runtime |

### Start the CAPTCHA Server

```bash
cd server
bash scripts/dev.sh
```

This will:
1. Build the Rust WASM engine and publish `server/public/engine.js` + `server/public/engine.wasm`
2. Install server dependencies
3. Start the server on `http://localhost:3000`

### Docker

```bash
# Development
docker compose up

# Production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## Integration

### Step 1: Add a single script tag

```html
<script src="https://your-captcha-server.com/captcha.js"></script>
```

That's it. The script:
- Auto-detects its own server URL from the script `src`
- Loads WASM from `/engine.js` and `/engine.wasm` automatically
- Initializes all `[data-noise-captcha]` elements on the page

### Step 2: Add the widget container

```html
<form>
  <input type="email" name="email" />
  <input type="password" name="password" />
  
  <!-- CAPTCHA widget -->
  <div data-noise-captcha></div>
  
  <button type="submit">Login</button>
</form>
```

### Step 3: Get the token on form submit

```javascript
// After user completes CAPTCHA, get the token
const token = window.NoiseCaptcha.getToken();

// Send to your backend with form data
fetch('/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, captchaToken: token })
});
```

### Step 4: Validate token on your server

```javascript
// Option A: Validate via CAPTCHA server API
const response = await fetch('https://your-captcha-server.com/api/captcha/validate-token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: captchaToken })
});
const { valid } = await response.json();
if (!valid) throw new Error('CAPTCHA failed');

// Option B: Validate using Secret Key
// (See server/src/crypto.ts for implementation)
```

---

## Client API

| Function | Description |
|----------|-------------|
| `NoiseCaptcha.render(container)` | Render widget in a container element |
| `NoiseCaptcha.getToken(container?)` | Get verification token after completion |
| `NoiseCaptcha.reset(container?)` | Reset to initial state |
| `NoiseCaptcha.onVerify(callback)` | Set callback for when user completes CAPTCHA |
| `NoiseCaptcha.isVerified(container?)` | Check if CAPTCHA is completed |
| `NoiseCaptcha.refresh(container?)` | Request a new challenge |

---

## Server API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/captcha.js` | GET | Embeddable widget script |
| `/engine.js` | GET | WASM JS glue module |
| `/engine.wasm` | GET | Compiled WASM binary |
| `/api/captcha/challenge` | POST | Generate new challenge |
| `/api/captcha/verify` | POST | Verify user's answer |
| `/api/captcha/validate-token` | POST | Validate token |
| `/health` | GET | Health check |
| `/debug` | GET | Debug controller (DEBUG_MODE only) |

### Challenge Response

```json
{
  "challengeId": "uuid",
  "payload": "base64-encrypted-bitmap",
  "expiresAt": 1709123456789,
  "width": 300,
  "height": 100,
  "cellSize": 1,
  "noiseConfig": {
    "textDirection": 180,
    "bgDirection": 308,
    "textSpeed": 2,
    "bgSpeed": 2,
    "stepMs": 32,
    "jitterEnabled": true,
    "jitterMagnitude": 3,
    "temporalPhaseEnabled": false,
    "noiseRegenInterval": 0
  }
}
```

### Verify Response

```json
{ "success": true, "token": "uuid-token" }
// or
{ "success": false, "error": "Incorrect code", "attemptsRemaining": 2 }
```

---

## How It Works

### Core Principle

The CAPTCHA text is **never sent as plaintext** to the client:

1. **Server** renders text into a pixelated **alpha bitmap** (just pixels, no font data)
2. **Server** encrypts the bitmap with **AES-256-GCM**
3. **Client** WASM decrypts and uses the bitmap as a **mask**
4. Two independent binary noise layers scroll in different directions:
   - **Background noise**: fills the entire canvas
   - **Text noise**: only visible through the mask (where text pixels exist)
5. Because the two noise layers move in **guaranteed different directions**, the human eye perceives the text outline through motion contrast
6. A single **screenshot** captures both layers frozen, making the text invisible

### Security Features

| Attack Vector | Defense |
|---------------|---------|
| Screenshot/OCR | Both noise layers frozen → text invisible |
| Frame averaging | Jitter + temporal phase + noise regeneration |
| Canvas API hooking | No `fillText()` calls — raw `putImageData` only |
| WASM reverse engineering | Bitmap encrypted; text never in client memory |
| Challenge replay | Single-use tokens, deleted after verification |
| Rate limiting | Built-in per-IP limits |

---

## Project Structure

```
noise-wasm/
├── server/                      ← CAPTCHA Server (Standalone)
│   ├── src/
│   │   ├── index.ts             ← HTTP server & routes
│   │   ├── config.ts            ← All configuration
│   │   ├── captcha.ts           ← Challenge generation & verification
│   │   ├── crypto.ts            ← AES encryption & token generation
│   │   ├── glyph-renderer.ts    ← Text → alpha bitmap
│   │   ├── env.ts               ← Environment variables
│   │   ├── cors.ts              ← CORS middleware
│   │   └── rate-limit.ts        ← Rate limiting
│   ├── public/
│   │   ├── captcha.js     ← Self-contained widget (served as /captcha.js)
│   │   ├── debug.html           ← Debug controller
│   │   └── pkg/                 ← Built WASM artifacts
│   ├── wasm/                    ← Rust WASM source
│   │   └── src/
│   │       ├── lib.rs           ← CaptchaEngine
│   │       ├── decrypt.rs       ← AES-256-GCM decryption
│   │       ├── noise.rs         ← Binary noise generation
│   │       └── renderer.rs      ← Frame compositing
│   └── scripts/
│       ├── build-wasm.sh
│       └── dev.sh
│
├── demo-server/                 ← Demo Site (Optional)
│   ├── src/index.ts             ← Static server with login demo
│   └── public/
│       ├── index.html           ← Landing page
│       ├── demo.html            ← Interactive demo
│       └── login.html           ← Login form demo
│
├── docs/                        ← Documentation
│   ├── SERVER.md
│   ├── CLIENT.md
│   ├── CONFIG.md
│   ├── DEPLOYMENT.md
│   └── WASM.md
│
├── docker-compose.yml
├── docker-compose.prod.yml
└── Dockerfile
```

---

## Configuration

All configuration is in **`server/src/config.ts`**.

### Key Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `CANVAS.width` | 300 | Widget width |
| `CANVAS.height` | 100 | Widget height |
| `CANVAS.cellSize` | 1 | Noise block size |
| `DIRECTION_SAFETY.minDirectionGap` | 60 | Min angle between noise directions |
| `TIMING.stepMs` | 32 | Animation step interval (~30fps) |
| `SECURITY.jitterEnabled` | true | Per-frame random offset |
| `SECURITY.jitterMagnitude` | 3 | Max jitter pixels |
| `CAPTCHA_TEXT.codeLength` | 5 | Characters in code |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `NODE_ENV` | development | Environment mode |
| `ALLOWED_ORIGINS` | * | CORS allowed origins |
| `DEBUG_MODE` | false | Enable debug endpoints |
| `RATE_LIMIT_CHALLENGE` | 30 | Challenges per minute per IP |
| `MAX_ATTEMPTS` | 3 | Verification attempts per challenge |

---

## Demo Server (Optional)

The `demo-server/` folder contains a landing page and demo site. It's completely independent from the CAPTCHA server.

### Running the Demo

```bash
# Terminal 1: CAPTCHA server
cd server && bun run dev

# Terminal 2: Demo server
cd demo-server && bun run dev
```

- Landing page: http://localhost:4000/
- CAPTCHA demo: http://localhost:4000/demo.html
- Login demo: http://localhost:4000/login.html

The demo pages load the CAPTCHA widget directly from `http://localhost:3000/captcha.js`.

---

## Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure `ALLOWED_ORIGINS` for your domains
- [ ] Enable HTTPS
- [ ] Review rate limiting settings
- [ ] Disable `DEBUG_MODE`

### Docker Production

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Generate Secure Secrets

```bash
openssl rand -base64 32

# AES keys (optional)
openssl rand -hex 32  # AES_KEY_SEED
openssl rand -hex 32  # AES_KEY_MASK
```

---

## Documentation

- [Server Architecture](docs/SERVER.md)
- [Client Widget](docs/CLIENT.md)
- [Configuration Reference](docs/CONFIG.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [WASM Engine](docs/WASM.md)

---

## License

MIT
