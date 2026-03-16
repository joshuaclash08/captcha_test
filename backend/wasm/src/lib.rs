use wasm_bindgen::prelude::*;
use wasm_bindgen::Clamped;
use web_sys::{CanvasRenderingContext2d, ImageData};

mod decrypt;
mod noise;
mod renderer;

use noise::Rng;

/// The main CAPTCHA rendering engine, fully self-contained in WASM.
///
/// All rendering is done by producing raw RGBA pixel buffers and writing them
/// to the canvas via `putImageData` — no `fillText` or other high-level
/// Canvas API calls are ever made, preventing API-hooking attacks.
/// 
/// The encrypted payload now includes noise configuration to prevent MITM tampering.
/// Attackers cannot modify animation parameters (speed, direction, jitter) without
/// breaking the AES-GCM authentication tag.
#[wasm_bindgen]
pub struct CaptchaEngine {
    // Canvas dimensions (CSS pixels)
    viewport_w: u32,
    viewport_h: u32,
    cell_size: u32,

    // Decrypted glyph mask (alpha-only, mask_w × mask_h)
    mask_bitmap: Vec<u8>,
    mask_w: u32,
    mask_h: u32,

    // Pre-generated noise buffers
    bg_noise: Vec<u8>,   // (viewport_w*3) × (viewport_h*3) RGBA
    bg_noise_w: u32,
    bg_noise_h: u32,
    text_noise: Vec<u8>, // mask_w × mask_h RGBA
    text_noise_w: u32,
    text_noise_h: u32,

    // Scroll offsets (sub-pixel accumulated)
    bg_offset_x: f64,
    bg_offset_y: f64,
    text_offset_x: f64,
    text_offset_y: f64,

    // Parameters — extracted from encrypted payload (tamper-proof)
    bg_direction_deg: f64,
    bg_speed: f64,
    text_direction_deg: f64,
    text_speed: f64,
    step_ms: f64,

    // Timing
    accumulated_ms: f64,

    // Frame counter (for temporal effects)
    frame_count: u32,

    // Output buffer (reused each frame)
    output: Vec<u8>,

    // PRNGs
    noise_rng: Rng,
    jitter_rng: Rng,

    // Anti-averaging settings (from encrypted payload)
    jitter_enabled: bool,
    jitter_magnitude: i32,
    temporal_phase_enabled: bool,
    noise_regen_interval: u32, // frames between text-noise regeneration
    
    // Flag indicating if config was loaded from secure payload
    config_from_payload: bool,
}

/// Payload header size (noiseConfig embedded in encrypted payload)
const PAYLOAD_HEADER_SIZE: usize = 16;

#[wasm_bindgen]
impl CaptchaEngine {
    /// Create a new engine.
    /// `encrypted_payload` is the AES-256-GCM encrypted glyph bitmap + noise config from the server.
    /// 
    /// Decrypted payload format (16-byte header + bitmap):
    /// ```
    /// [mask_w: u16 LE]              (2 bytes) - bytes 0-1
    /// [mask_h: u16 LE]              (2 bytes) - bytes 2-3
    /// [textDirection: u16 LE]       (2 bytes) - bytes 4-5
    /// [bgDirection: u16 LE]         (2 bytes) - bytes 6-7
    /// [textSpeed: u8]               (1 byte)  - byte 8
    /// [bgSpeed: u8]                 (1 byte)  - byte 9
    /// [stepMs: u16 LE]              (2 bytes) - bytes 10-11
    /// [flags: u8]                   (1 byte)  - byte 12
    /// [jitterMagnitude: u8]         (1 byte)  - byte 13
    /// [noiseRegenInterval: u16 LE]  (2 bytes) - bytes 14-15
    /// [alpha bitmap bytes]          (N bytes) - bytes 16+
    /// ```
    /// 
    /// Flags byte: bit0 = jitterEnabled, bit1 = temporalPhaseEnabled
    #[wasm_bindgen(constructor)]
    pub fn new(
        viewport_w: u32,
        viewport_h: u32,
        cell_size: u32,
        encrypted_payload: &[u8],
    ) -> Result<CaptchaEngine, JsValue> {
        // Decrypt payload
        let decrypted = decrypt::decrypt_payload(encrypted_payload)
            .map_err(|e| JsValue::from_str(&e))?;

        if decrypted.len() < PAYLOAD_HEADER_SIZE {
            return Err(JsValue::from_str("Decrypted payload too short for header"));
        }

        // Parse header
        let mask_w = u16::from_le_bytes([decrypted[0], decrypted[1]]) as u32;
        let mask_h = u16::from_le_bytes([decrypted[2], decrypted[3]]) as u32;
        let text_direction = u16::from_le_bytes([decrypted[4], decrypted[5]]) as f64;
        let bg_direction = u16::from_le_bytes([decrypted[6], decrypted[7]]) as f64;
        let text_speed = decrypted[8] as f64;
        let bg_speed = decrypted[9] as f64;
        let step_ms = u16::from_le_bytes([decrypted[10], decrypted[11]]) as f64;
        let flags = decrypted[12];
        let jitter_enabled = (flags & 0x01) != 0;
        let temporal_phase_enabled = (flags & 0x02) != 0;
        let jitter_magnitude = decrypted[13] as i32;
        let noise_regen_interval = u16::from_le_bytes([decrypted[14], decrypted[15]]) as u32;
        
        let expected = (mask_w * mask_h) as usize;

        if decrypted.len() - PAYLOAD_HEADER_SIZE < expected {
            return Err(JsValue::from_str(&format!(
                "Bitmap size mismatch: expected {} bytes for {}x{}, got {}",
                expected,
                mask_w,
                mask_h,
                decrypted.len() - PAYLOAD_HEADER_SIZE
            )));
        }

        let mask_bitmap = decrypted[PAYLOAD_HEADER_SIZE..PAYLOAD_HEADER_SIZE + expected].to_vec();

        // Initialize PRNGs with different seeds
        let mut seed_buf = [0u8; 16];
        getrandom::getrandom(&mut seed_buf).ok();
        let seed1 = u64::from_le_bytes(seed_buf[0..8].try_into().unwrap());
        let seed2 = u64::from_le_bytes(seed_buf[8..16].try_into().unwrap());

        let mut noise_rng = Rng::new(seed1);
        let jitter_rng = Rng::new(seed2);

        // Generate background noise (2× viewport for seamless tiling)
        let bg_noise_w = viewport_w * 2;
        let bg_noise_h = viewport_h * 2;
        let bg_noise =
            noise::generate_noise_buffer(bg_noise_w, bg_noise_h, cell_size, &mut noise_rng);

        // Generate text noise (mask dimensions)
        let text_noise_w = mask_w;
        let text_noise_h = mask_h;
        let text_noise =
            noise::generate_noise_buffer(text_noise_w, text_noise_h, cell_size, &mut noise_rng);

        let output_len = (viewport_w * viewport_h * 4) as usize;

        Ok(CaptchaEngine {
            viewport_w,
            viewport_h,
            cell_size,
            mask_bitmap,
            mask_w,
            mask_h,
            bg_noise,
            bg_noise_w,
            bg_noise_h,
            text_noise,
            text_noise_w,
            text_noise_h,
            bg_offset_x: 0.0,
            bg_offset_y: 0.0,
            text_offset_x: 0.0,
            text_offset_y: 0.0,
            // Parameters from encrypted payload (tamper-proof)
            bg_direction_deg: bg_direction,
            bg_speed,
            text_direction_deg: text_direction,
            text_speed,
            step_ms,
            accumulated_ms: 0.0,
            frame_count: 0,
            output: vec![0u8; output_len],
            noise_rng,
            jitter_rng,
            // Security settings from encrypted payload
            jitter_enabled,
            jitter_magnitude,
            temporal_phase_enabled,
            noise_regen_interval,
            config_from_payload: true,
        })
    }

    /// Advance animation state by `delta_ms` milliseconds.
    /// Returns `true` if a step was taken (offsets changed).
    pub fn step(&mut self, delta_ms: f64) -> bool {
        self.accumulated_ms += delta_ms;
        if self.accumulated_ms < self.step_ms {
            return false;
        }
        // Consume one step
        self.accumulated_ms -= self.step_ms;

        let bg_rad = self.bg_direction_deg * std::f64::consts::PI / 180.0;
        self.bg_offset_x += bg_rad.cos() * self.bg_speed;
        self.bg_offset_y += bg_rad.sin() * self.bg_speed;

        let text_rad = self.text_direction_deg * std::f64::consts::PI / 180.0;
        self.text_offset_x += text_rad.cos() * self.text_speed;
        self.text_offset_y += text_rad.sin() * self.text_speed;

        // Regenerate text noise periodically to defeat long-term frame averaging
        self.frame_count += 1;
        if self.noise_regen_interval > 0 && self.frame_count % self.noise_regen_interval == 0 {
            self.text_noise = noise::generate_noise_buffer(
                self.text_noise_w,
                self.text_noise_h,
                self.cell_size,
                &mut self.noise_rng,
            );
        }

        true
    }

    /// Render one frame and write it to the canvas via `putImageData`.
    pub fn render_frame(&mut self, ctx: &CanvasRenderingContext2d) -> Result<(), JsValue> {
        // Calculate jitter
        let (jx, jy) = if self.jitter_enabled && self.jitter_magnitude > 0 {
            let mag = self.jitter_magnitude as u32;
            let jx = self.jitter_rng.bounded(mag * 2 + 1) as i32 - self.jitter_magnitude;
            let jy = self.jitter_rng.bounded(mag * 2 + 1) as i32 - self.jitter_magnitude;
            (jx, jy)
        } else {
            (0, 0)
        };

        // Calculate temporal phase
        let phase = if self.temporal_phase_enabled {
            let t = self.frame_count as f32 * 0.08;
            t.sin() * 0.25 + 0.75 // oscillates 0.5 .. 1.0
        } else {
            1.0
        };

        // Composite
        renderer::composite_frame(
            &mut self.output,
            self.viewport_w,
            self.viewport_h,
            &self.bg_noise,
            self.bg_noise_w,
            self.bg_noise_h,
            self.bg_offset_x as i32,
            self.bg_offset_y as i32,
            &self.text_noise,
            self.text_noise_w,
            self.text_noise_h,
            self.text_offset_x as i32,
            self.text_offset_y as i32,
            &self.mask_bitmap,
            self.mask_w,
            self.mask_h,
            jx,
            jy,
            phase,
            self.cell_size,
        );

        // Write to canvas via ImageData (bypasses all Canvas drawing APIs)
        let data = ImageData::new_with_u8_clamped_array_and_sh(
            Clamped(&self.output),
            self.viewport_w,
            self.viewport_h,
        )?;
        ctx.put_image_data(&data, 0.0, 0.0)?;

        Ok(())
    }

    // === Setters for debug controls ===
    // NOTE: When config_from_payload is true (production mode), these setters
    // are no-ops to prevent MITM attacks from overriding encrypted config values.
    // The noiseConfig in the API response is for informational purposes only;
    // actual values come from the encrypted payload.
    //
    // In release builds, enable_debug_mode is excluded entirely via cfg,
    // so setters can never be unlocked in production WASM.

    /// Enable debug mode to allow runtime config changes.
    /// WARNING: Only available in debug builds — excluded from release WASM.
    #[cfg(debug_assertions)]
    pub fn enable_debug_mode(&mut self) {
        self.config_from_payload = false;
    }
    
    /// Check if config was securely loaded from encrypted payload
    pub fn is_config_secure(&self) -> bool {
        self.config_from_payload
    }

    pub fn set_bg_direction(&mut self, deg: f64) {
        if !self.config_from_payload {
            self.bg_direction_deg = deg;
        }
    }
    pub fn set_bg_speed(&mut self, speed: f64) {
        if !self.config_from_payload {
            self.bg_speed = speed;
        }
    }
    pub fn set_text_direction(&mut self, deg: f64) {
        if !self.config_from_payload {
            self.text_direction_deg = deg;
        }
    }
    pub fn set_text_speed(&mut self, speed: f64) {
        if !self.config_from_payload {
            self.text_speed = speed;
        }
    }
    pub fn set_step_ms(&mut self, ms: f64) {
        if !self.config_from_payload {
            self.step_ms = ms;
        }
    }
    pub fn set_jitter_enabled(&mut self, enabled: bool) {
        if !self.config_from_payload {
            self.jitter_enabled = enabled;
        }
    }
    pub fn set_jitter_magnitude(&mut self, mag: i32) {
        if !self.config_from_payload {
            self.jitter_magnitude = mag;
        }
    }
    pub fn set_temporal_phase_enabled(&mut self, enabled: bool) {
        if !self.config_from_payload {
            self.temporal_phase_enabled = enabled;
        }
    }
    pub fn set_noise_regen_interval(&mut self, frames: u32) {
        if !self.config_from_payload {
            self.noise_regen_interval = frames;
        }
    }

    // === Getters for debug controls ===

    pub fn get_bg_direction(&self) -> f64 {
        self.bg_direction_deg
    }
    pub fn get_bg_speed(&self) -> f64 {
        self.bg_speed
    }
    pub fn get_text_direction(&self) -> f64 {
        self.text_direction_deg
    }
    pub fn get_text_speed(&self) -> f64 {
        self.text_speed
    }
    pub fn get_step_ms(&self) -> f64 {
        self.step_ms
    }
    pub fn get_jitter_enabled(&self) -> bool {
        self.jitter_enabled
    }
    pub fn get_jitter_magnitude(&self) -> i32 {
        self.jitter_magnitude
    }
    pub fn get_temporal_phase_enabled(&self) -> bool {
        self.temporal_phase_enabled
    }
    pub fn get_noise_regen_interval(&self) -> u32 {
        self.noise_regen_interval
    }
    pub fn get_frame_count(&self) -> u32 {
        self.frame_count
    }
    pub fn get_viewport_w(&self) -> u32 {
        self.viewport_w
    }
    pub fn get_viewport_h(&self) -> u32 {
        self.viewport_h
    }

    /// Regenerate all noise buffers (e.g. after resize or manual refresh).
    pub fn regenerate_noise(&mut self) {
        self.bg_noise = noise::generate_noise_buffer(
            self.bg_noise_w,
            self.bg_noise_h,
            self.cell_size,
            &mut self.noise_rng,
        );
        self.text_noise = noise::generate_noise_buffer(
            self.text_noise_w,
            self.text_noise_h,
            self.cell_size,
            &mut self.noise_rng,
        );
    }
}
