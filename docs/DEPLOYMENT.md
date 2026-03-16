# Deployment Guide

## Quick Start

### Development

```bash
cd backend
bun install
bun run dev
```

Server runs at `http://localhost:3000`

### Production

```bash
cd backend
bun install
NODE_ENV=production bun run src/index.ts
```

## Docker

### Development

```bash
docker compose up
```

### Production

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set `AES_KEY_SEED` and `AES_KEY_MASK` (64 hex chars each)
- [ ] Configure `ALLOWED_ORIGINS` for your domains
- [ ] Enable HTTPS (use reverse proxy or cloud load balancer)
- [ ] Review rate limiting settings
- [ ] Set `DEBUG_MODE=false`
- [ ] Confirm `/health` returns `status: ok` after startup (AES key validation runs at boot)
- [ ] Set `REDIS_URL` to a shared Redis instance for production

## Environment Variables

### Required

```bash
NODE_ENV=production
```

### Recommended

```bash
ALLOWED_ORIGINS=https://example.com,https://www.example.com
RATE_LIMIT_CHALLENGE=20
RATE_LIMIT_VERIFY=40
RATE_LIMIT_VALIDATE_TOKEN=40
DEBUG_MODE=false
```

### Generate Secrets

```bash
# AES keys (optional - for custom encryption keys)
openssl rand -hex 32  # AES_KEY_SEED
openssl rand -hex 32  # AES_KEY_MASK
```

## HTTPS Configuration

The CAPTCHA server should be behind HTTPS. Options:

### Option 1: Reverse Proxy (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name captcha.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Option 2: Cloud Load Balancer

Use AWS ALB, GCP Load Balancer, or Cloudflare with SSL termination.

## Multi-Instance Deployment

For high availability, run multiple instances behind a load balancer.

### Challenge Storage

This service already uses Redis for challenges, tokens, and rate limiting.

For multi-instance deployment, all instances must point to the same Redis:

```bash
REDIS_URL=redis://shared-redis-host:6379
```

### Docker Compose with Redis

```bash
docker compose --profile redis up -d
```

## Integration

### Add to Your Website

```html
<script src="https://captcha.example.com/captcha.js"></script>
<div data-noise-captcha></div>
```

### Server-Side Token Validation

```javascript
// Your backend
const response = await fetch('https://captcha.example.com/api/captcha/validate-token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: captchaToken, secret: process.env.CAPTCHA_SECRET_KEY })
});
const { valid } = await response.json();
```

## Monitoring

### Health Check

```bash
curl https://captcha.example.com/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "uptime": 3600,
  "metrics": {
    "activeChallenges": 12,
    "riskBuckets": 5,
    "memoryMB": 48
  }
}
```

### Metrics to Monitor

- Challenge request rate
- Verification success rate
- Token validation rate
- Response latency
- Error rate

## Troubleshooting

### CORS Errors

Check `ALLOWED_ORIGINS` includes your domain:
```bash
ALLOWED_ORIGINS=https://example.com,https://www.example.com
```

### Token Validation Failures

1. Check token hasn't expired (`TOKEN_EXPIRY_SECONDS`, default 300s)
2. Tokens are single-use — each token can only be validated once
3. Ensure you're using the correct `secret` (the `nc_sk_*` key that matches the `siteKey` used when the challenge was created)
4. Never send `secret` from browser code. Validate tokens from your server only.

### WASM Loading Issues

1. Verify `/engine.js` and `/engine.wasm` are served with correct MIME types
2. Check browser console for CORS errors
3. Ensure wasm file is served with `application/wasm` content type

### Rate Limiting

If users are being rate limited:
```bash
RATE_LIMIT_CHALLENGE=50
RATE_LIMIT_VERIFY=100
```
