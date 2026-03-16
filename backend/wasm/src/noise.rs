/// Fast xorshift64 PRNG — deterministic, no syscalls.
pub struct Rng {
    state: u64,
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self {
            state: if seed == 0 { 0x12345678_9ABCDEF0 } else { seed },
        }
    }

    #[inline(always)]
    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.state = x;
        x
    }

    /// Returns 0 or 255 with ~50/50 probability (binary noise).
    #[inline(always)]
    pub fn binary(&mut self) -> u8 {
        if self.next_u64() & 1 == 0 { 0 } else { 255 }
    }

    /// Returns a value in [0, bound) — NOT crypto-quality, just for jitter.
    #[inline(always)]
    pub fn bounded(&mut self, bound: u32) -> u32 {
        (self.next_u64() % bound as u64) as u32
    }
}

/// Generate a binary noise RGBA buffer.
/// Each `cell_size × cell_size` block is either black or white.
pub fn generate_noise_buffer(width: u32, height: u32, cell_size: u32, rng: &mut Rng) -> Vec<u8> {
    let len = (width * height * 4) as usize;
    let mut buf = vec![0u8; len];

    for cy in (0..height).step_by(cell_size as usize) {
        for cx in (0..width).step_by(cell_size as usize) {
            let color = rng.binary();
            for dy in 0..cell_size {
                let y = cy + dy;
                if y >= height {
                    break;
                }
                for dx in 0..cell_size {
                    let x = cx + dx;
                    if x >= width {
                        break;
                    }
                    let i = ((y * width + x) * 4) as usize;
                    buf[i] = color;
                    buf[i + 1] = color;
                    buf[i + 2] = color;
                    buf[i + 3] = 255;
                }
            }
        }
    }

    buf
}
