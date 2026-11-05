/**
 * imageUtils.ts — Image quality metrics + cropping utilities.
 *
 * measureSharpness / measureBrightness are shared between Camera.tsx (hair mode)
 * and AishaCheckinPage.tsx (hairline autocapture).  Keep them here so neither
 * component imports the other and drags in its full dependency tree.
 *
 * The hair segmenter returns a flat Uint8Array mask where 1 = hair pixel.
 * We find the bounding box of all hair pixels, add padding, and crop
 * to produce a tight scalp-only image for Claude Vision.
 */

/**
 * Returns a sharpness score 0–100 by computing sqrt(variance) of Laplacian
 * values across the centre 70%×80% of the frame.  ≥5 is acceptable for hair.
 * Identical to the implementation in Camera.tsx.
 */
export function measureSharpness(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const data = ctx.getImageData(Math.floor(w * 0.15), Math.floor(h * 0.1), Math.floor(w * 0.7), Math.floor(h * 0.8)).data;
  const sw = Math.floor(w * 0.7), sh = Math.floor(h * 0.8);
  let sum = 0, sumSq = 0, count = 0;
  for (let y = 1; y < sh - 1; y += 2) {
    for (let x = 1; x < sw - 1; x += 2) {
      const i = (y * sw + x) * 4;
      const g  = (data[i]   + data[i + 1]   + data[i + 2])   / 3;
      const up = (data[((y-1)*sw+x)*4] + data[((y-1)*sw+x)*4+1] + data[((y-1)*sw+x)*4+2]) / 3;
      const dn = (data[((y+1)*sw+x)*4] + data[((y+1)*sw+x)*4+1] + data[((y+1)*sw+x)*4+2]) / 3;
      const lt = (data[(y*sw+x-1)*4]   + data[(y*sw+x-1)*4+1]   + data[(y*sw+x-1)*4+2])   / 3;
      const rt = (data[(y*sw+x+1)*4]   + data[(y*sw+x+1)*4+1]   + data[(y*sw+x+1)*4+2])   / 3;
      const lap = 4 * g - up - dn - lt - rt;
      sum += lap; sumSq += lap * lap; count++;
    }
  }
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return Math.min(100, Math.round(Math.sqrt(variance)));
}

/**
 * Returns brightness as a percentage 0–100 (luminance-weighted average / 255).
 * 20–90 is the acceptable range for a well-lit hair/skin photo.
 */
export function measureBrightness(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const data = ctx.getImageData(0, 0, w, h).data;
  let total = 0, count = 0;
  for (let i = 0; i < data.length; i += 16) {
    total += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    count++;
  }
  return Math.round((total / count / 255) * 100);
}

/**
 * Returns the bounding box of all hair pixels (mask[i] > 0) in the mask.
 * If the mask is empty, returns the full canvas bounds.
 */
export function getMaskBounds(
  mask: Uint8Array,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  let minX = width, minY = height, maxX = 0, maxY = 0;
  let hasHair = false;

  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > 0) {
      hasHair = true;
      const x = i % width;
      const y = Math.floor(i / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (!hasHair) return { x: 0, y: 0, width, height };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Crops the canvas to the hair region defined by the segmentation mask.
 *
 * Steps:
 *  1. Find bounding box of all hair pixels (mask[i] > 0)
 *  2. Add 8% padding on all sides (clamped to canvas bounds)
 *  3. Draw source region into an output canvas of that size
 *  4. Return as JPEG dataUrl at 0.92 quality
 *
 * Falls back to the full canvas dataUrl if the mask is empty or null.
 */
export function cropHairRegion(canvas: HTMLCanvasElement, mask: Uint8Array | null | undefined): string {
  if (!mask || mask.length === 0) return canvas.toDataURL('image/jpeg', 0.92);

  const W = canvas.width;
  const H = canvas.height;

  const bounds = getMaskBounds(mask, W, H);

  // 8% padding
  const padX = Math.round(bounds.width  * 0.08);
  const padY = Math.round(bounds.height * 0.08);

  const cropX = Math.max(0, bounds.x - padX);
  const cropY = Math.max(0, bounds.y - padY);
  const cropW = Math.min(W - cropX, bounds.width  + padX * 2);
  const cropH = Math.min(H - cropY, bounds.height + padY * 2);

  const out = document.createElement('canvas');
  out.width  = cropW;
  out.height = cropH;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  return out.toDataURL('image/jpeg', 0.92);
}
