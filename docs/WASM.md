# WASM Engine

The Rust/WASM crate is the core rendering engine. It runs entirely in the browser's WASM sandbox.

## Overview

```
wasm/
├── Cargo.toml
└── src/
    ├── lib.rs        ← CaptchaEngine struct + WASM bindings
    ├── decrypt.rs    ← AES-256-GCM decryption
    ├── noise.rs      ← Xorshift64 PRNG + binary noise generation
    └── renderer.rs   ← Frame compositing
```

## CaptchaEngine

The main struct exposed to JavaScript.

### Fields

```rust
pub struct CaptchaEngine {
    // Canvas dimensions
    viewport_w: u32,
    viewport_h: u32,
    cell_size: u32,

    // Decrypted glyph mask
    mask_bitmap: Vec<u8>,     // Alpha-only (0=bg, 255=text)
    mask_w: u32,
    mask_h: u32,

    // Noise buffers (RGBA, pre-generated)
    bg_noise: Vec<u8>,        // 2× viewport size
    text_noise: Vec<u8>,      // mask dimensions

    // Scroll state
    bg_offset_x: f64,
    bg_offset_y: f64,
    text_offset_x: f64,
    text_offset_y: f64,

    // Animation parameters
    bg_direction_deg: f64,
    bg_speed: f64,
    text_direction_deg: f64,
    text_speed: f64,
    step_ms: f64,

    // Anti-averaging
    jitter_enabled: bool,
    jitter_magnitude: i32,
    temporal_phase_enabled: bool,
    noise_regen_interval: u32,
}
```

### Constructor

```rust
pub fn new(
    viewport_w: u32,
    viewport_h: u32,
    cell_size: u32,
    encrypted_payload: &[u8]
) -> CaptchaEngine
```

1. Decrypts payload using AES-256-GCM
2. Parses bitmap dimensions and alpha data
3. Seeds PRNGs using `crypto.getRandomValues`
4. Generates noise buffers

### Methods

| Method | Description |
|--------|-------------|
| `step(delta_ms)` | Advance animation state |
| `render_frame(ctx)` | Composite and draw to canvas |
| `set_text_direction(deg)` | Set text noise direction |
| `set_bg_direction(deg)` | Set background noise direction |
| `set_text_speed(px)` | Set text scroll speed |
| `set_bg_speed(px)` | Set background scroll speed |
| `set_step_ms(ms)` | Set animation step interval |
| `set_jitter_enabled(bool)` | Toggle jitter |
| `set_jitter_magnitude(px)` | Set max jitter |
| `set_temporal_phase_enabled(bool)` | Toggle brightness modulation |
| `set_noise_regen_interval(frames)` | Set noise regeneration interval |
| `regenerate_noise()` | Force regenerate all noise |

## Decryption

### Encrypted Payload Format

```
[nonce: 12 bytes][ciphertext][auth_tag: 16 bytes]
```

### Decrypted Payload Format

```
[mask_w: u16 LE][mask_h: u16 LE][direction header: 12 bytes][alpha bitmap]
```

### Key Derivation

```rust
const KEY_SEED: [u8; 32] = [ /* ... */ ];
const KEY_MASK: [u8; 32] = [ /* ... */ ];

// Derived at compile time:
let key: [u8; 32] = KEY_SEED.iter()
    .zip(KEY_MASK.iter())
    .map(|(a, b)| a ^ b)
    .collect();
```

⚠️ **Must match** `backend/src/crypto.ts` exactly.

## Noise Generation

Uses Xorshift64 PRNG for fast binary noise generation.

```rust
fn xorshift64(state: &mut u64) -> u64 {
    let mut x = *state;
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    *state = x;
    x
}
```

### Binary Noise

Each pixel is either black (0) or white (255):

```rust
let bit = (random_value >> bit_index) & 1;
let value = if bit == 1 { 255u8 } else { 0u8 };
```

## Frame Compositing

### Step 1: Update Offsets

```rust
// Convert direction (degrees) to velocity components
let rad = direction * PI / 180.0;
let dx = rad.cos() * speed;
let dy = rad.sin() * speed;

offset_x += dx;
offset_y += dy;

// Wrap around
offset_x = offset_x.rem_euclid(width);
offset_y = offset_y.rem_euclid(height);
```

### Step 2: Composite Layers

```rust
for each pixel (x, y):
    // Sample background noise (with offset)
    bg_color = sample_bg_noise(x + bg_offset, y + bg_offset);
    
    // Sample mask (with jitter)
    mask_alpha = sample_mask(x + jitter_x, y + jitter_y);
    
    if mask_alpha > 0:
        // Text pixel: use text noise
        text_color = sample_text_noise(x + text_offset, y + text_offset);
        
        // Apply temporal phase (optional)
        if temporal_phase_enabled:
            brightness = sin(time) * 0.25 + 0.75;
            text_color *= brightness;
        
        output = text_color;
    else:
        // Background pixel
        output = bg_color;
```

### Step 3: Write to Canvas

Uses `putImageData` to write raw RGBA buffer:

```rust
let image_data = ImageData::new_with_u8_clamped_array(
    Clamped(&frame_buffer),
    viewport_w
)?;
ctx.put_image_data(&image_data, 0.0, 0.0)?;
```

## Building

```bash
cd backend
bash scripts/build-wasm.sh
```

Or manually:

```bash
cd backend/wasm
wasm-pack build --target web --out-dir ../.wasm-build.tmp --release
```

### Output Files

| File | Size | Purpose |
|------|------|---------|
| `engine.js` | ~18 KB | ESM glue code (published asset) |
| `engine.wasm` | ~65 KB | Compiled WASM (published asset) |

## Dependencies

```toml
[dependencies]
wasm-bindgen = "0.2"
js-sys = "0.3"
web-sys = "0.3"
getrandom = { version = "0.2", features = ["js"] }
aes-gcm = "0.10"
```

## Memory Usage

Background noise buffer:
```
size = (viewport_w * 2) * (viewport_h * 2) * 4 bytes
300×100 → 300*2 * 100*2 * 4 = 480 KB
960×540 → 960*2 * 540*2 * 4 = ~8 MB
```

## Security Considerations

1. **Key Protection**: Keys are XOR-obfuscated in binary
2. **No Canvas Text APIs**: Only `putImageData` is used
3. **PRNG Quality**: Xorshift64 is fast but not cryptographically secure (OK for display)
4. **Memory Isolation**: WASM sandbox prevents JS access to internal state
5. **Debug Mode Locked**: `enable_debug_mode()` is compiled with `#[cfg(debug_assertions)]` — it is **entirely absent** from release WASM builds, preventing attackers from calling it to pause the animation
