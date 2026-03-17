# ══════════════════════════════════════════════════════════════
# Noise CAPTCHA Server - Production Dockerfile
# ══════════════════════════════════════════════════════════════
# 
# Multi-stage build for minimal production image.
# Uses Bun runtime for optimal performance.

FROM oven/bun:1.3.10-alpine AS base

WORKDIR /app

# ─── Install dependencies ───────────────────────────────────────
FROM base AS deps

# Copy package files
COPY package.json bun.lock* ./

# Install server dependencies
RUN bun install --frozen-lockfile --production

# ─── Build WASM (if needed) ─────────────────────────────────────
# Use BUILDPLATFORM for wasm-builder so that cargo natively compiles 
# WebAssembly without CPU emulation on arm64/amd64 hosts.
FROM --platform=$BUILDPLATFORM rust:1.88-slim AS wasm-builder

# Install wasm-pack
RUN cargo install wasm-pack

WORKDIR /app
# Copy the entire backend source so the script works correctly
COPY . .

# Build WASM using the reference script
RUN chmod +x scripts/build-wasm.sh && ./scripts/build-wasm.sh

# ─── Production image ───────────────────────────────────────────
FROM base AS production

# Install canvas dependencies for glyph rendering
RUN apk add --no-cache \
    cairo \
    pango \
    giflib \
    librsvg \
    pixman

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy server source
COPY src ./src
COPY package.json ./

# Copy public files (captcha.js, debug.html)
COPY public ./public

# Copy WASM build output
COPY --from=wasm-builder /app/public/engine.js ./public/engine.js
COPY --from=wasm-builder /app/public/engine.wasm ./public/engine.wasm

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Run server
CMD ["bun", "run", "src/index.ts"]
