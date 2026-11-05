/**
 * mediapipe.ts — Singleton loader for face analysis models.
 *
 * Dual pipeline:
 *   BlazeFace   — fast bounding-box detection, used every frame in Camera
 *   FaceLandmarker — 468 landmarks, used at capture + heatmap overlay
 *
 * Both are lazily loaded and cached; multiple components share the same instance.
 */

// ─── Type declarations ────────────────────────────────────────────────────────

declare global {
  interface Window {
    // BlazeFace (TF.js)
    blazeface?: { load: () => Promise<BlazeFaceModel> };
    tf?: unknown;
    // MediaPipe Tasks Vision
    mpFaceLandmarker?: MPFaceLandmarkerClass;
    mpFilesetResolver?: MPFilesetResolverClass;
    mpImageSegmenter?: MPImageSegmenterClass;
    _mpTasksReady?: boolean;
  }
}

interface BlazeFaceModel {
  estimateFaces(input: HTMLCanvasElement | HTMLVideoElement, returnTensors: false): Promise<BlazeFacePrediction[]>;
}

export interface BlazeFacePrediction {
  topLeft: [number, number];
  bottomRight: [number, number];
}

interface MPFilesetResolverClass {
  forVisionTasks(wasmUrl: string): Promise<MPFileset>;
}
interface MPFileset { [key: string]: unknown }

export interface FaceLandmarkerResult {
  faceLandmarks: Array<Array<{ x: number; y: number; z: number }>>;
}

interface MPFaceLandmarkerClass {
  createFromOptions(fileset: MPFileset, options: MPFaceLandmarkerOptions): Promise<MPFaceLandmarkerInstance>;
  FACE_LANDMARKS_TESSELATION: unknown;
}

interface MPFaceLandmarkerOptions {
  baseOptions: { modelAssetPath: string; delegate?: string };
  outputFaceBlendshapes?: boolean;
  runningMode: 'IMAGE' | 'VIDEO';
  numFaces?: number;
}

export interface MPFaceLandmarkerInstance {
  detect(image: HTMLCanvasElement | HTMLImageElement): FaceLandmarkerResult;
  detectForVideo(video: HTMLVideoElement, timestamp: number): FaceLandmarkerResult;
  setOptions(options: { runningMode: 'IMAGE' | 'VIDEO' }): Promise<void>;
  close(): void;
}

interface MPImageSegmenterOptions {
  baseOptions: { modelAssetPath: string; delegate?: string };
  runningMode: 'IMAGE' | 'VIDEO';
  outputCategoryMask: boolean;
  outputConfidenceMasks?: boolean;
}

export interface MPMask {
  getAsUint8Array(): Uint8Array;
  getAsFloat32Array(): Float32Array;
  close(): void;
}

export interface ImageSegmenterResult {
  categoryMask?: MPMask;
  confidenceMasks?: MPMask[];
  close(): void;
}

export interface MPImageSegmenterInstance {
  segmentForVideo(video: HTMLVideoElement, timestamp: number): ImageSegmenterResult;
  close(): void;
}

// IMAGE-mode variant — used for still-frame validation (canvas input)
export interface MPImageSegmenterImageInstance {
  segment(image: HTMLCanvasElement): ImageSegmenterResult;
  close(): void;
}

interface MPImageSegmenterClass {
  createFromOptions(fileset: MPFileset, options: MPImageSegmenterOptions): Promise<MPImageSegmenterInstance & MPImageSegmenterImageInstance>;
}

// ─── WASM / model URLs ────────────────────────────────────────────────────────

const MP_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

const MP_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Self-hosted in /public — Google's CDN no longer serves segmenter models publicly.
// Must be an absolute URL: MediaPipe WASM runs in a worker loaded from jsDelivr,
// so relative paths resolve against cdn.jsdelivr.net, not our app origin.
// Binary mask: 0 = background, 1 = hair
const MP_HAIR_SEGMENTER_URL = `${typeof window !== 'undefined' ? window.location.origin : ''}${import.meta.env.BASE_URL}hair_segmenter.task`;

// ─── Singletons ───────────────────────────────────────────────────────────────

let _bfModel: BlazeFaceModel | null = null;
let _bfLoading: Promise<BlazeFaceModel | null> | null = null;

let _mpImageLandmarker: MPFaceLandmarkerInstance | null = null;
let _mpVideoLandmarker: MPFaceLandmarkerInstance | null = null;
let _mpLoading: Promise<void> | null = null;

let _hairSegmenter: MPImageSegmenterInstance | null = null;
let _hairSegmenterLoading: Promise<MPImageSegmenterInstance | null> | null = null;

let _hairImageSegmenter: MPImageSegmenterImageInstance | null = null;
let _hairImageSegmenterLoading: Promise<MPImageSegmenterImageInstance | null> | null = null;

// ─── BlazeFace loader ─────────────────────────────────────────────────────────

/** Returns a BlazeFace model, loading it on first call. */
export async function getBlazeFace(): Promise<BlazeFaceModel | null> {
  if (_bfModel) return _bfModel;
  if (_bfLoading) return _bfLoading;

  _bfLoading = (async () => {
    // Wait for TF.js + BlazeFace CDN scripts
    for (let i = 0; i < 30; i++) {
      if (window.blazeface && window.tf) break;
      await sleep(300);
    }
    if (!window.blazeface) return null;
    try {
      _bfModel = await window.blazeface.load();
      return _bfModel;
    } catch {
      return null;
    }
  })();

  return _bfLoading;
}

// ─── MediaPipe loader ─────────────────────────────────────────────────────────

/** Ensures both IMAGE + VIDEO FaceLandmarker instances are ready. */
async function ensureMediaPipe(): Promise<void> {
  if (_mpImageLandmarker && _mpVideoLandmarker) return;
  if (_mpLoading) return _mpLoading;

  _mpLoading = (async () => {
    // Wait for ES module globals
    for (let i = 0; i < 60; i++) {
      if (window._mpTasksReady && window.mpFilesetResolver && window.mpFaceLandmarker) break;
      await sleep(200);
    }
    if (!window.mpFilesetResolver || !window.mpFaceLandmarker) {
      throw new Error('MediaPipe Tasks Vision failed to load');
    }

    const fileset = await window.mpFilesetResolver.forVisionTasks(MP_WASM_URL);

    const [imageInst, videoInst] = await Promise.all([
      window.mpFaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MP_MODEL_URL, delegate: 'GPU' },
        outputFaceBlendshapes: false,
        runningMode: 'IMAGE',
        numFaces: 1,
      }),
      window.mpFaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MP_MODEL_URL, delegate: 'GPU' },
        outputFaceBlendshapes: false,
        runningMode: 'VIDEO',
        numFaces: 1,
      }),
    ]);

    _mpImageLandmarker = imageInst;
    _mpVideoLandmarker = videoInst;
  })();

  return _mpLoading;
}

/** Returns the IMAGE-mode FaceLandmarker (for static photos/canvas). */
export async function getMPImageLandmarker(): Promise<MPFaceLandmarkerInstance | null> {
  try {
    await ensureMediaPipe();
    return _mpImageLandmarker;
  } catch {
    return null;
  }
}

/** Returns the VIDEO-mode FaceLandmarker (for live video frames). */
export async function getMPVideoLandmarker(): Promise<MPFaceLandmarkerInstance | null> {
  try {
    await ensureMediaPipe();
    return _mpVideoLandmarker;
  } catch {
    return null;
  }
}

// ─── Hair Segmenter ───────────────────────────────────────────────────────────

/** Returns a VIDEO-mode ImageSegmenter for hair detection, loading on first call. */
export async function getHairSegmenter(): Promise<MPImageSegmenterInstance | null> {
  if (_hairSegmenter) return _hairSegmenter;
  if (_hairSegmenterLoading) return _hairSegmenterLoading;

  _hairSegmenterLoading = (async () => {
    for (let i = 0; i < 60; i++) {
      if (window._mpTasksReady && window.mpFilesetResolver && window.mpImageSegmenter) break;
      await sleep(200);
    }
    if (!window.mpFilesetResolver || !window.mpImageSegmenter) return null;

    try {
      const fileset = await window.mpFilesetResolver.forVisionTasks(MP_WASM_URL);
      try {
        _hairSegmenter = await window.mpImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MP_HAIR_SEGMENTER_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
      } catch {
        _hairSegmenter = await window.mpImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MP_HAIR_SEGMENTER_URL },
          runningMode: 'VIDEO',
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
      }
      return _hairSegmenter;
    } catch {
      return null;
    }
  })();

  return _hairSegmenterLoading;
}

/** IMAGE-mode hair segmenter — for post-capture still-frame validation. */
export async function getHairImageSegmenter(): Promise<MPImageSegmenterImageInstance | null> {
  if (_hairImageSegmenter) return _hairImageSegmenter;
  if (_hairImageSegmenterLoading) return _hairImageSegmenterLoading;

  _hairImageSegmenterLoading = (async () => {
    for (let i = 0; i < 60; i++) {
      if (window._mpTasksReady && window.mpFilesetResolver && window.mpImageSegmenter) break;
      await sleep(200);
    }
    if (!window.mpFilesetResolver || !window.mpImageSegmenter) return null;

    try {
      const fileset = await window.mpFilesetResolver.forVisionTasks(MP_WASM_URL);
      try {
        _hairImageSegmenter = await window.mpImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MP_HAIR_SEGMENTER_URL, delegate: 'GPU' },
          runningMode: 'IMAGE',
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        }) as unknown as MPImageSegmenterImageInstance;
      } catch {
        _hairImageSegmenter = await window.mpImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MP_HAIR_SEGMENTER_URL },
          runningMode: 'IMAGE',
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        }) as unknown as MPImageSegmenterImageInstance;
      }
      return _hairImageSegmenter;
    } catch {
      return null;
    }
  })();

  return _hairImageSegmenterLoading;
}

// ─── Hair zone regions (proportional 0-1 coordinates) ────────────────────────
// Assumes top-down phone-above-head posture: crown at top of frame.

export const HAIR_ZONE_REGIONS = {
  crown:        { top: 0.0,  bottom: 0.30, left: 0.25, right: 0.75 },
  hairline:     { top: 0.25, bottom: 0.45, left: 0.20, right: 0.80 },
  left_temple:  { top: 0.10, bottom: 0.50, left: 0.00, right: 0.30 },
  right_temple: { top: 0.10, bottom: 0.50, left: 0.70, right: 1.00 },
  parting_line: { top: 0.00, bottom: 0.30, left: 0.40, right: 0.60 },
  sides:        { top: 0.40, bottom: 0.80, left: 0.00, right: 1.00 },
} as const;

export type HairZoneKey = keyof typeof HAIR_ZONE_REGIONS;

/**
 * Given a flat Uint8Array category mask (1 = hair, 0 = background) and
 * frame dimensions, returns per-zone hair coverage as a percentage 0-100.
 */
export function analyseHairZones(
  mask: Uint8Array,
  width: number,
  height: number,
): Record<HairZoneKey, number> {
  const result = {} as Record<HairZoneKey, number>;

  (Object.entries(HAIR_ZONE_REGIONS) as [HairZoneKey, typeof HAIR_ZONE_REGIONS[HairZoneKey]][]).forEach(
    ([zone, region]) => {
      const x0 = Math.floor(region.left   * width);
      const x1 = Math.floor(region.right  * width);
      const y0 = Math.floor(region.top    * height);
      const y1 = Math.floor(region.bottom * height);

      let hairPixels = 0;
      let totalPixels = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * width + x;
          if (i < mask.length) {
            totalPixels++;
            if (mask[i] === 1) hairPixels++; // category 1 = hair in multiclass model
          }
        }
      }

      result[zone] = totalPixels > 0 ? Math.round((hairPixels / totalPixels) * 100) : 0;
    },
  );

  return result;
}

// ─── Zone landmark indices (MediaPipe FaceMesh 468 points) ───────────────────
//
// Orientation: selfie-view (mirrored), so:
//   left_cheek  = patient's left  = right side of display
//   right_cheek = patient's right = left side of display
//
// We store "left" and "right" relative to the patient's face (anatomical).

export const ZONE_LANDMARK_INDICES = {
  forehead:    [10, 338, 297, 332, 333, 108, 69, 104, 67, 9, 8],
  left_cheek:  [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152],
  right_cheek: [454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152],
  nose_tzone:  [168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 164],
  perioral:    [0, 267, 269, 270, 409, 291, 375, 321, 61, 39, 40, 185],
  chin:        [152, 175, 171, 148, 176, 149, 150, 136, 172],
} as const;

export type ZoneKey = keyof typeof ZONE_LANDMARK_INDICES;

/** Computes zone centre + radius from FaceMesh landmarks. */
export function computeZoneCentres(
  landmarks: Array<{ x: number; y: number; z: number }>,
  canvasW: number,
  canvasH: number,
): Record<ZoneKey, { cx: number; cy: number; rx: number; ry: number }> {
  // Face width (in pixels) for scaling radii
  const lm234 = landmarks[234];
  const lm454 = landmarks[454];
  const faceW = lm234 && lm454 ? Math.abs((lm454.x - lm234.x) * canvasW) : canvasW * 0.65;
  const faceH = faceW * 1.35; // approx face height

  const result = {} as Record<ZoneKey, { cx: number; cy: number; rx: number; ry: number }>;

  const radii: Record<ZoneKey, [number, number]> = {
    forehead:    [faceW * 0.38, faceH * 0.13],
    left_cheek:  [faceW * 0.26, faceH * 0.22],
    right_cheek: [faceW * 0.26, faceH * 0.22],
    nose_tzone:  [faceW * 0.16, faceH * 0.26],
    perioral:    [faceW * 0.20, faceH * 0.11],
    chin:        [faceW * 0.18, faceH * 0.09],
  };

  (Object.entries(ZONE_LANDMARK_INDICES) as [ZoneKey, readonly number[]][]).forEach(([zone, indices]) => {
    let sumX = 0, sumY = 0, count = 0;
    indices.forEach(idx => {
      const lm = landmarks[idx];
      if (lm) { sumX += lm.x * canvasW; sumY += lm.y * canvasH; count++; }
    });
    if (count === 0) return;
    result[zone] = {
      cx: sumX / count,
      cy: sumY / count,
      rx: radii[zone][0],
      ry: radii[zone][1],
    };
  });

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Kicks off background pre-loading of the FaceLandmarker model.
 * Call this from App.tsx on mount so the model is warm by the time
 * the user opens the camera.
 */
export function preloadMediaPipe(): void {
  // Fire-and-forget — errors are swallowed (graceful degradation)
  ensureMediaPipe().catch(() => undefined);
  getBlazeFace().catch(() => undefined);
  getHairSegmenter().catch(() => undefined);
  getHairImageSegmenter().catch(() => undefined);
}
