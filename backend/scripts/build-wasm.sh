#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Load optional env for key material injection at build time.
if [[ -f ./.env ]]; then
    set -a
    # shellcheck disable=SC1091
    source ./.env
    set +a
fi

echo "=== Building WASM (release) ==="
cd wasm

BUILD_OUT_DIR="$(mktemp -d ../.wasm-build.XXXXXX)"
cleanup() {
    rm -rf "$BUILD_OUT_DIR"
}
trap cleanup EXIT

# Ensure wasm-pack is available
if ! command -v wasm-pack &> /dev/null; then
    echo "Installing wasm-pack..."
    cargo install wasm-pack
fi

# Build with wasm-pack targeting web (ESM module)
AES_KEY_SEED_HEX="${AES_KEY_SEED:-}" \
AES_KEY_MASK_HEX="${AES_KEY_MASK:-}" \
AES_KEY_SEED_PREV_HEX="${AES_KEY_SEED_PREV:-}" \
AES_KEY_MASK_PREV_HEX="${AES_KEY_MASK_PREV:-}" \
wasm-pack build --target web --release --out-dir "$BUILD_OUT_DIR"

# Optional: further optimize with wasm-opt if available
if command -v wasm-opt &> /dev/null; then
    echo "Running wasm-opt..."
    wasm-opt -Oz --strip-debug --strip-producers \
    "$BUILD_OUT_DIR/noise_captcha_wasm_bg.wasm" \
    -o "$BUILD_OUT_DIR/noise_captcha_wasm_bg.wasm"
fi

# Publish canonical public asset names
cp "$BUILD_OUT_DIR/noise_captcha_wasm.js" ../public/engine.js
cp "$BUILD_OUT_DIR/noise_captcha_wasm_bg.wasm" ../public/engine.wasm

# Rewrite generated glue to point to canonical wasm filename
if command -v perl &> /dev/null; then
    perl -0pi -e "s/noise_captcha_wasm_bg\\.wasm/engine.wasm/g" ../public/engine.js
else
    sed -i.bak "s/noise_captcha_wasm_bg\.wasm/engine.wasm/g" ../public/engine.js
    rm -f ../public/engine.js.bak
fi

# Do not publish TypeScript declaration artifacts
rm -f ../public/noise_captcha_wasm.d.ts ../public/noise_captcha_wasm_bg.wasm.d.ts

echo "✅ WASM build complete"
echo "   Public assets:"
ls -lh ../public/engine.js ../public/engine.wasm
