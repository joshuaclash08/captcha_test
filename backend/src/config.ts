/**
 * ══════════════════════════════════════════════════════════════
 * Noise CAPTCHA — Centralized Configuration
 * ══════════════════════════════════════════════════════════════
 *
 * Single source of truth for ALL tunable parameters.
 * Edit this file to change defaults across the entire system.
 *
 * Values defined here are:
 *   1. Sent to the client in challenge responses (noise directions, speeds)
 *   2. Used server-side for challenge generation
 *   3. Referenced by the debug controller as initial slider values
 *
 * ── HOW TO TWEAK ──────────────────────────────────────────────
 *
 * CANVAS:
 *   width / height  → Default canvas size for production CAPTCHA widget.
 *   cellSize        → Pixel grid size (px). Larger = blockier noise.
 *                     2 is crisp on retina, 3–4 for a chunkier look.
 *   maxDebugWidth / maxDebugHeight
 *                   → Debug page canvas cap (WASM memory constraint).
 *                     bg noise buffer = 2× these dims in RGBA.
 *                     960×540 ≈ 4 MB. Don't exceed ~1280×720 without
 *                     increasing the WASM memory limit.
 *
 * NOISE DIRECTIONS (degrees, 0–360):
 *   textDirection   → Direction the text noise scrolls.
 *   bgDirection     → Direction the background noise scrolls.
 *   ⚠ These MUST differ by at least `minDirectionGap` degrees or the
 *     text becomes invisible.  The server enforces this automatically
 *     via `generateSafeDirections()`.
 *
 * NOISE SPEEDS (px per step):
 *   textSpeed       → Text noise scroll speed.
 *   bgSpeed         → Background noise scroll speed.
 *   minSpeed        → Floor for random speed generation (0 = allowed to
 *                     be static, but combined with direction overlap this
 *                     could make text invisible).
 *   maxSpeed        → Ceiling for random speed generation.
 *
 * TIMING:
 *   stepMs          → Milliseconds between animation steps.
 *                     16 = ~60 fps, 32 = ~30 fps, 50 = ~20 fps.
 *
 * ANTI-AVERAGING / SECURITY:
 *   jitterEnabled   → Add per-frame random offset to mask position.
 *   jitterMagnitude → Max jitter displacement in pixels.
 *   temporalPhaseEnabled
 *                   → Modulate text-noise brightness with a sine wave
 *                     so averaged frames blur instead of sharpen.
 *   noiseRegenInterval
 *                   → Regenerate text noise every N frames. Lower =
 *                     harder to average but more visual flicker.
 *
 * DIRECTION SAFETY:
 *   minDirectionGap → Minimum angular separation (degrees) between
 *                     text and background noise directions.  40° is a
 *                     good default.  Set to 60° for extra safety, or
 *                     30° if you want tighter bounds.
 *
 * CAPTCHA TEXT:
 *   charset         → Characters used for random code generation.
 *                     Omits visually ambiguous chars (I, O, 0, 1).
 *   codeLength      → Number of characters in the code.
 *   ttlMs           → Challenge time-to-live in milliseconds.
 *
 * PRESETS:
 *   Named parameter bundles for the debug controller.
 *   Each preset overrides textDir, textSpeed, bgDir, bgSpeed.
 *   "chaos" is a function that returns random values.
 */

// ══════════════════════════════════════════════════════════════
// Canvas defaults
// ══════════════════════════════════════════════════════════════
export const CANVAS = {
  /** Default CAPTCHA widget width (px) */
  width: 300,
  /** Default CAPTCHA widget height (px) */
  height: 100,
  /** Noise cell/block size in pixels (1 = finest grain, 2-4 = blockier) */
  cellSize: 1,
  /** (debug) Max debug canvas width — WASM memory cap */
  maxDebugWidth: 960,
  /** (debug) Max debug canvas height — WASM memory cap */
  maxDebugHeight: 540,
} as const;

// ══════════════════════════════════════════════════════════════
// Noise direction & speed defaults
// ══════════════════════════════════════════════════════════════
export const NOISE = {
  /** Default text noise scroll direction (degrees, 0–360) */
  textDirection: 90,
  /** Default background noise scroll direction (degrees, 0–360) */
  bgDirection: 0,
  /** Default text noise scroll speed (px/step) */
  textSpeed: 2,
  /** Default background noise scroll speed (px/step) */
  bgSpeed: 2,
  /** Minimum speed when generating random values */
  minSpeed: 1,
  /** Maximum speed when generating random values */
  maxSpeed: 2,
} as const;

// ══════════════════════════════════════════════════════════════
// Timing
// ══════════════════════════════════════════════════════════════
export const TIMING = {
  /** Milliseconds between animation steps (32 ≈ 30fps) */
  stepMs: 32,
} as const; 

// ══════════════════════════════════════════════════════════════
// Anti-averaging / security
// ══════════════════════════════════════════════════════════════
export const SECURITY = {
  /** Enable per-frame jitter on the text mask position */
  jitterEnabled: true,
  /** Max jitter displacement (px) */
  jitterMagnitude: 3,
  /** Enable sine-wave brightness modulation on text noise */
  temporalPhaseEnabled: false,
  /** Regenerate text noise every N frames (0 = never) */
  noiseRegenInterval: 0,
} as const;

// ══════════════════════════════════════════════════════════════
// Direction safety — prevents text from being invisible
// ══════════════════════════════════════════════════════════════
export const DIRECTION_SAFETY = {
  /**
   * Minimum angular separation between text and background noise
   * directions (in degrees). If the two directions are closer than
   * this on the unit circle, the text becomes invisible because both
   * noise layers scroll identically.
   *
   * How it works:
   *   angularDiff = min(|a - b|, 360 - |a - b|)
   *   if angularDiff < minDirectionGap → invalid, re-roll
   *
   * Recommended range: 30–90°
   *   30° → lenient, some near-overlap possible
   *   40° → good default balance
   *   60° → very safe, clearly distinct motion
   *   90° → perpendicular or wider
   */
  minDirectionGap: 60,
} as const;

// ══════════════════════════════════════════════════════════════
// CAPTCHA text generation
// ══════════════════════════════════════════════════════════════
export const CAPTCHA_TEXT = {
  /**
   * Characters used for random code generation.
   *
   * Removed for noise readability:
   *   Digits   — all removed (B↔8, S↔5, Z↔2, G↔6 confusion in noise)
   *   B        — confused with 8
   *   G        — confused with 6
   *   Q        — complex tail merges with noise
   *   S        — confused with 5
   *   U, V, W  — U↔V confusion, W too wide/noisy
   *   Z        — confused with 2
   *   I, O     — already excluded (I↔1, O↔0)
   *
   * Remaining 16 chars → 16^5 = 1,048,576 combinations (sufficient).
   */
  charset: "ACEFHJKLMNPRTXY",
  /** Number of characters in the CAPTCHA code */
  codeLength: 5,
  /** Challenge time-to-live (ms). After this, the challenge expires. */
  ttlMs: 120_000, // 2 minutes
} as const;

// ══════════════════════════════════════════════════════════════
// Debug presets
// ══════════════════════════════════════════════════════════════
export interface PresetValues {
  textDir: number;
  textSpeed: number;
  bgDir: number;
  bgSpeed: number;
}

export const PRESETS: Record<string, PresetValues | (() => PresetValues)> = {
  diagonal: { textDir: 45, textSpeed: 4, bgDir: 225, bgSpeed: 4 },
  opposite: { textDir: 270, textSpeed: 4, bgDir: 90, bgSpeed: 4 },
  chaos: () => ({
    textDir: Math.floor(Math.random() * 360),
    textSpeed: 10 + Math.floor(Math.random() * 10),
    bgDir: Math.floor(Math.random() * 360),
    bgSpeed: 10 + Math.floor(Math.random() * 10),
  }),
  slow: { textDir: 90, textSpeed: 1, bgDir: 0, bgSpeed: 1 },
  static: { textDir: 0, textSpeed: 0, bgDir: 0, bgSpeed: 0 },
};

// ══════════════════════════════════════════════════════════════
// Direction separation utilities
// ══════════════════════════════════════════════════════════════

/**
 * Calculate the minimum angular difference between two angles,
 * accounting for the circular nature of degrees (0° = 360°).
 *
 * Examples:
 *   angularDifference(10, 350) → 20  (not 340)
 *   angularDifference(90, 90)  → 0
 *   angularDifference(0, 180)  → 180
 */
export function angularDifference(a: number, b: number): number {
  const diff = Math.abs(((a - b) % 360 + 360) % 360);
  return Math.min(diff, 360 - diff);
}

/**
 * Check whether two directions are far enough apart.
 */
export function areDirectionsSafe(
  textDir: number,
  bgDir: number,
  minGap: number = DIRECTION_SAFETY.minDirectionGap
): boolean {
  return angularDifference(textDir, bgDir) >= minGap;
}

/**
 * Generate a pair of (textDirection, bgDirection) that are guaranteed
 * to be at least `minDirectionGap` degrees apart on the unit circle.
 *
 * Algorithm:
 *   1. Pick bgDirection uniformly in [0, 360).
 *   2. Pick textDirection uniformly from the "safe zone" — the arc
 *      that is at least minGap degrees away from bgDirection.
 *      Safe zone size = 360 - 2 * minGap degrees.
 *   3. If minGap >= 180, fall back to opposite directions (180° apart).
 *
 * This guarantees the CAPTCHA text is always visually distinguishable
 * from the background noise by having different scroll directions.
 */
export function generateSafeDirections(
  minGap: number = DIRECTION_SAFETY.minDirectionGap
): { textDirection: number; bgDirection: number } {
  // Edge case: if gap is too large, just use perpendicular
  if (minGap >= 180) {
    const bg = randomDegree();
    return {
      bgDirection: bg,
      textDirection: (bg + 180) % 360,
    };
  }

  const bg = randomDegree();

  // The "forbidden zone" around bgDirection is [bg - minGap, bg + minGap].
  // The "safe zone" is the remaining arc of size (360 - 2 * minGap).
  const safeArc = 360 - 2 * minGap;
  const offset = minGap + Math.random() * safeArc;
  const text = (bg + offset) % 360;

  return {
    bgDirection: Math.round(bg),
    textDirection: Math.round(text),
  };
}

/**
 * Generate random speeds for text and background noise.
 */
export function generateRandomSpeeds(): { textSpeed: number; bgSpeed: number } {
  const range = NOISE.maxSpeed - NOISE.minSpeed;
  return {
    textSpeed: NOISE.minSpeed + Math.floor(Math.random() * (range + 1)),
    bgSpeed: NOISE.minSpeed + Math.floor(Math.random() * (range + 1)),
  };
}

function randomDegree(): number {
  return Math.random() * 360;
}

// ══════════════════════════════════════════════════════════════
// Aggregate config sent to client with each challenge
// ══════════════════════════════════════════════════════════════
export interface NoiseConfig {
  textDirection: number;
  bgDirection: number;
  textSpeed: number;
  bgSpeed: number;
  stepMs: number;
  jitterEnabled: boolean;
  jitterMagnitude: number;
  temporalPhaseEnabled: boolean;
  noiseRegenInterval: number;
}

/**
 * Build a full NoiseConfig for a new challenge, using safe random
 * directions and the default security/timing parameters.
 */
export function buildChallengeConfig(): NoiseConfig {
  const dirs = generateSafeDirections();
  const speeds = generateRandomSpeeds();

  return {
    textDirection: dirs.textDirection,
    bgDirection: dirs.bgDirection,
    textSpeed: speeds.textSpeed,
    bgSpeed: speeds.bgSpeed,
    stepMs: TIMING.stepMs,
    jitterEnabled: SECURITY.jitterEnabled,
    jitterMagnitude: SECURITY.jitterMagnitude,
    temporalPhaseEnabled: SECURITY.temporalPhaseEnabled,
    noiseRegenInterval: SECURITY.noiseRegenInterval,
  };
}
