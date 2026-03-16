# ══════════════════════════════════════════════════════════════
# Noise CAPTCHA Frontend - Production Dockerfile
# ══════════════════════════════════════════════════════════════

FROM oven/bun:1.2-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install

# Copy source
COPY . .

# Build Vite project (requires typescript)
RUN bun run build

# ─── Production image ───────────────────────────────────────────
FROM oven/bun:1.2-alpine AS runner

WORKDIR /app

# Copy built dist
COPY --from=builder /app/dist ./dist

# Copy the server script
COPY server.ts ./server.ts

# Set environment
ENV NODE_ENV=production
ENV PORT=5173

# Expose port
EXPOSE 5173

# Run the minimal server
CMD ["bun", "run", "server.ts"]
