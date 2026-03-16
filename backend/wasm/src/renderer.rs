/// Composite a full frame:
///   1. Background noise (tiled with offset)
///   2. Text noise (tiled with offset, masked by glyph bitmap)
///
/// Both bg_noise and text_noise are RGBA flat arrays.
/// This is the pixel-level equivalent of the reference HTML's
/// renderNoise() + drawTextNoise() compositing pipeline.
pub fn composite_frame(
    output: &mut [u8],
    viewport_w: u32,
    viewport_h: u32,
    // Background noise buffer (3× viewport dimensions)
    bg_noise: &[u8],
    bg_noise_w: u32,
    bg_noise_h: u32,
    bg_offset_x: i32,
    bg_offset_y: i32,
    // Text noise buffer (kept for API compat, unused — we sample bg_noise for both)
    _text_noise: &[u8],
    _text_noise_w: u32,
    _text_noise_h: u32,
    text_offset_x: i32,
    text_offset_y: i32,
    // Glyph mask (alpha only)
    mask_alpha: &[u8],
    mask_w: u32,
    mask_h: u32,
    // Anti-averaging
    jitter_x: i32,
    jitter_y: i32,
    temporal_phase: f32, // 0.0..1.0 brightness multiplier
    cell_size: u32,
) {
    let vw = viewport_w as i32;
    let vh = viewport_h as i32;
    let bw = bg_noise_w as i32;
    let bh = bg_noise_h as i32;

    // --- Step 1: Background noise (tiled blit with offset) ---
    // Compute wrapped offset so it stays positive
    let ox = ((bg_offset_x % bw) + bw) % bw;
    let oy = ((bg_offset_y % bh) + bh) % bh;

    for y in 0..vh {
        for x in 0..vw {
            let sx = ((x + ox) % bw) as usize;
            let sy = ((y + oy) % bh) as usize;
            let src_i = (sy * bg_noise_w as usize + sx) * 4;
            let dst_i = (y as usize * viewport_w as usize + x as usize) * 4;
            if src_i + 3 < bg_noise.len() && dst_i + 3 < output.len() {
                output[dst_i] = bg_noise[src_i];
                output[dst_i + 1] = bg_noise[src_i + 1];
                output[dst_i + 2] = bg_noise[src_i + 2];
                output[dst_i + 3] = 255;
            }
        }
    }

    // --- Step 2: Text region — same noise buffer, different scroll offset ---
    // By sampling the SAME bg_noise buffer with a different offset for text
    // pixels, there is NO detectable seam at the mask boundary in any single
    // frame.  Text is visible only through motion (different scroll direction).
    if mask_w == 0 || mask_h == 0 {
        return;
    }

    // Center the mask in the viewport, snapped to cell grid, THEN apply jitter
    let cx = vw / 2;
    let cy = vh / 2;
    let cs = cell_size as i32;
    // First, calculate grid-snapped base position (without jitter)
    let base_left = if cs > 0 {
        ((cx - mask_w as i32 / 2 + cs / 2) / cs) * cs
    } else {
        cx - mask_w as i32 / 2
    };
    let base_top = if cs > 0 {
        ((cy - mask_h as i32 / 2 + cs / 2) / cs) * cs
    } else {
        cy - mask_h as i32 / 2
    };
    // Then apply jitter as raw pixel offset (not grid-snapped)
    let left = base_left + jitter_x;
    let top = base_top + jitter_y;

    // Wrapped text scroll offset into the bg_noise buffer
    let text_ox = ((text_offset_x % bw) + bw) % bw;
    let text_oy = ((text_offset_y % bh) + bh) % bh;

    for my in 0..mask_h as i32 {
        let dst_y = top + my;
        if dst_y < 0 || dst_y >= vh {
            continue;
        }
        for mx in 0..mask_w as i32 {
            let dst_x = left + mx;
            if dst_x < 0 || dst_x >= vw {
                continue;
            }

            let mask_idx = (my as u32 * mask_w + mx as u32) as usize;
            if mask_idx >= mask_alpha.len() || mask_alpha[mask_idx] == 0 {
                continue;
            }

            // Sample the SAME bg_noise buffer with the text scroll offset
            let tnx = ((dst_x + text_ox) % bw) as usize;
            let tny = ((dst_y + text_oy) % bh) as usize;
            let tn_idx = (tny * bg_noise_w as usize + tnx) * 4;

            let dst_idx = (dst_y as usize * viewport_w as usize + dst_x as usize) * 4;

            if tn_idx + 2 < bg_noise.len() && dst_idx + 3 < output.len() {
                // Apply temporal phase to modulate brightness
                let r = (bg_noise[tn_idx] as f32 * temporal_phase) as u8;
                let g = (bg_noise[tn_idx + 1] as f32 * temporal_phase) as u8;
                let b = (bg_noise[tn_idx + 2] as f32 * temporal_phase) as u8;
                output[dst_idx] = r;
                output[dst_idx + 1] = g;
                output[dst_idx + 2] = b;
                output[dst_idx + 3] = 255;
            }
        }
    }
}
