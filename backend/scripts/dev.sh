#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== Noise CAPTCHA Dev Server ==="

# Step 1: Build WASM
bash scripts/build-wasm.sh

# Step 2: Install server dependencies
echo ""
echo "=== Installing server dependencies ==="
bun install

# Step 3: Start server
echo ""
echo "=== Starting server on http://localhost:3000 ==="
echo "  → API:        http://localhost:3000/health"
echo "  → Widget:     http://localhost:3000/captcha.js"
echo "  → Debug:      http://localhost:3000/debug (DEBUG_MODE=true)"
echo ""
DEBUG_MODE=true bun run --watch src/index.ts
