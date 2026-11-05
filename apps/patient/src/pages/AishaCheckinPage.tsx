/**
 * AishaCheckinPage — Unified check-in flow.
 *
 * Steps:
 *  1. welcome        — intro screen
 *  2. q1 / q2        — Aisha asks 2 questions, patient speaks/types
 *  3. summary        — transcript shown, proceed to photo
 *  4. photo_hairline — hairline photo with 3-second autocapture countdown
 *  5. submitting     — analyze-checkin edge fn
 *  6. done           — success
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { submitCheckin, createCheckinDraft, validatePhoto } from '../lib/api';
import { ORG_SLUG, APP_MODE } from '../lib/supabase';
import { measureSharpness, measureBrightness } from '../lib/imageUtils';

type Step =
  | 'welcome'
  | 'q1' | 'q2'
  | 'summary'
  | 'photo_hairline'
  | 'submitting'
  | 'done';

const QUESTIONS = [
  "How is your skin feeling today? Any redness, itching, or discomfort you've noticed?",
  "Have you applied all your prescribed treatments today? Any side effects or concerns to mention?",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;
declare global {
  interface Window {
    SpeechRecognition?: new () => AnySpeechRecognition;
    webkitSpeechRecognition?: new () => AnySpeechRecognition;
  }
}

function speak(text: string): Promise<void> {
  return new Promise(resolve => {
    if (!window.speechSynthesis) { resolve(); return; }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.95;
    utt.pitch = 1.1;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.toLowerCase().includes('samantha') ||
      v.name.toLowerCase().includes('female') ||
      (v.lang.startsWith('en') && v.name.toLowerCase().includes('google'))
    );
    if (preferred) utt.voice = preferred;
    utt.onend = () => resolve();
    utt.onerror = () => resolve();
    window.speechSynthesis.speak(utt);
  });
}

export default function AishaCheckinPage() {
  const navigate = useNavigate();
  const { patient } = useStore();

  const [step, setStep]                   = useState<Step>('welcome');
  const [answers, setAnswers]             = useState<string[]>(['', '']);
  const [currentInput, setCurrentInput]   = useState('');
  const [isListening, setIsListening]     = useState(false);
  const [isAishaSpeaking, setIsAishaSpeaking] = useState(false);
  const [hairlinePhoto, setHairlinePhoto] = useState<string | null>(null);
  const [photoConfirm, setPhotoConfirm]   = useState<string | null>(null);
  const [countdown, setCountdown]         = useState<number | null>(null);
  const [error, setError]                 = useState<string | null>(null);
  const [validationDone, setValidationDone] = useState(false);
  const [result, setResult]               = useState<{ headline: string; summary: string } | null>(null);

  const [qualityChecks, setQualityChecks] = useState<{
    lighting: 'ok' | 'dim' | 'bright' | null;
    sharpness: 'ok' | 'fail' | null;
    frame: 'ok' | 'fail' | null;
  }>({ lighting: null, sharpness: null, frame: null });

  const videoRef           = useRef<HTMLVideoElement>(null);
  const streamRef          = useRef<MediaStream | null>(null);
  const recognitionRef     = useRef<AnySpeechRecognition | null>(null);
  const checkinIdRef       = useRef<string | null>(null);
  const countdownRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qualityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qualityPassRef     = useRef(0);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    stopCamera();
    window.speechSynthesis?.cancel();
    recognitionRef.current?.abort();
    if (countdownRef.current) clearTimeout(countdownRef.current);
    if (qualityIntervalRef.current) clearInterval(qualityIntervalRef.current);
  }, [stopCamera]);

  // Autocapture countdown tick
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      // Fire capture
      doCapture();
      setCountdown(null);
      return;
    }
    countdownRef.current = setTimeout(() => setCountdown(c => (c !== null ? c - 1 : null)), 1000);
    return () => { if (countdownRef.current) clearTimeout(countdownRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  function stopQualityCheck() {
    if (qualityIntervalRef.current) clearInterval(qualityIntervalRef.current);
    qualityIntervalRef.current = null;
  }

  function startQualityCheck() {
    stopQualityCheck();
    qualityPassRef.current = 0;
    setQualityChecks({ lighting: null, sharpness: null, frame: null });

    qualityIntervalRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return;

      // Use the same canvas resolution as Camera.tsx for consistency
      const W = video.videoWidth  || 640;
      const H = video.videoHeight || 480;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, W, H);

      // Exact same functions as Camera.tsx — proven in production
      const sharpness  = measureSharpness(ctx, W, H);   // 0-100, ≥5 is acceptable
      const brightness = measureBrightness(ctx, W, H);  // 0-100 %, 20-90 is good

      const lightsOk = brightness > 20 && brightness < 90;
      const sharpOk  = sharpness >= 5;
      const frameOk  = sharpness >= 2;

      const lightingState: 'ok' | 'dim' | 'bright' =
        brightness <= 20 ? 'dim' : brightness >= 90 ? 'bright' : 'ok';

      setQualityChecks({
        lighting:  lightsOk ? 'ok' : lightingState,
        sharpness: sharpOk  ? 'ok' : 'fail',
        frame:     frameOk  ? 'ok' : 'fail',
      });

      // All checks must pass — both lighting AND sharpness
      if (lightsOk && sharpOk) {
        qualityPassRef.current++;
        if (qualityPassRef.current >= 3) {
          stopQualityCheck();
          setCountdown(3);
        }
      } else {
        qualityPassRef.current = 0;
      }
    }, 400);
  }

  function doCapture() {
    stopQualityCheck();
    try {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return;
      const canvas = document.createElement('canvas');
      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 480;
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      setPhotoConfirm(dataUrl);
      setError(null);
      setValidationDone(false);
      // Background Google Vision validation
      const b64 = dataUrl.split(',')[1];
      validatePhoto(b64, 'image/jpeg', 'hairline', APP_MODE, patient?.condition)
        .then(r => {
          setValidationDone(true);
          if (!r.valid && r.message) setError(r.message);
        })
        .catch(() => setValidationDone(true));
    } catch {
      setError('Could not capture photo. Please try again.');
    }
  }

  function resetCountdown() {
    if (countdownRef.current) clearTimeout(countdownRef.current);
    setCountdown(null);
    startQualityCheck();
  }

  function cancelCountdown() {
    if (countdownRef.current) clearTimeout(countdownRef.current);
    setCountdown(null);
    stopQualityCheck();
  }

  // ── Welcome → Q1 ──────────────────────────────────────────────────────────
  async function handleStartCall() {
    setStep('q1');
    setIsAishaSpeaking(true);
    const name = patient?.name?.split(' ')[0] ?? 'there';
    await speak(`Hi ${name}! I'm Aisha, your AI care nurse. I have two quick questions for today's check-in. ${QUESTIONS[0]}`);
    setIsAishaSpeaking(false);
  }

  // ── Voice recognition ─────────────────────────────────────────────────────
  function startListening() {
    const SpeechRec = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRec) return;
    const rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = Array.from(e.results).map((r: any) => r[0].transcript).join(' ');
      setCurrentInput(text);
    };
    rec.onend  = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  // ── Submit answer for current question ────────────────────────────────────
  async function handleAnswerSubmit() {
    const ans = currentInput.trim() || '(no response)';
    const idx = step === 'q1' ? 0 : 1;
    const newAnswers = [...answers];
    newAnswers[idx] = ans;
    setAnswers(newAnswers);
    setCurrentInput('');
    setIsListening(false);
    recognitionRef.current?.stop();

    if (idx === 0) {
      setStep('q2');
      setIsAishaSpeaking(true);
      await speak(`Got it, thank you. ${QUESTIONS[1]}`);
      setIsAishaSpeaking(false);
    } else {
      setStep('summary');
      if (patient) {
        const transcript = `Aisha: ${QUESTIONS[0]}\nPatient: ${newAnswers[0]}\n\nAisha: ${QUESTIONS[1]}\nPatient: ${newAnswers[1]}`;
        try {
          const id = await createCheckinDraft(patient.id, ORG_SLUG, patient.current_day, transcript);
          checkinIdRef.current = id;
        } catch { /* non-fatal */ }
      }
      setIsAishaSpeaking(true);
      await speak("Perfect, thank you! Now let's take a quick hairline photo for your doctor.");
      setIsAishaSpeaking(false);
    }
  }

  // ── Start hairline camera + autocapture ───────────────────────────────────
  async function startHairlineCamera() {
    setPhotoConfirm(null);
    setError(null);
    setStep('photo_hairline');
    cancelCountdown();
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      // Start quality checks — countdown fires automatically once all pass
      setTimeout(() => startQualityCheck(), 600);
    } catch {
      setError('Camera access denied. Please allow camera access and try again.');
    }
  }

  function handleRetake() {
    setPhotoConfirm(null);
    setError(null);
    setValidationDone(false);
    setQualityChecks({ lighting: null, sharpness: null, frame: null });
    startHairlineCamera();
  }

  async function handleConfirmPhoto() {
    if (!photoConfirm) return;
    setHairlinePhoto(photoConfirm);
    stopCamera();
    cancelCountdown();
    await handleSubmit(photoConfirm);
  }

  // ── Final submission ──────────────────────────────────────────────────────
  async function handleSubmit(imageDataUrl: string) {
    if (!patient) return;
    setStep('submitting');
    stopCamera();
    setError(null);

    const imageBase64 = imageDataUrl.split(',')[1];
    const symptomsText = [
      answers[0] ? `Symptoms: ${answers[0]}` : '',
      answers[1] ? `Medications: ${answers[1]}` : '',
    ].filter(Boolean).join('. ');

    try {
      const res = await submitCheckin({
        patientId: patient.id,
        orgSlug: ORG_SLUG,
        dayNumber: patient.current_day,
        imageBase64,
        imageMimeType: 'image/jpeg',
        symptomsText: symptomsText || 'Daily check-in',
        adherenceToday: true,
        qualityScore: 80,
        appMode: APP_MODE,
        checkinType: 'face',
        checkinId: checkinIdRef.current ?? undefined,
      });
      setResult({
        headline: res.analysis?.headline ?? 'Check-in complete',
        summary:  res.analysis?.summary  ?? 'Your check-in has been submitted.',
      });
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
      setStep('photo_hairline');
    }
  }

  const currentQ = step === 'q1' ? 0 : 1;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0a12', overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{ height: 44, background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', padding: '0 16px', flexShrink: 0 }}>
        <button onClick={() => { stopCamera(); cancelCountdown(); navigate('/'); }}
          style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          ← Back
        </button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
          {step === 'welcome' ? 'Daily Check-in'
            : step === 'photo_hairline' ? 'Hairline Photo'
            : step === 'summary' ? 'Summary'
            : step === 'done' ? 'Done' : 'Aisha'}
        </span>
        <div style={{ width: 60 }} />
      </div>

      {/* ── WELCOME ── */}
      {step === 'welcome' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
          <div style={{
            width: 90, height: 90, borderRadius: '50%', marginBottom: 20,
            background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40,
            boxShadow: '0 0 40px rgba(124,58,237,0.3)',
          }}>🩺</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Hi, I'm Aisha</div>
          <div style={{ fontSize: 14, color: '#a78bfa', fontWeight: 600, marginBottom: 16 }}>Your AI Care Nurse</div>
          <div style={{ fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 1.6, maxWidth: 300, marginBottom: 32 }}>
            I'll ask you 2 quick questions, then take a hairline photo for your doctor.
          </div>
          <button onClick={handleStartCall} style={{
            width: '100%', maxWidth: 320, padding: '15px', border: 'none', borderRadius: 14,
            background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', color: '#fff',
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(124,58,237,0.4)',
          }}>
            Start Check-in →
          </button>
        </div>
      )}

      {/* ── Q1 / Q2 ── */}
      {(step === 'q1' || step === 'q2') && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 20px 20px' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 24 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
              animation: isAishaSpeaking ? 'pulse 1.5s ease-in-out infinite' : 'none',
            }}>🩺</div>
            <div style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: '4px 14px 14px 14px', padding: '12px 14px', maxWidth: 280 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#a78bfa', marginBottom: 5, letterSpacing: '0.06em' }}>AISHA · Q{currentQ + 1} OF 2</div>
              <div style={{ fontSize: 13, color: '#c4b5fd', lineHeight: 1.5 }}>{QUESTIONS[currentQ]}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 20 }}>
            {[0, 1].map(i => (
              <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i <= currentQ ? '#7c3aed' : 'rgba(255,255,255,0.12)' }} />
            ))}
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 12 }}>
            <textarea
              value={currentInput}
              onChange={e => setCurrentInput(e.target.value)}
              placeholder="Type your response or tap the mic to speak…"
              rows={4}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 14, resize: 'none',
                background: 'rgba(255,255,255,0.05)', border: `1.5px solid ${isListening ? '#7c3aed' : 'rgba(255,255,255,0.1)'}`,
                color: '#e2e8f0', fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
              }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              {(window.SpeechRecognition || window.webkitSpeechRecognition) && (
                <button
                  onClick={isListening ? stopListening : startListening}
                  style={{
                    width: 48, height: 48, borderRadius: '50%', border: 'none', flexShrink: 0,
                    background: isListening ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.07)',
                    color: isListening ? '#ef4444' : '#64748b',
                    fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: isListening ? 'pulse 1s ease-in-out infinite' : 'none',
                  }}
                >🎙️</button>
              )}
              <button
                onClick={handleAnswerSubmit}
                disabled={!currentInput.trim() && !isAishaSpeaking}
                style={{
                  flex: 1, height: 48, borderRadius: 12, border: 'none',
                  background: currentInput.trim() ? 'linear-gradient(135deg, #7c3aed, #5b21b6)' : 'rgba(255,255,255,0.06)',
                  color: currentInput.trim() ? '#fff' : '#4b5563',
                  fontSize: 14, fontWeight: 700, cursor: currentInput.trim() ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s',
                }}
              >
                {currentQ === 1 ? 'Finish →' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SUMMARY ── */}
      {step === 'summary' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 20px', overflowY: 'auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Voice check-in complete</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>Here's your summary</div>
          </div>

          <div style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 14, padding: '16px 14px', marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', marginBottom: 10, letterSpacing: '0.06em' }}>TRANSCRIPT SUMMARY</div>
            {QUESTIONS.map((q, i) => (
              <div key={i} style={{ marginBottom: i === 0 ? 14 : 0 }}>
                <div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600, marginBottom: 4 }}>Q{i + 1}: {q.slice(0, 55)}…</div>
                <div style={{ fontSize: 13, color: '#c4b5fd', lineHeight: 1.4 }}>"{answers[i] || '(no response)'}"</div>
              </div>
            ))}
          </div>

          <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, padding: '12px 14px', marginBottom: 24, fontSize: 12, color: '#6ee7b7', lineHeight: 1.5 }}>
            📋 Saved to your care record · your doctor will review this
          </div>

          <div style={{ textAlign: 'center', fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            Now let's take a <strong style={{ color: '#e2e8f0' }}>hairline photo</strong> for your doctor
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(43,191,191,0.1)', border: '1.5px solid rgba(43,191,191,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 6, marginLeft: 'auto', marginRight: 'auto' }}>💆</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Hairline</div>
            </div>
          </div>

          <button
            onClick={startHairlineCamera}
            style={{
              width: '100%', padding: '15px', border: 'none', borderRadius: 14,
              background: 'linear-gradient(135deg, #2bbfbf, #0e9f9f)',
              color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(43,191,191,0.3)',
            }}
          >
            📸 Take Hairline Photo →
          </button>
        </div>
      )}

      {/* ── PHOTO: HAIRLINE ── */}
      {step === 'photo_hairline' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>

          {error && (
            <div style={{ position: 'absolute', top: 12, left: 16, right: 16, zIndex: 20, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.92)', color: '#fff', fontSize: 12, textAlign: 'center' }}>
              ⚠️ {error}
            </div>
          )}

          {photoConfirm ? (
            /* ── Confirm captured photo ── */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <img src={photoConfirm} alt="Hairline" style={{ flex: 1, objectFit: 'cover', width: '100%' }} />

              {/* Google Vision feedback badge */}
              {!error && (
                <div style={{ position: 'absolute', top: 12, left: 16, right: 16, zIndex: 20, padding: '8px 12px', borderRadius: 10, background: validationDone ? 'rgba(16,185,129,0.9)' : 'rgba(43,191,191,0.9)', color: '#fff', fontSize: 12, textAlign: 'center', fontWeight: 600 }}>
                  {validationDone ? '✓ Photo ready — tap Use Photo' : '✓ Photo captured — validating quality…'}
                </div>
              )}

              <div style={{ padding: '14px 16px', background: '#0a0a12', display: 'flex', gap: 10 }}>
                <button onClick={handleRetake} style={{ flex: 1, padding: '13px', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'transparent', color: '#94a3b8', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Retake
                </button>
                <button onClick={handleConfirmPhoto} style={{ flex: 2, padding: '13px', border: 'none', borderRadius: 12, background: '#2bbfbf', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  Use Photo ✓
                </button>
              </div>
            </div>
          ) : (
            /* ── Live camera + autocapture ── */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, position: 'relative', background: '#000', overflow: 'hidden' }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                />

                {/* Quality check indicators — always visible while camera is live */}
                {!photoConfirm && (
                  <div style={{ position: 'absolute', top: 12, left: 0, right: 0, zIndex: 10, display: 'flex', gap: 6, justifyContent: 'center', pointerEvents: 'none' }}>
                    {([
                      { key: 'lighting' as const, label: '🔆 Light' },
                      { key: 'sharpness' as const, label: '📷 Focus' },
                      { key: 'frame' as const,    label: '🎯 Frame' },
                    ]).map(({ key, label }) => {
                      const val = qualityChecks[key];
                      const checking = val === null;
                      const ok = val === 'ok';
                      return (
                        <div key={key} style={{
                          padding: '4px 10px', borderRadius: 99, fontSize: 10, fontWeight: 700,
                          background: checking
                            ? 'rgba(255,255,255,0.18)'
                            : ok ? 'rgba(16,185,129,0.88)' : 'rgba(239,68,68,0.82)',
                          color: '#fff', backdropFilter: 'blur(6px)',
                          boxShadow: ok ? '0 0 8px rgba(16,185,129,0.4)' : 'none',
                          transition: 'background 0.3s',
                        }}>
                          {label} {checking ? '…' : ok ? '✓' : '✗'}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Guide overlay — rectangular frame for hairline */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <div style={{
                    width: '80%', height: '55%',
                    border: `2px solid ${countdown !== null ? 'rgba(43,191,191,0.9)' : 'rgba(43,191,191,0.5)'}`,
                    borderRadius: 16,
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
                    transition: 'border-color 0.3s',
                  }} />
                </div>

                {/* Autocapture countdown ring */}
                {countdown !== null && (
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 10,
                  }}>
                    <div style={{
                      width: 80, height: 80, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.55)',
                      border: '3px solid #2bbfbf',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 34, fontWeight: 800, color: '#2bbfbf',
                      boxShadow: '0 0 24px rgba(43,191,191,0.5)',
                    }}>
                      {countdown}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12, color: '#2bbfbf', fontWeight: 600, background: 'rgba(0,0,0,0.5)', padding: '4px 12px', borderRadius: 99 }}>
                      Auto-capturing…
                    </div>
                  </div>
                )}

                {/* Hint pill */}
                <div style={{
                  position: 'absolute', bottom: 16, left: 16, right: 16,
                  background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
                  borderRadius: 10, padding: '8px 12px', textAlign: 'center',
                  fontSize: 12, color: '#cbd5e1',
                }}>
                  {countdown !== null
                    ? '✓ All checks passed — auto-capturing…'
                    : qualityChecks.lighting === null
                    ? 'Checking quality — hold still…'
                    : (qualityChecks.lighting === 'ok' && qualityChecks.sharpness === 'ok')
                    ? `✓ Good — hold steady (${qualityPassRef.current}/3 passed)`
                    : [
                        qualityChecks.lighting === 'dim'    && '💡 Move to better lighting',
                        qualityChecks.lighting === 'bright' && '💡 Avoid direct light on lens',
                        qualityChecks.sharpness === 'fail'  && '📷 Hold still for focus',
                        qualityChecks.frame === 'fail'      && '🎯 Position hairline in the frame',
                      ].filter(Boolean).join(' · ')
                  }
                </div>
              </div>

              {/* Manual capture + cancel countdown */}
              <div style={{ padding: '16px', background: '#0a0a12', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <button
                  onClick={cancelCountdown}
                  style={{
                    flex: 1, padding: '12px', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: 12,
                    background: 'transparent', color: '#64748b', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  {countdown !== null ? '⏸ Pause' : '⟳ Retry'}
                </button>

                {/* Shutter button */}
                <button
                  onClick={() => { cancelCountdown(); doCapture(); }}
                  style={{
                    width: 68, height: 68, borderRadius: '50%', border: '4px solid #2bbfbf',
                    background: '#fff', cursor: 'pointer', flexShrink: 0,
                    boxShadow: '0 0 0 2px rgba(43,191,191,0.4)',
                  }}
                />

                <button
                  onClick={resetCountdown}
                  style={{
                    flex: 1, padding: '12px', border: '1.5px solid rgba(43,191,191,0.3)', borderRadius: 12,
                    background: 'rgba(43,191,191,0.08)', color: '#2bbfbf', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {countdown !== null ? `${countdown}s` : '▶ Auto'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SUBMITTING ── */}
      {step === 'submitting' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <div style={{ width: 48, height: 48, border: '4px solid rgba(43,191,191,0.2)', borderTopColor: '#2bbfbf', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 20 }} />
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Analyzing your check-in…</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>Aisha is reviewing your responses & photo</div>
        </div>
      )}

      {/* ── DONE ── */}
      {step === 'done' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Check-in complete!</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24, textAlign: 'center' }}>Your doctor has been notified and will review your progress.</div>

          {result && (
            <div style={{ width: '100%', maxWidth: 360, background: 'rgba(43,191,191,0.08)', border: '1px solid rgba(43,191,191,0.2)', borderRadius: 14, padding: '16px 14px', marginBottom: 28 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal, #2bbfbf)', marginBottom: 8, letterSpacing: '0.06em' }}>AISHA'S ASSESSMENT</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>{result.headline}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>{result.summary}</div>
            </div>
          )}

          {hairlinePhoto && (
            <div style={{ marginBottom: 28, textAlign: 'center' }}>
              <img src={hairlinePhoto} alt="Hairline" style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 12, border: '1.5px solid rgba(43,191,191,0.3)' }} />
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>Hairline Photo</div>
            </div>
          )}

          <button
            onClick={() => navigate('/')}
            style={{
              width: '100%', maxWidth: 320, padding: '15px', border: 'none', borderRadius: 14,
              background: 'linear-gradient(135deg, #2bbfbf, #0e9f9f)', color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Back to Home
          </button>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes spin  { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
