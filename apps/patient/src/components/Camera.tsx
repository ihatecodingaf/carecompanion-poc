/**
 * Camera — dual-pipeline capture component.
 *
 * Face mode: BlazeFace (every frame) + MediaPipe FaceLandmarker (at capture).
 *   Auto-captures when quality ≥ 80 for 3 seconds.
 *
 * Hair mode: 2-shot guided flow (Crown → Scalp), manual shutter only.
 *   No ML models used — quality = sharpness + lighting only.
 *   Shows photo-like reference images before each shot.
 *   Shows per-shot review (Retake / Use this) after each shot.
 */

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  getBlazeFace,
  getMPImageLandmarker,
  ZONE_LANDMARK_INDICES,
  type BlazeFacePrediction,
} from '../lib/mediapipe';
import { validateHairShot, validateHairShotPostCapture, preloadHairSegmenter, measureHairCoverage, hairProxyCheck, VALIDATION_CONFIG, type ValidationResult } from '../lib/hairValidation';
import { measureSharpness, measureBrightness } from '../lib/imageUtils';

// Example photo shown before a hairline shot. Override with your own hosted image.
const HAIRLINE_REFERENCE_URL =
  (import.meta.env.VITE_HAIRLINE_REFERENCE_URL as string | undefined) ||
  `${import.meta.env.BASE_URL}guides/hairline-reference.svg`;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QualityMetrics {
  sharpness: number;
  brightness: number;
  faceDetected: boolean;
  faceCoverage: number;
  zonesCovered: number;
  overall: number;
}

export type HairShotType = 'crown' | 'scalp' | 'hairline';

export interface HairShotResult {
  shotType: HairShotType;
  shotLabel: string;
  dataUrl: string;
  quality: QualityMetrics;
}

export interface CaptureResult {
  dataUrl: string;
  mimeType: string;
  quality: QualityMetrics;
  landmarks: Array<{ x: number; y: number; z: number }> | null;
  blazeBox: { topLeft: [number, number]; bottomRight: [number, number] } | null;
  hairShots?: HairShotResult[];
}

type HairPhase = 'instruct' | 'shoot' | 'review';

interface HairShotDef {
  id: HairShotType;
  label: string;
  instructTitle: string;
  instructBody: string;
  shootHint: string;
}

const ALL_SHOT_DEFS: Record<HairShotType, HairShotDef> = {
  crown: {
    id: 'crown',
    label: 'Crown',
    instructTitle: 'Photograph your crown',
    instructBody: 'Hold your phone directly above your head with the camera pointing straight down. Your crown — the top of your head — should fill the center of the frame.',
    shootHint: 'Point camera straight down at your crown',
  },
  scalp: {
    id: 'scalp',
    label: 'Scalp',
    instructTitle: 'Photograph your scalp',
    instructBody: 'Part your hair to expose the scalp beneath. Hold the phone close and point the camera at the parting so the scalp is clearly visible.',
    shootHint: 'Show scalp through a parted section of hair',
  },
  hairline: {
    id: 'hairline',
    label: 'Hairline',
    instructTitle: 'Photograph your hairline',
    instructBody: "Hold the phone at arm's length in front of your face pointing at your forehead. The camera should show where your hair meets your skin at the temples and front. Do NOT take a regular selfie — focus on the hairline edge, not your whole face.",
    shootHint: 'Show hairline where hair meets forehead and temples',
  },
};

export interface ShotValidationResult {
  valid: boolean;
  reason: string;
  message: string;
  confidence: number;
}

interface Props {
  mode?: 'face' | 'hair';
  onCapture: (result: CaptureResult) => void;
  onCancel: () => void;
  ghostShots?: { crown?: string; scalp?: string; hairline?: string };
  onValidateShot?: (dataUrl: string, mimeType: string, shotType: HairShotType) => Promise<ShotValidationResult>;
  shotTypes?: HairShotType[];
  patientCondition?: string;
}

// ─── Oval geometry ────────────────────────────────────────────────────────────

function ovalParams(video: HTMLVideoElement): { cx: number; cy: number; rx: number; ry: number } {
  const W  = video.videoWidth  || 640;
  const H  = video.videoHeight || 480;
  const rect = video.getBoundingClientRect();
  const dW = rect.width;
  const dH = rect.height;
  if (!dW || !dH) return { cx: 0.5, cy: 0.45, rx: 0.28, ry: 0.38 };
  const scale   = Math.max(dW / W, dH / H);
  const offsetX = (W * scale - dW) / 2;
  const offsetY = (H * scale - dH) / 2;
  const ovalDW  = dW * 0.62;
  const ovalDH  = dW * 0.85;
  const ovalDCX = dW * 0.5;
  const ovalDCY = dH * 0.08 + ovalDH / 2;
  return {
    cx: (ovalDCX + offsetX) / (scale * W),
    cy: (ovalDCY + offsetY) / (scale * H),
    rx: (ovalDW / 2)        / (scale * W),
    ry: (ovalDH / 2)        / (scale * H),
  };
}

function faceInOval(pred: BlazeFacePrediction, video: HTMLVideoElement): { inside: boolean; overlapPct: number } {
  const { cx, cy, rx, ry } = ovalParams(video);
  const W = video.videoWidth  || 640;
  const H = video.videoHeight || 480;
  const [tlX, tlY] = pred.topLeft;
  const [brX, brY] = pred.bottomRight;
  const midX = (tlX + brX) / 2;
  const midY = (tlY + brY) / 2;
  const pts: [number, number][] = [
    [tlX, tlY],  [midX, tlY],  [brX, tlY],
    [tlX, midY], [midX, midY], [brX, midY],
    [tlX, brY],  [midX, brY],  [brX, brY],
  ];
  const insideCount = pts.filter(([px, py]) => {
    const dx = px / W - cx;
    const dy = py / H - cy;
    return (dx / rx) ** 2 + (dy / ry) ** 2 <= 1;
  }).length;
  return { inside: insideCount >= 6, overlapPct: Math.round((insideCount / pts.length) * 100) };
}

// ─── Image quality helpers (now in imageUtils.ts) ────────────────────────────
// measureSharpness and measureBrightness are imported at the top of this file.

function countZonesCovered(landmarks: Array<{ x: number; y: number; z: number }>): number {
  return (Object.values(ZONE_LANDMARK_INDICES) as readonly (readonly number[])[]).filter(indices => {
    const visible = indices.filter(i => {
      const lm = landmarks[i];
      return lm && lm.x > 0.01 && lm.x < 0.99 && lm.y > 0.01 && lm.y < 0.99;
    });
    return visible.length >= 3;
  }).length;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AUTO_CAPTURE_THRESHOLD_FACE = 80;
const AUTO_CAPTURE_HOLD_MS = 3000;
// GCV validates server-side — keep client gate lenient so holding above crown isn't frustrating
const AUTO_CAPTURE_THRESHOLD_HAIR = 50;
const AUTO_CAPTURE_HOLD_MS_HAIR = 1200;

// ─── Component ───────────────────────────────────────────────────────────────

export default function Camera({ mode = 'face', onCapture, onCancel, ghostShots, onValidateShot, shotTypes, patientCondition }: Props) {
  const isHairMode = mode === 'hair';
  const hairShotDefs = useMemo(
    () => (shotTypes ?? ['crown', 'scalp']).map(t => ALL_SHOT_DEFS[t]),
    [shotTypes],
  );

  // Alopecia patients have little/no hair — skip hair coverage checks for them.
  const isAlopecia = useMemo(() => {
    if (!patientCondition) return false;
    return ['androgenic_alopecia','alopecia_areata','telogen_effluvium',
      'post_hair_transplant_fue','post_hair_transplant_fut','prp_hair'].includes(patientCondition);
  }, [patientCondition]);
  const isAlopeciaRef = useRef(isAlopecia);
  useEffect(() => { isAlopeciaRef.current = isAlopecia; }, [isAlopecia]);

  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef   = useRef<number>(0);
  const bfRef     = useRef<Awaited<ReturnType<typeof getBlazeFace>>>(null);
  const lastBfTs  = useRef<number>(0);

  const goodSinceRef = useRef<number | null>(null);
  const capturingRef = useRef(false);
  const hairPhaseRef = useRef<HairPhase>('instruct');
  const captureHairShotRef = useRef<(() => void) | null>(null);

  const [quality, setQuality] = useState<QualityMetrics>({
    sharpness: 0, brightness: 0, faceDetected: false, faceCoverage: 0, zonesCovered: 0, overall: 0,
  });
  const [faceOutside, setFaceOutside] = useState(false);
  const [countdown, setCountdown] = useState<number>(0);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mpReady, setMpReady] = useState(false);
  const [bfReady, setBfReady] = useState(false);

  // Hair mode state
  const [hairPhase, setHairPhase] = useState<HairPhase>('instruct');
  const [hairShotIdx, setHairShotIdx] = useState(0);
  const hairShotIdxRef = useRef(0);
  const [hairShots, setHairShots] = useState<HairShotResult[]>([]);
  const [reviewDataUrl, setReviewDataUrl] = useState<string | null>(null);
  const [reviewQuality, setReviewQuality] = useState<QualityMetrics | null>(null);

  // Keep onValidateShot in a ref so async callbacks always see the latest version
  const onValidateShotRef = useRef(onValidateShot);
  useEffect(() => { onValidateShotRef.current = onValidateShot; }, [onValidateShot]);

  // Per-shot GCV review validation
  const [reviewValidation, setReviewValidation] = useState<ShotValidationResult | null>(null);
  const [isReviewValidating, setIsReviewValidating] = useState(false);

  // Hair validation state
  const [hairValidationAttempt, setHairValidationAttempt] = useState(1);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [showValidationFeedback, setShowValidationFeedback] = useState(false);
  const [pendingHairDataUrl, setPendingHairDataUrl] = useState<string | null>(null);
  const [pendingHairQuality, setPendingHairQuality] = useState<QualityMetrics | null>(null);
  const [hairCountdown, setHairCountdown] = useState<number>(0);
  // Live hair detection — gates auto-capture and drives real-time feedback.
  // Starts false: only the segmenter (≥25% coverage) can greenlight capture.
  // The proxy (per-frame dark-pixel check) can only REJECT — never confirm —
  // because it can't distinguish hair from dark carpet or clothing.
  // segmenterReadyRef: flips true once the ML model gives its first result.
  // segmenterUnavailable: set after 4s if model never loads; disables
  //   auto-capture for non-alopecia and switches UI to manual-shutter hint.
  const [liveHairOk, setLiveHairOk] = useState(false);
  const liveHairOkRef = useRef(false);
  const segmenterReadyRef = useRef(false);
  const [segmenterUnavailable, setSegmenterUnavailable] = useState(false);

  // Keep hairPhaseRef in sync
  useEffect(() => { hairPhaseRef.current = hairPhase; }, [hairPhase]);
  useEffect(() => { hairShotIdxRef.current = hairShotIdx; }, [hairShotIdx]);

  // Segmenter fallback: if the ML model hasn't responded within 4 s of entering
  // shoot phase, switch to manual-capture-only mode for non-alopecia patients.
  // Alopecia patients get liveHairOk=true immediately (no hair expected on scalp).
  useEffect(() => {
    if (!isHairMode || hairPhase !== 'shoot') return;
    segmenterReadyRef.current = false;
    liveHairOkRef.current = false;
    setLiveHairOk(false);
    setSegmenterUnavailable(false);
    const id = setTimeout(() => {
      if (!segmenterReadyRef.current) {
        if (isAlopecia) {
          // Bald/thinning scalp — no hair to detect, allow capture freely
          liveHairOkRef.current = true;
          setLiveHairOk(true);
        } else {
          // Model failed to load: disable auto-capture, fall back to manual shutter
          setSegmenterUnavailable(true);
        }
      }
    }, 4000);
    return () => clearTimeout(id);
  }, [isHairMode, hairPhase, isAlopecia]);

  // Run ML hair segmenter every 600ms during shoot phase for accurate live detection.
  // Overwrites the per-frame proxy result when the segmenter is available.
  useEffect(() => {
    if (!isHairMode) return;
    let canceled = false;
    async function checkHair() {
      if (canceled || hairPhaseRef.current !== 'shoot' || !canvasRef.current) return;
      const coverage = await measureHairCoverage(canvasRef.current);
      if (canceled) return;
      if (coverage >= 0) {
        segmenterReadyRef.current = true;
        // Alopecia or hairline: skip coverage check.
        // Hairline shots show forehead/temples, not a top-down hair mass — segmenter gives low coverage by design.
        // GCV handles hairline content validation server-side.
        const isHairline = hairShotDefs[hairShotIdxRef.current]?.id === 'hairline';
        const ok = isAlopeciaRef.current || isHairline ? true : coverage >= 25;
        liveHairOkRef.current = ok;
        setLiveHairOk(ok);
      }
      // coverage === -1: segmenter not ready yet; fallback timer handles the wait
    }
    const id = setInterval(checkHair, 600);
    return () => { canceled = true; clearInterval(id); };
  }, [isHairMode]);

  // ── Re-attach stream when hair mode enters shoot phase ───────────────────
  // The instruct/review screens render a different <video> element; the stream
  // is attached to the old element and must be re-attached to the new one.
  useEffect(() => {
    if (isHairMode && hairPhase === 'shoot' && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isHairMode, hairPhase]);

  // ── Load models ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isHairMode) {
      getBlazeFace().then(m => { bfRef.current = m; setBfReady(!!m); });
      getMPImageLandmarker().then(m => setMpReady(!!m));
    } else {
      // Pre-load segmenter during instruct screen so it's ready at capture time
      preloadHairSegmenter();
    }
  }, [isHairMode]);

  // ── Start camera ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function startCam() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError('Camera access denied. Please allow camera permission and reload.');
      }
    }
    startCam();
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  // ── Real-time quality analysis ────────────────────────────────────────────
  const analyzeFrame = useCallback(async () => {
    // In hair mode, only run loop during shoot phase
    if (isHairMode && hairPhaseRef.current !== 'shoot') return;

    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || video.readyState < 2 || !canvas) {
      animRef.current = requestAnimationFrame(analyzeFrame);
      return;
    }

    const W = video.videoWidth  || 640;
    const H = video.videoHeight || 480;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.save(); ctx.scale(-1, 1); ctx.drawImage(video, -W, 0, W, H); ctx.restore();

    const sharpness  = measureSharpness(ctx, W, H);
    const brightness = measureBrightness(ctx, W, H);
    const now = performance.now();

    if (isHairMode) {
      // Hair: sharpness 50pts + lighting 50pts
      const overall = Math.round(
        (sharpness >= 5 ? 50 : (sharpness / 5) * 50) +
        (brightness > 20 && brightness < 90 ? 50 : 0)
      );
      setQuality({ sharpness, brightness, faceDetected: false, faceCoverage: 0, zonesCovered: 0, overall });

      // Per-frame proxy check (fast, sync).
      // Proxy rejection is always trusted — a bright uniform surface is
      // obviously not hair regardless of what the segmenter thinks.
      // Proxy confirmation (looksLikeHair=true) is only trusted once the
      // segmenter has timed out: the proxy can't distinguish hair from dark
      // carpet or clothing, so we don't let it greenlight auto-capture while
      // the segmenter is still loading.
      // Proxy can only REJECT (obvious non-hair: bright walls, ceilings).
      // It never confirms — dark carpet, clothing, pets all pass the proxy but
      // not the segmenter. Only the segmenter (≥25% coverage) can set true.
      const proxy = hairProxyCheck(canvas);
      const isHairlineShot = hairShotDefs[hairShotIdxRef.current]?.id === 'hairline';
      if (!proxy.looksLikeHair && !isHairlineShot) {
        liveHairOkRef.current = false;
        setLiveHairOk(false);
      }

      // Auto-capture: quality gate + sharpness floor so countdown only starts
      // when the phone is actually still (not just well-lit).
      // Also require liveHairOk so we never auto-capture a wall or wrong object.
      const MIN_SHARPNESS_FOR_CAPTURE = 3;
      if (!capturingRef.current) {
        if (overall >= AUTO_CAPTURE_THRESHOLD_HAIR && sharpness >= MIN_SHARPNESS_FOR_CAPTURE && liveHairOkRef.current) {
          if (goodSinceRef.current === null) goodSinceRef.current = now;
          const elapsed = now - goodSinceRef.current;
          const progress = Math.min(100, (elapsed / AUTO_CAPTURE_HOLD_MS_HAIR) * 100);
          setHairCountdown(progress);
          if (elapsed >= AUTO_CAPTURE_HOLD_MS_HAIR) {
            goodSinceRef.current = null;
            setHairCountdown(0);
            captureHairShotRef.current?.();
            return;
          }
        } else {
          if (goodSinceRef.current !== null) { goodSinceRef.current = null; setHairCountdown(0); }
        }
      }
    } else {
      // Face: BlazeFace every 200ms
      let faceDetected = false;
      let faceCoverage = 0;

      if (bfRef.current && now - lastBfTs.current > 200) {
        lastBfTs.current = now;
        try {
          const preds: BlazeFacePrediction[] = await bfRef.current.estimateFaces(canvas, false);
          if (preds.length > 0) {
            const { inside, overlapPct } = faceInOval(preds[0], video);
            faceDetected = inside;
            faceCoverage = overlapPct;
            setFaceOutside(!inside);
          } else {
            setFaceOutside(false);
          }
        } catch { /* ignore */ }
      } else if (quality.faceDetected) {
        faceDetected = quality.faceDetected;
        faceCoverage = quality.faceCoverage;
      }

      const overall = Math.round(
        (sharpness >= 5 ? 35 : (sharpness / 5) * 35) +
        (brightness > 20 && brightness < 90 ? 25 : 0) +
        (faceDetected ? 25 : 0) +
        (quality.zonesCovered > 0 ? Math.min(15, quality.zonesCovered * 2.5) : 0)
      );
      setQuality(prev => ({ ...prev, sharpness, brightness, faceDetected, faceCoverage, overall }));

      // Auto-capture in face mode only
      if (!capturingRef.current) {
        if (overall >= AUTO_CAPTURE_THRESHOLD_FACE) {
          if (goodSinceRef.current === null) goodSinceRef.current = now;
          const elapsed = now - goodSinceRef.current;
          const progress = Math.min(100, (elapsed / AUTO_CAPTURE_HOLD_MS) * 100);
          setCountdown(progress);
          if (elapsed >= AUTO_CAPTURE_HOLD_MS) {
            goodSinceRef.current = null;
            setCountdown(0);
            captureRef.current?.();
            return;
          }
        } else {
          if (goodSinceRef.current !== null) { goodSinceRef.current = null; setCountdown(0); }
        }
      }
    }

    animRef.current = requestAnimationFrame(analyzeFrame);
  }, [isHairMode, quality.faceDetected, quality.faceCoverage, quality.zonesCovered]);

  // Keep analyzeFrameRef in sync for manual restarts
  const analyzeFrameRef = useRef(analyzeFrame);
  useEffect(() => { analyzeFrameRef.current = analyzeFrame; }, [analyzeFrame]);

  useEffect(() => {
    const t = setTimeout(() => { animRef.current = requestAnimationFrame(analyzeFrame); }, 600);
    return () => { clearTimeout(t); cancelAnimationFrame(animRef.current); };
  }, [analyzeFrame]);

  // ── Face mode capture ─────────────────────────────────────────────────────
  const captureRef = useRef<(() => void) | null>(null);

  const capture = useCallback(async () => {
    if (capturingRef.current) return;
    capturingRef.current = true;
    setCapturing(true);
    cancelAnimationFrame(animRef.current);

    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) { setCapturing(false); return; }

    const W = video.videoWidth  || 640;
    const H = video.videoHeight || 480;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.save(); ctx.scale(-1, 1); ctx.drawImage(video, -W, 0, W, H); ctx.restore();

    streamRef.current?.getTracks().forEach(t => t.stop());

    const sharpness  = measureSharpness(ctx, W, H);
    const brightness = measureBrightness(ctx, W, H);

    let landmarks: Array<{ x: number; y: number; z: number }> | null = null;
    let zonesCovered = 0;
    let blazeBox: CaptureResult['blazeBox'] = null;

    const mpLandmarker = await getMPImageLandmarker();
    if (mpLandmarker) {
      try {
        const result = mpLandmarker.detect(canvas);
        if (result.faceLandmarks.length > 0) {
          landmarks = result.faceLandmarks[0];
          zonesCovered = countZonesCovered(landmarks);
        }
      } catch (e) {
        console.warn('MediaPipe landmark detection failed', e);
      }
    }

    let bfOverlapPct = 0;
    if (bfRef.current) {
      try {
        const preds = await bfRef.current.estimateFaces(canvas, false);
        if (preds.length > 0) {
          blazeBox = { topLeft: preds[0].topLeft, bottomRight: preds[0].bottomRight };
          bfOverlapPct = faceInOval(preds[0], video).overlapPct;
        }
      } catch { /* non-fatal */ }
    }

    const faceDetected = (!!landmarks && zonesCovered >= 3) || bfOverlapPct >= 60;
    const faceCoverage = bfOverlapPct || (landmarks ? 80 : 0);
    const overall = Math.round(
      (sharpness >= 5 ? 35 : (sharpness / 5) * 35) +
      (brightness > 20 && brightness < 90 ? 25 : 0) +
      (faceDetected ? 25 : 0) +
      Math.min(15, zonesCovered * 2.5)
    );

    const finalQuality: QualityMetrics = { sharpness, brightness, faceDetected, faceCoverage, zonesCovered, overall };
    setQuality(finalQuality);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    onCapture({ dataUrl, mimeType: 'image/jpeg', quality: finalQuality, landmarks, blazeBox });

    capturingRef.current = false;
    setCapturing(false);
  }, [onCapture, quality.faceCoverage]);

  useEffect(() => { captureRef.current = capture; }, [capture]);

  // ── Hair mode capture (per-shot) ──────────────────────────────────────────
  const captureHairShot = useCallback(async () => {
    if (capturingRef.current) return;

    // Pre-capture gate: if segmenter is running and has confirmed no hair, reject
    // immediately without wasting a burst on a dark carpet, clothing, or wrong object.
    // Alopecia patients, hairline shots, and manual-mode are always allowed through.
    const currentShotIsHairline = hairShotDefs[hairShotIdxRef.current]?.id === 'hairline';
    if (!isAlopeciaRef.current && !currentShotIsHairline && segmenterReadyRef.current && !liveHairOkRef.current) {
      setValidationResult({
        passed: false,
        reason: 'no_hair_detected',
        message: 'No hair detected in frame.\n\nPoint the camera straight down at your crown so hair fills the circle, then tap the shutter.',
        confidence: 0.1,
        attemptNumber: hairValidationAttempt,
      });
      setShowValidationFeedback(true);
      return;
    }

    capturingRef.current = true;
    setCapturing(true);
    cancelAnimationFrame(animRef.current);

    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) { capturingRef.current = false; setCapturing(false); return; }

    const W = video.videoWidth  || 640;
    const H = video.videoHeight || 480;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // Multi-burst: capture 3 frames 200ms apart, keep the sharpest one.
    // The stream stays live during burst so we can pick the steadiest frame.
    type BurstFrame = { sharpness: number; brightness: number; dataUrl: string };
    const frames: BurstFrame[] = [];
    for (let i = 0; i < 3; i++) {
      if (i > 0) await new Promise<void>(r => setTimeout(r, 200));
      ctx.save(); ctx.scale(-1, 1); ctx.drawImage(video, -W, 0, W, H); ctx.restore();
      frames.push({
        sharpness: measureSharpness(ctx, W, H),
        brightness: measureBrightness(ctx, W, H),
        dataUrl: canvas.toDataURL('image/jpeg', 0.88),
      });
    }
    const best = frames.reduce((a, b) => a.sharpness > b.sharpness ? a : b);

    // Re-draw best frame onto canvas so downstream validation reads the right pixels
    const bestImg = new Image();
    await new Promise<void>(r => { bestImg.onload = () => r(); bestImg.src = best.dataUrl; });
    ctx.drawImage(bestImg, 0, 0, W, H);

    const sharpness  = best.sharpness;
    const brightness = best.brightness;
    const overall = Math.round(
      (sharpness >= 5 ? 50 : (sharpness / 5) * 50) +
      (brightness > 20 && brightness < 90 ? 50 : 0)
    );

    const shotQuality: QualityMetrics = {
      sharpness, brightness, faceDetected: false, faceCoverage: 0, zonesCovered: 0, overall,
    };
    const dataUrl = best.dataUrl;

    // Store pending data so the overlay's "Proceed Anyway" handler can access it
    setPendingHairDataUrl(dataUrl);
    setPendingHairQuality(shotQuality);

    const shotType = hairShotDefs[hairShotIdx]?.id ?? 'crown';
    let validation = await validateHairShot(canvas, shotType, overall, hairValidationAttempt, patientCondition);

    // Second post-capture pass — runs only when first pass succeeds cleanly.
    // Catches blurry images and wrong-object photos (walls, ceilings, etc.)
    // that slipped through the live-feed quality gate.
    if (validation.passed && !validation.warning) {
      const secondPass = await validateHairShotPostCapture(canvas, shotType, sharpness, patientCondition);
      if (!secondPass.passed) {
        validation = {
          passed: false,
          reason: secondPass.reason,
          message: secondPass.message,
          confidence: 0.15,
          attemptNumber: hairValidationAttempt,
        };
      }
    }

    console.log('[Hair Validation]', validation);

    // Always show validation feedback after capture
    setValidationResult(validation);
    setShowValidationFeedback(true);
    capturingRef.current = false;
    setCapturing(false);

    if (validation.passed && !validation.warning) {
      // Brief success flash, then auto-advance to review + start GCV validation
      const _dataUrl = dataUrl;
      const _quality = shotQuality;
      const _shotIdx = hairShotIdx;
      setTimeout(() => {
        setShowValidationFeedback(false);
        setValidationResult(null);
        enterReview(_dataUrl, _quality, _shotIdx);
      }, 900);
    } else if (!validation.passed) {
      // Restart live feed so the user can retake without re-entering shoot phase
      goodSinceRef.current = null;
      setHairCountdown(0);
      setTimeout(() => { animRef.current = requestAnimationFrame(analyzeFrameRef.current); }, 100);
    }
    // For warning (passed=true, warning=true): user presses Retake or Proceed Anyway
  }, [hairShotIdx, hairValidationAttempt]);

  useEffect(() => { captureHairShotRef.current = captureHairShot; }, [captureHairShot]);

  // ── Per-shot GCV validation ───────────────────────────────────────────────
  function enterReview(dataUrl: string, qual: QualityMetrics, shotIdx: number) {
    const shotType: HairShotType = hairShotDefs[shotIdx]?.id ?? 'crown';
    setReviewDataUrl(dataUrl);
    setReviewQuality(qual);
    setHairValidationAttempt(1);
    setReviewValidation(null);
    setIsReviewValidating(false);
    hairPhaseRef.current = 'review';
    setHairPhase('review');

    const validate = onValidateShotRef.current;
    if (validate) {
      setIsReviewValidating(true);
      validate(dataUrl, 'image/jpeg', shotType)
        .then(r => setReviewValidation(r))
        .catch(() => setReviewValidation({ valid: true, reason: 'validation_skipped', message: '', confidence: 0.5 }))
        .finally(() => setIsReviewValidating(false));
    }
  }

  // ── Hair mode navigation ──────────────────────────────────────────────────
  function handleHairReady() {
    hairPhaseRef.current = 'shoot';
    setHairPhase('shoot');
    cancelAnimationFrame(animRef.current);
    setTimeout(() => {
      animRef.current = requestAnimationFrame(analyzeFrameRef.current);
    }, 300);
  }

  function handleHairRetake() {
    setReviewDataUrl(null);
    setReviewQuality(null);
    setReviewValidation(null);
    setIsReviewValidating(false);
    goodSinceRef.current = null;
    setHairCountdown(0);
    hairPhaseRef.current = 'shoot';
    setHairPhase('shoot');
    cancelAnimationFrame(animRef.current);
    setTimeout(() => {
      animRef.current = requestAnimationFrame(analyzeFrameRef.current);
    }, 100);
  }

  function handleHairUse() {
    setReviewValidation(null);
    setIsReviewValidating(false);
    const shotDef = hairShotDefs[hairShotIdx];
    const newShot: HairShotResult = {
      shotType: shotDef.id,
      shotLabel: shotDef.label,
      dataUrl: reviewDataUrl!,
      quality: reviewQuality!,
    };
    const newShots = [...hairShots, newShot];
    setHairShots(newShots);

    if (hairShotIdx + 1 < hairShotDefs.length) {
      setHairShotIdx(prev => prev + 1);
      setReviewDataUrl(null);
      setReviewQuality(null);
      hairPhaseRef.current = 'instruct';
      setHairPhase('instruct');
    } else {
      // All shots done
      streamRef.current?.getTracks().forEach(t => t.stop());
      const overallBest = Math.max(...newShots.map(s => s.quality.overall));
      const bestQuality: QualityMetrics = {
        sharpness: Math.max(...newShots.map(s => s.quality.sharpness)),
        brightness: newShots[0].quality.brightness,
        faceDetected: false,
        faceCoverage: 0,
        zonesCovered: 0,
        overall: overallBest,
      };
      onCapture({
        dataUrl: newShots[0].dataUrl,
        mimeType: 'image/jpeg',
        quality: bestQuality,
        landmarks: null,
        blazeBox: null,
        hairShots: newShots,
      });
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>📷</div>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>{error}</p>
        <button className="btn-primary" onClick={onCancel} style={{ maxWidth: 200 }}>Go Back</button>
      </div>
    );
  }

  // ── Hair: Instruct screen ─────────────────────────────────────────────────
  if (isHairMode && hairPhase === 'instruct') {
    const shotDef = hairShotDefs[hairShotIdx];
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0a0a12', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Hidden camera warming up */}
        <video ref={videoRef} playsInline muted style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Header */}
        <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', padding: '4px 0' }}>
            ← Cancel
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {hairShotDefs.map((s, i) => (
              <div key={s.id} style={{
                width: 8, height: 8, borderRadius: '50%',
                background: i < hairShotIdx ? '#10b981' : i === hairShotIdx ? '#a78bfa' : 'rgba(255,255,255,0.15)',
                transition: 'background 0.3s',
              }} />
            ))}
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 20px 28px', overflow: 'auto' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed', letterSpacing: 1, marginBottom: 6 }}>
            PHOTO {hairShotIdx + 1} OF {hairShotDefs.length}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 18, lineHeight: 1.2 }}>
            {shotDef.instructTitle}
          </div>

          {/* Reference image */}
          <div style={{
            borderRadius: 18,
            overflow: 'hidden',
            marginBottom: 20,
            border: '1.5px solid rgba(124,58,237,0.25)',
            flexShrink: 0,
            maxHeight: 250,
          }}>
            {shotDef.id === 'crown' ? <CrownReference /> : shotDef.id === 'hairline' ? <HairlineReference /> : <ScalpReference />}
          </div>

          <div style={{ fontSize: 15, color: '#94a3b8', lineHeight: 1.65, marginBottom: 28, flex: 1 }}>
            {shotDef.instructBody}
          </div>

          <button onClick={handleHairReady} className="btn-primary" style={{ width: '100%', fontSize: 16, padding: '15px', flexShrink: 0 }}>
            I'm Ready →
          </button>
        </div>
      </div>
    );
  }

  // ── Hair: Review screen ───────────────────────────────────────────────────
  if (isHairMode && hairPhase === 'review' && reviewDataUrl) {
    const shotDef = hairShotDefs[hairShotIdx];
    const q = reviewQuality;
    const isLastShot = hairShotIdx + 1 >= hairShotDefs.length;
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0a0a12', display: 'flex', flexDirection: 'column' }}>
        <video ref={videoRef} playsInline muted style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        <div style={{ padding: '20px 20px 12px', flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed', letterSpacing: 1, marginBottom: 4 }}>
            PHOTO {hairShotIdx + 1} OF {hairShotDefs.length} · REVIEW
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>{shotDef.label}</div>
        </div>

        <div style={{ flex: 1, overflow: 'hidden', margin: '0 20px' }}>
          <img
            src={reviewDataUrl}
            alt={shotDef.label}
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 16, display: 'block' }}
          />
        </div>

        <div style={{ padding: '16px 20px 32px', flexShrink: 0 }}>
          {q && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <QualityPill label="Quality"   ok={q.overall >= 50} />
              <QualityPill label="Sharpness" ok={q.sharpness >= 5} />
              <QualityPill label="Lighting"  ok={q.brightness > 30 && q.brightness < 82} />
            </div>
          )}
          {q && q.overall < 50 && (
            <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, marginBottom: 14, fontSize: 13, color: '#fbbf24' }}>
              ⚠ Low quality — try better lighting or hold the phone steadier.
            </div>
          )}

          {/* GCV validation — small non-blocking note; no spinner so it can't hang */}
          {isReviewValidating && (
            <div style={{ fontSize: 11, color: '#475569', textAlign: 'center', marginBottom: 10 }}>
              Verifying photo in background…
            </div>
          )}
          {!isReviewValidating && reviewValidation && reviewValidation.valid && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 10, marginBottom: 14, fontSize: 13, color: '#10b981' }}>
              <span style={{ fontSize: 15 }}>✓</span>
              Photo validated — {shotDef.label} looks good
            </div>
          )}
          {!isReviewValidating && reviewValidation && !reviewValidation.valid && (
            <div style={{ padding: '12px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 16 }}>❌</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#f87171' }}>{shotDef.label} photo check failed</span>
              </div>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                {reviewValidation.message || 'Photo doesn\'t show hair or scalp clearly. Please retake.'}
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleHairRetake}
              style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
            >
              Retake {shotDef.label}
            </button>
            {/* Definitive GCV rejections (wrong object, face selfie): no bypass allowed.
                Ambiguous rejections (no_hair_visible — thin hair, alopecia edge cases): bypass ok.
                validation_skipped or valid: proceed normally. */}
            {!isReviewValidating && reviewValidation && !reviewValidation.valid
              ? ['wrong_object', 'face_selfie', 'full_selfie'].includes(reviewValidation.reason)
                ? null  // Retake is the only option — right slot hidden
                : (
                  <button onClick={handleHairUse} style={{ flex: 2, padding: '14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#64748b', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    Use Anyway
                  </button>
                )
              : (
                <button
                  onClick={handleHairUse}
                  className="btn-primary"
                  style={{ flex: 2, fontSize: 15, padding: '14px', opacity: isReviewValidating ? 0.7 : 1 }}
                >
                  {isReviewValidating ? 'Use This →' : isLastShot ? 'Use This ✓' : 'Next Shot →'}
                </button>
              )
            }
          </div>
        </div>
      </div>
    );
  }

  // ── Shoot screen (face mode + hair shoot phase) ───────────────────────────
  const Q = quality;
  const currentHairShot = isHairMode ? hairShotDefs[hairShotIdx] : null;

  // ── Quality checks (pass / fail) ─────────────────────────────────────────
  const lightingOk  = Q.brightness >= 30 && Q.brightness <= 82;
  const sharpnessOk = Q.sharpness >= 5;
  const faceOk      = !isHairMode ? (Q.faceDetected && Q.faceCoverage >= 15) : true;
  const zonesOk     = !isHairMode ? Q.zonesCovered >= 4 : true;
  const hairOk      = isHairMode ? liveHairOk : true;

  const ghostUrl = isHairMode && ghostShots
    ? (ghostShots as Record<string, string | undefined>)[hairShotDefs[hairShotIdx]?.id]
    : undefined;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <video
          ref={videoRef}
          playsInline muted
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Ghost overlay */}
        {ghostUrl && (
          <img
            src={ghostUrl}
            alt="ghost"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.28, pointerEvents: 'none', transform: 'scaleX(-1)' }}
          />
        )}

        {/* Guide */}
        {isHairMode ? (
          currentHairShot?.id === 'hairline' ? (
            // Hairline: horizontal band guide across the middle of frame
            <div style={{
              position: 'absolute', top: '35%', left: '10%',
              width: '80%', height: '30%',
              borderRadius: 12,
              border: `2px dashed ${Q.overall >= AUTO_CAPTURE_THRESHOLD_HAIR ? 'rgba(167,139,250,0.9)' : 'rgba(255,255,255,0.30)'}`,
              boxShadow: Q.overall >= AUTO_CAPTURE_THRESHOLD_HAIR ? '0 0 28px rgba(124,58,237,0.35)' : 'none',
              transition: 'border-color 0.3s, box-shadow 0.3s',
              pointerEvents: 'none',
            }} />
          ) : (
            // Crown / scalp: circular guide
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '80%', paddingTop: '80%', borderRadius: '50%',
              border: `2px dashed ${Q.overall >= AUTO_CAPTURE_THRESHOLD_HAIR ? 'rgba(167,139,250,0.9)' : 'rgba(255,255,255,0.30)'}`,
              boxShadow: Q.overall >= AUTO_CAPTURE_THRESHOLD_HAIR ? '0 0 28px rgba(124,58,237,0.35)' : 'none',
              transition: 'border-color 0.3s, box-shadow 0.3s',
              pointerEvents: 'none',
            }} />
          )
        ) : (
          <div style={{
            position: 'absolute', top: '8%', left: '50%', transform: 'translateX(-50%)',
            width: '62%', paddingTop: '85%', borderRadius: '50%',
            border: `2.5px solid ${Q.faceDetected ? 'rgba(16,185,129,0.80)' : faceOutside ? 'rgba(245,158,11,0.80)' : 'rgba(255,255,255,0.25)'}`,
            boxShadow: Q.faceDetected ? '0 0 24px rgba(16,185,129,0.25)' : faceOutside ? '0 0 18px rgba(245,158,11,0.20)' : 'none',
            transition: 'border-color 0.25s, box-shadow 0.25s',
            pointerEvents: 'none',
          }} />
        )}

        {/* Instruction text */}
        <div style={{ position: 'absolute', top: '6%', left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.88)', fontSize: 13, fontWeight: 500, textShadow: '0 1px 6px rgba(0,0,0,0.9)', padding: '0 16px' }}>
          {isHairMode
            ? segmenterUnavailable
              ? 'Hair detection unavailable — tap shutter to capture manually'
              : (!liveHairOk && quality.overall >= 35
                  ? (hairShotIdx === 0 ? 'Point camera straight down at your crown' : 'Part your hair and point camera at the parting')
                  : currentHairShot?.shootHint)
            : countdown > 0 ? '✓ Hold still — capturing…'
            : Q.faceDetected ? 'Face detected — hold still for auto-capture'
            : faceOutside ? 'Move your face into the oval'
            : 'Position your face inside the oval'}
        </div>

        {/* Hair shot badge */}
        {isHairMode && (
          <div style={{ position: 'absolute', top: 14, right: 14, padding: '4px 10px', borderRadius: 100, background: 'rgba(124,58,237,0.85)', backdropFilter: 'blur(6px)', fontSize: 11, fontWeight: 700, color: 'white' }}>
            {hairShotIdx + 1} / {hairShotDefs.length}
          </div>
        )}

        {/* Face mode countdown */}
        {!isHairMode && countdown > 0 && (() => {
          const secondsLeft = Math.ceil(3 - (countdown / 100) * 3);
          return (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div key={secondsLeft} style={{ fontSize: 120, fontWeight: 900, color: 'white', textShadow: '0 0 40px rgba(16,185,129,0.9), 0 2px 20px rgba(0,0,0,0.8)', lineHeight: 1, animation: 'countdownPop 0.25s ease-out', userSelect: 'none' }}>
                {secondsLeft || ''}
              </div>
            </div>
          );
        })()}

        {/* Face mode: model badges */}
        {!isHairMode && (
          <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
            <ModelBadge label="BlazeFace" ready={bfReady} />
            <ModelBadge label="FaceMesh" ready={mpReady} />
          </div>
        )}

        <button onClick={onCancel} style={{ position: 'absolute', top: 14, left: 14, background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: 20, color: 'white', fontSize: 13, padding: '6px 14px', cursor: 'pointer', backdropFilter: 'blur(8px)' }}>
          Cancel
        </button>
      </div>


      {/* Hair validation feedback overlay */}
      {isHairMode && showValidationFeedback && validationResult && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1.5rem',
        }}>
          <div style={{
            background: 'var(--bg-card, #12121e)',
            borderRadius: 20,
            padding: '2rem 1.5rem',
            width: '100%', maxWidth: 360,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem', lineHeight: 1 }}>
              {validationResult.passed && !validationResult.warning
                ? '✅'
                : validationResult.critical
                ? '🚫'
                : validationResult.warning
                ? '⚠️'
                : '❌'}
            </div>

            <div style={{
              fontSize: '1rem', lineHeight: 1.6,
              color: 'var(--text-primary, #f1f5f9)',
              marginBottom: '1.25rem',
              whiteSpace: 'pre-line',
            }}>
              {validationResult.message}
            </div>

            {/* Confidence bar — always shown */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary, #94a3b8)', marginBottom: 6 }}>
                Quality: {Math.round(validationResult.confidence * 100)}%
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.round(validationResult.confidence * 100)}%`,
                  height: '100%', borderRadius: 3,
                  background: validationResult.confidence > 0.6
                    ? 'var(--green, #10b981)'
                    : validationResult.confidence > 0.35
                    ? 'var(--yellow, #f59e0b)'
                    : 'var(--red, #ef4444)',
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>

            {!validationResult.passed && validationResult.attemptNumber > 1 && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary, #94a3b8)', marginBottom: '1rem' }}>
                Attempt {validationResult.attemptNumber} of {VALIDATION_CONFIG.maxAttempts}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {validationResult.passed && !validationResult.warning ? (
                <div style={{ padding: '12px', color: '#64748b', fontSize: 13, textAlign: 'center' }}>
                  Proceeding automatically…
                </div>
              ) : (
                <>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      setShowValidationFeedback(false);
                      setValidationResult(null);
                      setHairValidationAttempt(prev => Math.min(prev + 1, VALIDATION_CONFIG.maxAttempts));
                      goodSinceRef.current = null;
                      setHairCountdown(0);
                      setTimeout(() => { animRef.current = requestAnimationFrame(analyzeFrameRef.current); }, 100);
                    }}
                  >
                    Retake Photo
                  </button>

                  {validationResult.warning && (
                    <button
                      onClick={() => {
                        setShowValidationFeedback(false);
                        setValidationResult(null);
                        cancelAnimationFrame(animRef.current);
                        enterReview(pendingHairDataUrl!, pendingHairQuality!, hairShotIdx);
                      }}
                      style={{
                        padding: '12px', borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'transparent',
                        color: 'var(--text-secondary, #94a3b8)',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      Proceed Anyway
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom controls — compact bar, safe-area padded for Android nav */}
      <div style={{
        background: 'rgba(10,10,18,0.97)',
        paddingTop: 10,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 52px)',
        paddingLeft: 20,
        paddingRight: 20,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
      }}>
        {/* Quality checks — 3 stacked rows */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <CheckRow ok={lightingOk} label="Lighting"
            hint={lightingOk ? null : Q.brightness < 30 ? 'Move to a brighter spot' : 'Step away from direct light'} />
          <CheckRow ok={sharpnessOk} label="Sharpness"
            hint={sharpnessOk ? null : 'Hold the phone still'} />
          {isHairMode
            ? segmenterUnavailable
              ? <CheckRow ok={true} label="Manual" hint={null} />
              : <CheckRow ok={hairOk} label="Frame"
                  hint={hairOk ? null : currentHairShot?.id === 'hairline' ? 'Aim at your hairline and forehead' : currentHairShot?.id === 'scalp' ? 'Part your hair and point camera at the parting' : 'Point camera straight down at your crown'} />
            : <CheckRow ok={faceOk && zonesOk} label="Face"
                hint={!faceOk ? (Q.faceDetected ? 'Move a little closer' : 'Centre your face in the oval') : !zonesOk ? 'Tilt slightly to show more of your face' : null} />
          }
        </div>

        {/* Shutter button — 64px, centred */}
        <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
          <svg width="64" height="64" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
            <circle cx="32" cy="32" r="27" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
            {(isHairMode ? hairCountdown : countdown) > 0 && (
              <circle cx="32" cy="32" r="27" fill="none"
                stroke={isHairMode ? '#a78bfa' : '#10b981'}
                strokeWidth="4" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 27}
                strokeDashoffset={2 * Math.PI * 27 * (1 - (isHairMode ? hairCountdown : countdown) / 100)}
                style={{ transition: 'stroke-dashoffset 0.1s linear' }}
              />
            )}
          </svg>
          <button
            onClick={isHairMode ? captureHairShot : capture}
            disabled={capturing}
            style={{
              position: 'absolute', inset: 6,
              borderRadius: '50%',
              background: capturing ? '#1e1e30'
                : isHairMode
                ? (Q.overall >= AUTO_CAPTURE_THRESHOLD_HAIR ? 'linear-gradient(135deg, #7c3aed, #5b21b6)' : 'linear-gradient(135deg, #4c1d95, #3b0764)')
                : countdown > 0 || Q.overall >= AUTO_CAPTURE_THRESHOLD_FACE
                ? 'linear-gradient(135deg, #059669, #047857)'
                : 'linear-gradient(135deg, #7c3aed, #5b21b6)',
              border: '2px solid rgba(255,255,255,0.08)',
              cursor: capturing ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isHairMode
                ? (Q.overall >= AUTO_CAPTURE_THRESHOLD_HAIR ? '0 0 28px rgba(124,58,237,0.65)' : '0 0 16px rgba(124,58,237,0.3)')
                : countdown > 0 ? '0 0 28px rgba(16,185,129,0.65)'
                : '0 0 20px rgba(124,58,237,0.45)',
              transition: 'background 0.3s, box-shadow 0.3s',
            }}
          >
            {capturing
              ? <div className="spinner" style={{ width: 22, height: 22, borderWidth: 2 }} />
              : <svg viewBox="0 0 24 24" fill="white" width="22" height="22">
                  <path d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z"/>
                  <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
                </svg>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reference images ─────────────────────────────────────────────────────────

function CrownReference() {
  return (
    <svg viewBox="0 0 260 260" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <radialGradient id="crownBg" cx="48%" cy="44%" r="60%">
          <stop offset="0%" stopColor="#3b1a0a"/>
          <stop offset="55%" stopColor="#1a0a04"/>
          <stop offset="100%" stopColor="#080402"/>
        </radialGradient>
        <radialGradient id="crownGlow" cx="50%" cy="44%" r="35%">
          <stop offset="0%" stopColor="#5a3018" stopOpacity="0.7"/>
          <stop offset="100%" stopColor="#5a3018" stopOpacity="0"/>
        </radialGradient>
        <clipPath id="headClip">
          <ellipse cx="130" cy="128" rx="112" ry="118"/>
        </clipPath>
      </defs>
      <rect width="260" height="260" fill="#050302"/>
      <ellipse cx="130" cy="128" rx="112" ry="118" fill="url(#crownBg)"/>
      {/* Hair strands radiating from crown */}
      <g clipPath="url(#headClip)" stroke="#0e0705" strokeWidth="3" fill="none" opacity="0.85">
        <path d="M130 112 Q126 88 120 62"/>
        <path d="M130 112 Q134 88 140 62"/>
        <path d="M130 112 Q116 86 100 60"/>
        <path d="M130 112 Q144 86 160 60"/>
        <path d="M130 112 Q108 88 88 66"/>
        <path d="M130 112 Q152 88 172 66"/>
        <path d="M118 116 Q92 112 64 116"/>
        <path d="M142 116 Q168 112 196 116"/>
        <path d="M116 122 Q88 120 58 126"/>
        <path d="M144 122 Q172 120 202 126"/>
        <path d="M130 132 Q126 156 122 184"/>
        <path d="M130 132 Q134 156 138 184"/>
        <path d="M130 132 Q118 158 108 188"/>
        <path d="M130 132 Q142 158 152 188"/>
        <path d="M130 132 Q110 160 94 192"/>
        <path d="M130 132 Q150 160 166 192"/>
        <path d="M120 110 Q96 92 74 78"/>
        <path d="M140 110 Q164 92 186 78"/>
        <path d="M114 120 Q88 104 66 92"/>
        <path d="M146 120 Q172 104 194 92"/>
      </g>
      {/* Hair highlights */}
      <g clipPath="url(#headClip)" stroke="#4a2810" strokeWidth="1.5" fill="none" opacity="0.4">
        <path d="M130 112 Q126 90 120 64"/>
        <path d="M130 112 Q134 90 140 64"/>
        <path d="M118 116 Q92 114 64 118"/>
        <path d="M142 116 Q168 114 196 118"/>
        <path d="M130 132 Q126 154 122 182"/>
        <path d="M130 132 Q134 154 138 182"/>
      </g>
      {/* Crown whorl */}
      <ellipse cx="130" cy="116" rx="24" ry="20" fill="url(#crownGlow)"/>
      <circle cx="130" cy="116" r="6" fill="rgba(100,48,20,0.55)"/>
      {/* Edge vignette */}
      <ellipse cx="130" cy="128" rx="112" ry="118" fill="none" stroke="#050302" strokeWidth="22" opacity="0.85"/>
      {/* SAMPLE badge */}
      <rect x="10" y="10" width="62" height="22" rx="8" fill="rgba(124,58,237,0.92)"/>
      <text x="41" y="24" textAnchor="middle" fontSize="10" fontWeight="700" fill="white" fontFamily="system-ui,sans-serif">SAMPLE</text>
    </svg>
  );
}

function ScalpReference() {
  const topXs  = [10, 28, 46, 64, 82, 100, 118, 136, 154, 172, 190, 208, 226, 244];
  const topXs2 = [18, 36, 54, 72, 90, 108, 126, 144, 162, 180, 198, 216, 234];
  return (
    <svg viewBox="0 0 260 195" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <linearGradient id="htop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0c0604"/>
          <stop offset="100%" stopColor="#1e0f06"/>
        </linearGradient>
        <linearGradient id="hbot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e0f06"/>
          <stop offset="100%" stopColor="#0c0604"/>
        </linearGradient>
        <linearGradient id="scalp" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#a87050"/>
          <stop offset="30%" stopColor="#c99060"/>
          <stop offset="50%" stopColor="#d9a878"/>
          <stop offset="70%" stopColor="#c99060"/>
          <stop offset="100%" stopColor="#a87050"/>
        </linearGradient>
      </defs>
      <rect width="260" height="195" fill="#080403"/>
      <rect x="0" y="0" width="260" height="82" fill="url(#htop)"/>
      <rect x="0" y="113" width="260" height="82" fill="url(#hbot)"/>
      <rect x="0" y="80" width="260" height="35" fill="url(#scalp)"/>
      {/* Scalp texture */}
      {[30, 70, 110, 150, 190, 230].flatMap(x =>
        [88, 92, 96, 100, 104, 108].map(y => (
          <circle key={`p-${x}-${y}`} cx={x} cy={y} r="1.1" fill="rgba(140,90,55,0.28)"/>
        ))
      )}
      {/* Top hair strands converging down */}
      <g stroke="#140a04" strokeWidth="2.5" fill="none" opacity="0.8">
        {topXs.map((x, i) => <path key={`ta-${i}`} d={`M${x} 0 Q${x+5} 40 ${x+2} 80`}/>)}
        {topXs2.map((x, i) => <path key={`tb-${i}`} d={`M${x} 0 Q${x-4} 38 ${x-2} 80`}/>)}
      </g>
      {/* Bottom hair strands converging up */}
      <g stroke="#140a04" strokeWidth="2.5" fill="none" opacity="0.8">
        {topXs.map((x, i) => <path key={`ba-${i}`} d={`M${x} 195 Q${x+5} 155 ${x+2} 115`}/>)}
        {topXs2.map((x, i) => <path key={`bb-${i}`} d={`M${x} 195 Q${x-4} 157 ${x-2} 115`}/>)}
      </g>
      {/* Highlight streaks */}
      <g stroke="#3d1a08" strokeWidth="1.2" fill="none" opacity="0.4">
        {[50, 110, 170, 220].map((x, i) => <path key={`ht-${i}`} d={`M${x} 0 Q${x+3} 40 ${x+1} 80`}/>)}
        {[50, 110, 170, 220].map((x, i) => <path key={`hb-${i}`} d={`M${x} 195 Q${x+3} 155 ${x+1} 115`}/>)}
      </g>
      {/* Part edge shadows */}
      <rect x="0" y="78" width="260" height="4" fill="rgba(0,0,0,0.38)"/>
      <rect x="0" y="113" width="260" height="3" fill="rgba(0,0,0,0.28)"/>
      {/* SAMPLE badge */}
      <rect x="10" y="10" width="62" height="22" rx="8" fill="rgba(124,58,237,0.92)"/>
      <text x="41" y="24" textAnchor="middle" fontSize="10" fontWeight="700" fill="white" fontFamily="system-ui,sans-serif">SAMPLE</text>
    </svg>
  );
}

function HairlineReference() {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <img
        src={HAIRLINE_REFERENCE_URL}
        alt="Hairline photo example"
        style={{ width: '100%', display: 'block', borderRadius: 18 }}
      />
      <div style={{
        position: 'absolute', top: 10, left: 10,
        padding: '3px 10px', borderRadius: 8,
        background: 'rgba(124,58,237,0.92)',
        fontSize: 10, fontWeight: 700, color: 'white',
        fontFamily: 'system-ui,sans-serif',
      }}>
        EXAMPLE
      </div>
    </div>
  );
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────

function CheckRow({ ok, label, hint }: { ok: boolean; label: string; hint: string | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        fontSize: 13, width: 16, textAlign: 'center', flexShrink: 0,
        color: ok ? '#10b981' : '#ef4444',
        transition: 'color 0.3s',
      }}>
        {ok ? '✓' : '✗'}
      </span>
      <span style={{
        fontSize: 12, fontWeight: 600,
        color: ok ? '#e2e8f0' : '#ef4444',
        transition: 'color 0.3s',
      }}>
        {label}
      </span>
      {!ok && hint && (
        <span style={{ fontSize: 11, color: '#94a3b8' }}>— {hint}</span>
      )}
    </div>
  );
}

function ModelBadge({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 100, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: ready ? '#10b981' : '#f59e0b', flexShrink: 0 }} />
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function QualityPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, background: ok ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${ok ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
      <span style={{ fontSize: 12, color: ok ? '#10b981' : '#f59e0b' }}>{ok ? '✓' : '!'}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: ok ? '#10b981' : '#f59e0b' }}>{label}</span>
    </div>
  );
}
