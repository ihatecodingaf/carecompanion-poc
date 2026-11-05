/**
 * hairValidation.ts — Post-capture validation for hair mode shots.
 *
 * Shot types: crown | scalp | hairline
 *
 * Crown/scalp: sharpness + face-selfie check + hair segmenter + pixel proxy
 * Hairline:    sharpness only + bright-surface rejection (GCV handles content)
 * Alopecia:    skip hair coverage checks (patient may be bald); GCV validates
 */

import { getBlazeFace, getHairImageSegmenter } from './mediapipe';
import { ALOPECIA_CONDITIONS } from './conditionConfig';

export const VALIDATION_CONFIG = {
  crown: {
    faceAreaMax: 0.20,
    faceConfidenceMin: 0.7,
    hairCoverageMin: 10,
  },
  scalp: {
    hairCoverageMin: 8,
  },
  hairline: {
    // No hair coverage min — GCV handles content validation
  },
  qualityThresholds: {
    attempt1: 40,
    attempt2: 45,
    attempt3: 50,
  },
  proxy: {
    minTextureVariance: 8,
    minDarkPixelPct: 10,
  },
  secondPass: {
    blurrySharpnessMax: 5,
    crownStrictMin: 15,
    scalpStrictMin: 10,
    minTextureVariance: 10,
    minDarkPixelPct: 12,
  },
  maxAttempts: 3,
} as const;

export interface ValidationResult {
  passed: boolean;
  reason: string;
  message: string;
  confidence: number;
  attemptNumber: number;
  warning?: boolean;
  critical?: boolean;
}

// ─── Hair coverage via MediaPipe segmenter ────────────────────────────────────

export async function measureHairCoverage(canvas: HTMLCanvasElement): Promise<number> {
  try {
    const seg = await getHairImageSegmenter();
    if (!seg) return -1;
    const result = seg.segment(canvas);
    if (!result?.confidenceMasks || result.confidenceMasks.length < 2) {
      result?.close();
      return -1;
    }
    const maskData = result.confidenceMasks[1].getAsFloat32Array();
    let hairPixels = 0;
    for (let i = 0; i < maskData.length; i++) {
      if (maskData[i] > 0.5) hairPixels++;
    }
    result.close();
    return (hairPixels / maskData.length) * 100;
  } catch {
    return -1;
  }
}

// ─── Pixel proxy (no-ML fallback) ────────────────────────────────────────────

export function hairProxyCheck(canvas: HTMLCanvasElement): {
  looksLikeHair: boolean;
  textureVariance: number;
  darkPixelPct: number;
} {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return { looksLikeHair: true, textureVariance: 0, darkPixelPct: 0 };
    const W = canvas.width, H = canvas.height;
    const data = ctx.getImageData(
      Math.floor(W * 0.1), Math.floor(H * 0.1),
      Math.floor(W * 0.8), Math.floor(H * 0.8),
    ).data;
    let sum = 0, count = 0, darkCount = 0, veryBrightCount = 0;
    const grays: number[] = [];
    for (let i = 0; i < data.length; i += 16) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      grays.push(gray);
      sum += gray;
      count++;
      if (gray < 85) darkCount++;
      if (gray > 200) veryBrightCount++;
    }
    const mean = sum / count;
    let variance = 0;
    for (const g of grays) variance += (g - mean) ** 2;
    const textureVariance = Math.sqrt(variance / count);
    const darkPixelPct = (darkCount / count) * 100;
    const veryBrightPct = (veryBrightCount / count) * 100;
    const brightUniform = mean > 180 && textureVariance < 16;
    const dominantlyBright = veryBrightPct > 55;
    const looksLikeHair =
      !brightUniform &&
      !dominantlyBright &&
      textureVariance >= VALIDATION_CONFIG.proxy.minTextureVariance &&
      darkPixelPct >= VALIDATION_CONFIG.proxy.minDarkPixelPct;
    return { looksLikeHair, textureVariance, darkPixelPct };
  } catch {
    return { looksLikeHair: true, textureVariance: 0, darkPixelPct: 0 };
  }
}

// ─── Main validation ──────────────────────────────────────────────────────────

export async function validateHairShot(
  canvas: HTMLCanvasElement,
  shotType: 'crown' | 'scalp' | 'hairline',
  existingQuality: number,
  attemptNumber: number,
  patientCondition?: string,
): Promise<ValidationResult> {
  try {
    const attempt = Math.min(attemptNumber, 3) as 1 | 2 | 3;
    const minQuality = VALIDATION_CONFIG.qualityThresholds[`attempt${attempt}`];
    const isAlopecia = patientCondition ? ALOPECIA_CONDITIONS.has(patientCondition) : false;

    // ── 1. Quality gate ───────────────────────────────────────────────────────
    if (existingQuality < minQuality) {
      const isFirstAttempt = attemptNumber === 1;
      return {
        passed: isFirstAttempt,
        reason: 'quality_too_low',
        message: isFirstAttempt
          ? `Image quality is low (${existingQuality}/100). Try better lighting or hold the phone steadier.`
          : `Quality too low (${existingQuality}/100) — retake with better lighting or less movement.`,
        confidence: existingQuality / 100,
        attemptNumber,
        warning: isFirstAttempt,
      };
    }

    // ── 2. Hairline: only reject bright uniform surfaces (walls/ceilings) ────
    // GCV handles all content validation for hairline shots.
    if (shotType === 'hairline') {
      const proxy = hairProxyCheck(canvas);
      const brightUniform = proxy.textureVariance < 8 && proxy.darkPixelPct < 5;
      if (brightUniform) {
        return {
          passed: false,
          reason: 'wrong_surface',
          message: 'This looks like a wall or ceiling. Point the camera at your hairline and forehead.',
          confidence: 0.2,
          attemptNumber,
        };
      }
      return { passed: true, reason: 'valid_shot', message: 'Good photo!', confidence: 0.8, attemptNumber };
    }

    // ── 3. Face-selfie check (crown only, skip for alopecia — bald head may ──
    //      trigger BlazeFace on forehead skin)
    if (shotType === 'crown' && !isAlopecia) {
      try {
        const bf = await getBlazeFace();
        if (bf) {
          const faces = await bf.estimateFaces(canvas, false);
          if (faces.length > 0) {
            const face = faces[0];
            const faceW = face.bottomRight[0] - face.topLeft[0];
            const faceH = face.bottomRight[1] - face.topLeft[1];
            const faceArea = (faceW * faceH) / (canvas.width * canvas.height);
            const confidence = (face as unknown as { probability?: number[] }).probability?.[0] ?? 0.5;
            if (faceArea > VALIDATION_CONFIG.crown.faceAreaMax && confidence > VALIDATION_CONFIG.crown.faceConfidenceMin) {
              return {
                passed: false,
                reason: 'face_selfie_detected',
                message: 'This looks like a face selfie.\n\nFor the Crown photo, hold the phone above your head with the camera pointing straight down.',
                confidence: 0.1,
                attemptNumber,
                critical: true,
              };
            }
          }
        }
      } catch { /* non-fatal */ }
    }

    // ── 4. Hair segmenter — skip for alopecia (patient may be bald) ──────────
    if (!isAlopecia) {
      const hairCoverage = await measureHairCoverage(canvas);
      const minCoverage = shotType === 'crown'
        ? VALIDATION_CONFIG.crown.hairCoverageMin
        : VALIDATION_CONFIG.scalp.hairCoverageMin;

      if (hairCoverage >= 0) {
        if (hairCoverage < minCoverage) {
          return {
            passed: false,
            reason: 'insufficient_hair',
            message: shotType === 'crown'
              ? 'Cannot detect hair or scalp. Make sure your crown fills the frame.'
              : 'Cannot detect scalp or hair. Part your hair and point the camera at the parting.',
            confidence: hairCoverage / 100,
            attemptNumber,
          };
        }
        return { passed: true, reason: 'valid_shot', message: 'Good photo!', confidence: Math.min(0.97, hairCoverage / 100), attemptNumber };
      }

      // ── 5. Pixel proxy fallback ───────────────────────────────────────────
      const proxy = hairProxyCheck(canvas);
      if (!proxy.looksLikeHair) {
        return {
          passed: false,
          reason: 'no_hair_detected',
          message: shotType === 'crown'
            ? 'No hair detected. Point the camera straight down at the top of your head.'
            : 'No hair or scalp detected. Part your hair and point the camera at the parting.',
          confidence: Math.min(0.4, proxy.textureVariance / 40),
          attemptNumber,
        };
      }
      return { passed: true, reason: 'valid_shot', message: 'Good photo!', confidence: Math.min(0.85, proxy.textureVariance / 40 + proxy.darkPixelPct / 100), attemptNumber };
    }

    // Alopecia: quality passed, no face selfie concern → valid
    return { passed: true, reason: 'valid_shot', message: 'Good photo!', confidence: 0.8, attemptNumber };

  } catch {
    return { passed: true, reason: 'validation_skipped', message: 'Validation unavailable — proceeding.', confidence: 0.5, attemptNumber, warning: true };
  }
}

export function preloadHairSegmenter(): void {
  getHairImageSegmenter().catch(() => {});
}

// ─── Second-pass post-capture validation ──────────────────────────────────────

export interface SecondPassResult {
  passed: boolean;
  reason: string;
  message: string;
}

export async function validateHairShotPostCapture(
  canvas: HTMLCanvasElement,
  shotType: 'crown' | 'scalp' | 'hairline',
  sharpness: number,
  patientCondition?: string,
): Promise<SecondPassResult> {
  try {
    const cfg = VALIDATION_CONFIG.secondPass;
    const isAlopecia = patientCondition ? ALOPECIA_CONDITIONS.has(patientCondition) : false;

    // Hairline: only check blurriness — GCV handles everything else
    if (shotType === 'hairline') {
      if (sharpness < cfg.blurrySharpnessMax) {
        return { passed: false, reason: 'blurry', message: 'Photo is too blurry — hold the phone very still and try again.' };
      }
      return { passed: true, reason: 'ok', message: '' };
    }

    // ── 1. Blurriness ─────────────────────────────────────────────────────────
    if (sharpness < cfg.blurrySharpnessMax) {
      return { passed: false, reason: 'blurry', message: 'Photo is too blurry — hold the phone very still and try again.' };
    }

    // ── 2. Strict segmenter — skip for alopecia ───────────────────────────────
    if (!isAlopecia) {
      const hairCoverage = await measureHairCoverage(canvas);
      const strictMin = shotType === 'crown' ? cfg.crownStrictMin : cfg.scalpStrictMin;
      if (hairCoverage >= 0) {
        if (hairCoverage < strictMin) {
          return {
            passed: false,
            reason: 'insufficient_hair_strict',
            message: shotType === 'crown'
              ? 'Not enough hair fills the frame. Move closer to your crown and try again.'
              : 'Not enough scalp visible. Part your hair further and hold the camera closer.',
          };
        }
        return { passed: true, reason: 'ok', message: '' };
      }

      // ── 3. Strict proxy ───────────────────────────────────────────────────
      const proxy = hairProxyCheck(canvas);
      if (proxy.textureVariance < cfg.minTextureVariance || proxy.darkPixelPct < cfg.minDarkPixelPct) {
        return {
          passed: false,
          reason: 'wrong_object_strict',
          message: shotType === 'crown'
            ? 'This looks like a wall or other surface. Point the camera straight down at the top of your head.'
            : 'This does not look like hair or scalp. Part your hair and point the camera directly at the parting.',
        };
      }
    }

    return { passed: true, reason: 'ok', message: '' };
  } catch {
    return { passed: true, reason: 'second_pass_skipped', message: '' };
  }
}
