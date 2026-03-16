
/**
 * Server-side text → pixelated alpha bitmap renderer.
 *
 * This is the exact port of createPixelatedTextMask() from the reference HTML,
 * running on the server so the text string never reaches the client.
 *
 * Uses @napi-rs/canvas for fast server-side canvas rendering under Bun.
 */

import { createCanvas } from "@napi-rs/canvas";

export interface GlyphBitmap {
  /** Alpha-only pixels (mask_w * mask_h bytes), 0 = background, >0 = text */
  bitmap: Uint8Array;
  /** Width of the tightly-cropped, grid-aligned mask */
  width: number;
  /** Height of the tightly-cropped, grid-aligned mask */
  height: number;
}

/**
 * Render text into a pixelated alpha bitmap, identical to the reference
 * `createPixelatedTextMask()` function.
 *
 * @param text      The CAPTCHA text (may contain newlines)
 * @param blockSize Pixel grid size (matches CELL_SIZE in WASM)
 * @param viewportW Canvas viewport width
 * @param viewportH Canvas viewport height
 */
export function renderGlyphBitmap(
  text: string,
  blockSize: number,
  viewportW: number,
  viewportH: number
): GlyphBitmap {
  const lines = String(text).split("\n");

  // --- Scratch canvas to measure and draw text ---
  const scratch = createCanvas(viewportW, viewportH);
  const sctx = scratch.getContext("2d");

  // Reduced target width to ensure text doesn't get clipped
  // Leave 10% padding on each side
  const targetWidth = Math.max(1, Math.floor(viewportW * 0.85));
  const targetHeight = Math.max(1, Math.floor(viewportH * 0.85));
  const lineHeightFactor = 1.2;

  // Iteratively find optimal font size (3 passes, same as reference)
  // Use the boldest available system fonts with maximum weight (900)
  const fontStack = '"Arial Black", Impact, "Helvetica Neue", system-ui, sans-serif';
  let fontSize = Math.max(
    8,
    Math.floor(targetHeight / Math.max(1, lines.length))
  );
  for (let i = 0; i < 3; i++) {
    sctx.font = `900 ${fontSize}px ${fontStack}`;
    let maxLineWidth = 1;
    for (const line of lines) {
      const w = sctx.measureText(line).width;
      if (w > maxLineWidth) maxLineWidth = w;
    }
    const totalHeight = Math.max(
      1,
      Math.ceil(lines.length * fontSize * lineHeightFactor)
    );
    const scaleX = targetWidth / maxLineWidth;
    const scaleY = targetHeight / totalHeight;
    const scale = Math.min(scaleX, scaleY, 1);
    fontSize = Math.max(8, Math.floor(fontSize * scale));
  }

  // Draw text centered
  sctx.clearRect(0, 0, viewportW, viewportH);
  sctx.font = `900 ${fontSize}px ${fontStack}`;
  sctx.textAlign = "center";
  sctx.textBaseline = "middle";
  sctx.fillStyle = "#000";

  const centerX = Math.floor(viewportW / 2);
  const centerY = Math.floor(viewportH / 2);
  const spacing = Math.ceil(fontSize * lineHeightFactor);
  const startY = Math.floor(centerY - ((lines.length - 1) * spacing) / 2);

  for (let i = 0; i < lines.length; i++) {
    sctx.fillText(lines[i], centerX, startY + i * spacing);
  }

  // --- Extract bounding box ---
  const img = sctx.getImageData(0, 0, viewportW, viewportH);
  const data = img.data;
  const w = img.width;
  const h = img.height;
  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    // No visible pixels — return a minimal bitmap
    return { bitmap: new Uint8Array(blockSize * blockSize), width: blockSize, height: blockSize };
  }

  // Align bounds to blockSize grid (same as reference)
  const alignedMinX = Math.floor(minX / blockSize) * blockSize;
  const alignedMinY = Math.floor(minY / blockSize) * blockSize;
  const rawWidth = maxX - alignedMinX + 1;
  const rawHeight = maxY - alignedMinY + 1;
  const alignedWidth = Math.ceil(rawWidth / blockSize) * blockSize;
  const alignedHeight = Math.ceil(rawHeight / blockSize) * blockSize;

  // --- Create pixelated mask (sample center of each block) ---
  const bitmap = new Uint8Array(alignedWidth * alignedHeight);

  for (let y = 0; y < alignedHeight; y += blockSize) {
    for (let x = 0; x < alignedWidth; x += blockSize) {
      const sx = alignedMinX + x + Math.floor(blockSize / 2);
      const sy = alignedMinY + y + Math.floor(blockSize / 2);
      if (sx >= 0 && sy >= 0 && sx < w && sy < h) {
        const a = data[(sy * w + sx) * 4 + 3];
        if (a > 0) {
          // Fill the entire block with 255 alpha
          for (let dy = 0; dy < blockSize && y + dy < alignedHeight; dy++) {
            for (let dx = 0; dx < blockSize && x + dx < alignedWidth; dx++) {
              bitmap[(y + dy) * alignedWidth + (x + dx)] = 255;
            }
          }
        }
      }
    }
  }

  return { bitmap, width: alignedWidth, height: alignedHeight };
}
