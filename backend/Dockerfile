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
FROM rust:slim AS wasm-builder

# Install wasm-pack
RUN cargo install wasm-pack

WORKDIR /app/wasm
COPY wasm/ .

# Build WASM
RUN mkdir -p ../public/pkg
RUN wasm-pack build --release --target web --out-dir ../public/pkg

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
COPY --from=wasm-builder /app/public/pkg ./public/pkg

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
