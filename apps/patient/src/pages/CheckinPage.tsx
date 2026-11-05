import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { submitCheckin, validatePhoto, updateCheckinPhoto } from '../lib/api';
import { ORG_SLUG, APP_MODE } from '../lib/supabase';
import Camera, { type CaptureResult } from '../components/Camera';
import type { AIAnalysis } from '../lib/database.types';
import { getConditionConfig } from '../lib/conditionConfig';

type Step = 'camera' | 'review' | 'symptoms' | 'analyzing' | 'result';

const FACE_SYMPTOM_OPTIONS = [
  'Redness / erythema', 'Swelling / edema', 'Burning sensation', 'Itching',
  'Dryness / flaking', 'Breakout / new pimples', 'Blistering', 'Crusting',
];

const HAIR_SYMPTOM_OPTIONS = [
  'Increased shedding', 'New bald patch', 'Scalp itching', 'Scalp tenderness',
  'Scalp flaking / dandruff', 'Thinning at crown', 'Thinning at temples', 'Reduced volume',
];

// ─── Ghost shot helpers ───────────────────────────────────────────────────────

interface GhostShots {
  crown?: string;
  scalp?: string;
  hairline?: string;
  capturedOnDay?: number;
}

function loadGhostShots(patientId: string): GhostShots {
  try {
    const raw = localStorage.getItem(`hair_ghosts_${patientId}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function saveGhostShots(
  patientId: string,
  shots: { shotType: string; dataUrl: string }[],
  dayNumber: number,
) {
  const out: GhostShots = { capturedOnDay: dayNumber };
  for (const shot of shots) {
    // Downsample to 400×300 before storing — ghost doesn't need full resolution
    const img = new Image();
    await new Promise<void>(r => { img.onload = () => r(); img.src = shot.dataUrl; });
    const c = document.createElement('canvas');
    c.width = 400; c.height = 300;
    c.getContext('2d')!.drawImage(img, 0, 0, 400, 300);
    const compressed = c.toDataURL('image/jpeg', 0.45);
    if (shot.shotType === 'crown') out.crown = compressed;
    if (shot.shotType === 'scalp') out.scalp = compressed;
    if (shot.shotType === 'hairline') out.hairline = compressed;
  }
  try { localStorage.setItem(`hair_ghosts_${patientId}`, JSON.stringify(out)); } catch { /* quota */ }
}

function resizeForValidation(dataUrl: string, maxPx = 640): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.80).split(',')[1]);
    };
    img.onerror = () => resolve(dataUrl.split(',')[1]);
    img.src = dataUrl;
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CheckinPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isFromVoice = !!(location.state as { fromVoice?: boolean } | null)?.fromVoice;

  const { patient, addCheckin, showToast, setLatestAnalysis, currentCheckinId, setCurrentCheckinId } = useStore();

  const conditionConfig = getConditionConfig(patient?.condition);
  const isHairMode = conditionConfig.captureMode === 'hair';

  const [step, setStep] = useState<Step>('camera');
  const [capture, setCapture] = useState<CaptureResult | null>(null);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [adherence, setAdherence] = useState<boolean | null>(null);
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<AIAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [faceValidation, setFaceValidation] = useState<{ valid: boolean; message: string } | null>(null);
  const [isFaceValidating, setIsFaceValidating] = useState(false);

  // Ghost shots from previous session — loaded once on mount
  const [ghostShots, setGhostShots] = useState<GhostShots>({});
  React.useEffect(() => {
    if (isHairMode && patient) setGhostShots(loadGhostShots(patient.id));
  }, [isHairMode, patient]);

  function handleCapture(data: CaptureResult) {
    setCapture(data);
    setFaceValidation(null);
    setStep('review');
    if (!isHairMode) {
      setIsFaceValidating(true);
      resizeForValidation(data.dataUrl).then(b64 =>
        validatePhoto(b64, 'image/jpeg', 'face', APP_MODE, patient?.condition)
      ).then(r => setFaceValidation({ valid: r.valid, message: r.message }))
       .catch(() => setFaceValidation({ valid: true, message: '' }))
       .finally(() => setIsFaceValidating(false));
    }
  }

  function handleRetake() {
    setCapture(null);
    setFaceValidation(null);
    setIsFaceValidating(false);
    setStep('camera');
  }

  async function handleContinueFromReview() {
    if (!capture || !patient) return;
    if (isFromVoice) {
      await handleAnalyze();
    } else {
      setStep('symptoms');
    }
  }

  // Passed to Camera so it can GCV-validate each shot during per-shot review
  async function handleValidateShot(
    dataUrl: string,
    mimeType: string,
    shotType: 'crown' | 'scalp' | 'hairline',
  ) {
    const imageBase64 = await resizeForValidation(dataUrl);
    return validatePhoto(imageBase64, mimeType, shotType, APP_MODE, patient?.condition);
  }

  async function handleAnalyze() {
    if (!capture || !patient) return;
    setStep('analyzing');
    setError(null);
    try {
      const imageBase64 = capture.dataUrl.split(',')[1];

      // Voice flow: update the draft row with the photo URL before full analysis
      if (isFromVoice && currentCheckinId) {
        const photoDataUrl = capture.dataUrl;
        await updateCheckinPhoto(currentCheckinId, ORG_SLUG, photoDataUrl);
      }

      const res = await submitCheckin({
        patientId: patient.id,
        orgSlug: ORG_SLUG,
        dayNumber: patient.current_day,
        imageBase64,
        imageMimeType: capture.mimeType,
        symptomsText: isFromVoice
          ? 'See voice transcript'
          : (symptoms.length ? symptoms.join(', ') : 'None reported'),
        adherenceToday: adherence ?? true,
        qualityScore: capture.quality.overall,
        appMode: APP_MODE,
        checkinType: isHairMode ? 'hair' : 'face',
        ...(isFromVoice && currentCheckinId ? { checkinId: currentCheckinId } : {}),
      });
      setResult(res.analysis);
      setLatestAnalysis(res.analysis);

      if (isFromVoice) setCurrentCheckinId(null);

      // Save compressed ghost shots for the next session's alignment overlay
      if (isHairMode && capture.hairShots && capture.hairShots.length > 0) {
        saveGhostShots(patient.id, capture.hairShots, patient.current_day);
      }

      // Add to local checkin list
      addCheckin({
        id: res.checkInId,
        patient_id: patient.id,
        day_number: patient.current_day,
        checkin_date: new Date().toISOString(),
        status: res.analysis.alert_level === 3 ? 'red' : res.analysis.alert_level === 2 ? 'yellow' : 'green',
        symptoms_reported: isFromVoice ? 'See voice transcript' : (symptoms.join(', ') || null),
        adherence_today: adherence ?? true,
        photo_url: res.storedPhotoUrl ?? capture.dataUrl,
        photo_label: `Day ${patient.current_day} Check-in`,
        ai_headline: res.analysis.headline,
        ai_summary: res.analysis.summary,
        ai_zone_analysis: JSON.stringify(res.analysis.zone_analysis),
        ai_suggested_actions: res.analysis.recommendation,
        doctor_response: null,
        notes: notes || null,
        quality_score: capture.quality.overall,
        transcript: null,
        checkin_status: 'pending_review',
      });
      setStep('result');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Analysis failed';
      setError(msg);
      showToast(msg, 'error');
      setStep('review');
    }
  }

  if (!patient) return null;

  /* ── Camera ── */
  if (step === 'camera') {
    return (
      <div className="page-no-nav" style={{ background: '#000' }}>
        <Camera
          mode={isHairMode ? 'hair' : 'face'}
          onCapture={handleCapture}
          onCancel={() => navigate('/')}
          ghostShots={isHairMode ? ghostShots : undefined}
          onValidateShot={isHairMode ? handleValidateShot : undefined}
          shotTypes={conditionConfig.shotTypes}
          patientCondition={patient?.condition}
        />
      </div>
    );
  }

  /* ── Review ── */
  if (step === 'review' && capture) {
    const hairShots = capture.hairShots;
    return (
      <div className="page-no-nav fade-in" style={{ display: 'flex', flexDirection: 'column' }}>
        <Header title={isHairMode ? 'Review Hair Photos' : 'Review Photo'} onBack={handleRetake} />
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>

          {/* Hair mode: dynamic shot thumbnail strip */}
          {isHairMode && hairShots && hairShots.length > 0 ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(hairShots.length, 3)}, 1fr)`, gap: 10, marginBottom: 12 }}>
                {hairShots.map(shot => (
                  <div key={shot.shotType} style={{ position: 'relative' }}>
                    <img src={shot.dataUrl} alt={shot.shotLabel} style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: 12, display: 'block' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 6px 4px', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))', borderRadius: '0 0 12px 12px', fontSize: 10, fontWeight: 600, color: '#e9d5ff', textAlign: 'center' }}>
                      {shot.shotLabel}
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 12 }}>
                {hairShots.length} shot{hairShots.length !== 1 ? 's' : ''} captured — {hairShots.map(s => s.shotLabel).join(' · ')}
              </p>
            </>
          ) : (
            <img src={capture.dataUrl} alt="Capture" style={{ width: '100%', borderRadius: 16, display: 'block', marginBottom: 12 }} />
          )}

          {/* Quality badges */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <QBadge label="Quality" value={`${capture.quality.overall}/100`} ok={capture.quality.overall >= 50} />
            <QBadge label="Sharpness" value={`${capture.quality.sharpness}`} ok={capture.quality.sharpness >= 5} />
            <QBadge label="Lighting" value={`${capture.quality.brightness}%`} ok={capture.quality.brightness > 20 && capture.quality.brightness < 90} />
            {isHairMode
              ? <QBadge label="Shots" value={`${hairShots?.length ?? 1}/${conditionConfig.shotTypes?.length ?? 2}`} ok={(hairShots?.length ?? 0) >= (conditionConfig.shotTypes?.length ?? 2)} />
              : <QBadge label="Face" value={capture.quality.faceDetected ? '✓' : '?'} ok={capture.quality.faceDetected} />
            }
          </div>
          {capture.quality.overall < 50 && (
            <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, marginBottom: 16, fontSize: 13, color: '#fbbf24' }}>
              {isHairMode
                ? '⚠ Some shots are low quality. For best AI results, ensure good lighting and hold the phone steady.'
                : '⚠ Photo quality is low. For best AI results, retake in good lighting with your face centered.'}
            </div>
          )}

          {/* Face mode GCV validation banner */}
          {!isHairMode && isFaceValidating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 10, marginBottom: 16, fontSize: 13, color: '#a78bfa' }}>
              <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, display: 'inline-block', flexShrink: 0 }} />
              Checking photo quality…
            </div>
          )}
          {!isHairMode && !isFaceValidating && faceValidation && faceValidation.valid && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 10, marginBottom: 16, fontSize: 13, color: '#10b981' }}>
              <span style={{ fontSize: 15 }}>✓</span>
              Photo validated — looks good
            </div>
          )}
          {!isHairMode && !isFaceValidating && faceValidation && !faceValidation.valid && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, marginBottom: 16, fontSize: 13, color: '#f87171' }}>
              <span style={{ fontWeight: 700 }}>❌ Photo quality check failed</span>
              <p style={{ margin: '4px 0 0', color: '#94a3b8', lineHeight: 1.5 }}>
                {faceValidation.message || 'Photo doesn\'t show a face clearly. Please retake.'}
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleRetake} style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Retake
            </button>
            <button onClick={handleContinueFromReview} className="btn-primary" style={{ flex: 2 }}>
              {isFromVoice ? 'Analyze now →' : 'Continue →'}
            </button>
          </div>
          {error && <div style={{ marginTop: 12, color: '#ef4444', fontSize: 13 }}>{error}</div>}
        </div>
      </div>
    );
  }

  /* ── Symptoms ── */
  if (step === 'symptoms') {
    return (
      <div className="page-no-nav fade-in" style={{ display: 'flex', flexDirection: 'column' }}>
        <Header title="How are you feeling?" onBack={() => setStep('review')} />
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
          <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
            {isHairMode
              ? 'Select any hair or scalp symptoms you\'re noticing. This helps Aisha give you a more accurate assessment.'
              : 'Select any symptoms you\'re experiencing today. This helps the AI give you a more accurate assessment.'}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {(isHairMode ? HAIR_SYMPTOM_OPTIONS : FACE_SYMPTOM_OPTIONS).map(s => (
              <button
                key={s}
                onClick={() => setSymptoms(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                style={{
                  padding: '8px 14px', borderRadius: 100, border: '1px solid',
                  borderColor: symptoms.includes(s) ? '#7c3aed' : 'rgba(255,255,255,0.1)',
                  background: symptoms.includes(s) ? 'rgba(124,58,237,0.15)' : 'transparent',
                  color: symptoms.includes(s) ? '#a78bfa' : '#94a3b8',
                  fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 10 }}>Did you apply your treatment today?</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {[true, false].map(v => (
                <button
                  key={String(v)}
                  onClick={() => setAdherence(v)}
                  style={{
                    flex: 1, padding: '11px', borderRadius: 12, border: '1px solid',
                    borderColor: adherence === v ? (v ? '#10b981' : '#ef4444') : 'rgba(255,255,255,0.1)',
                    background: adherence === v ? (v ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)') : 'transparent',
                    color: adherence === v ? (v ? '#10b981' : '#ef4444') : '#94a3b8',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {v ? '✓ Yes' : '✗ No'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>Additional notes (optional)</div>
            <textarea
              className="input"
              placeholder="Anything else your care team should know…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              style={{ resize: 'none' }}
            />
          </div>

          <button onClick={handleAnalyze} className="btn-primary" disabled={adherence === null}>
            <svg viewBox="0 0 24 24" fill="white" width="18" height="18"><path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
            Analyze with AI
          </button>
          {adherence === null && <p style={{ textAlign: 'center', color: '#4b5563', fontSize: 12, marginTop: 8 }}>Please select treatment adherence above</p>}
        </div>
      </div>
    );
  }

  /* ── Analyzing ── */
  if (step === 'analyzing') {
    return (
      <div className="page-no-nav" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32 }}>
        <div style={{ width: 80, height: 80, borderRadius: 24, background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(167,139,250,0.1))', border: '1px solid rgba(124,58,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{isHairMode ? 'Analyzing your scalp' : 'Analyzing your skin'}</div>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
            {isHairMode
              ? <>AI nurse Aisha is reviewing your scalp photo and<br/>checking hair density across 6 zones…</>
              : <>AI nurse Aisha is reviewing your photo and<br/>checking against your treatment protocol…</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
          {(isHairMode ? ['📸 Photo', '🔬 Zones', '💊 Protocol'] : ['📸 Photo', '🔬 Analysis', '💊 Protocol']).map((label, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c3aed', animation: `pulse-red ${0.6 + i * 0.2}s ease-in-out infinite` }} />
              <span style={{ fontSize: 11, color: '#64748b' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Result ── */
  if (step === 'result' && result && capture) {
    const alertColor = result.alert_level === 3 ? '#ef4444' : result.alert_level === 2 ? '#f59e0b' : '#10b981';
    const alertBg = result.alert_level === 3 ? 'rgba(239,68,68,0.1)' : result.alert_level === 2 ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)';
    const alertBorder = result.alert_level === 3 ? 'rgba(239,68,68,0.3)' : result.alert_level === 2 ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)';

    return (
      <div className="page-no-nav fade-in" style={{ display: 'flex', flexDirection: 'column' }}>
        <Header title="AI Analysis" onBack={() => navigate('/')} backLabel="Done" />
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
          {/* Status banner */}
          <div style={{ padding: '14px 16px', borderRadius: 14, background: alertBg, border: `1px solid ${alertBorder}`, marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: alertColor }}>{result.headline}</div>
            <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{result.summary}</div>
          </div>

          {/* Photo */}
          <div style={{ marginBottom: 14, borderRadius: 14, overflow: 'hidden' }}>
            <img src={capture.dataUrl} alt="Check-in photo" style={{ width: '100%', display: 'block', borderRadius: 14 }} />
          </div>

          {/* Recommendations */}
          <div className="card" style={{ padding: '14px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8, letterSpacing: 1 }}>RECOMMENDATION</div>
            <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>{result.recommendation}</div>
          </div>

          {/* Doctor note */}
          {result.doctor_note && (
            <div className="card" style={{ padding: '14px', marginBottom: 20, background: 'rgba(124,58,237,0.06)', borderColor: 'rgba(124,58,237,0.2)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed', marginBottom: 8, letterSpacing: 1 }}>NOTE FOR YOUR DOCTOR</div>
              <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>{result.doctor_note}</div>
            </div>
          )}

          <button onClick={() => navigate('/')} className="btn-primary">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function Header({ title, onBack, backLabel = '← Back' }: { title: string; onBack: () => void; backLabel?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer', padding: '4px 0', fontWeight: 500 }}>{backLabel}</button>
      <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 16 }}>{title}</div>
      <div style={{ width: 48 }} />
    </div>
  );
}

function QBadge({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, background: ok ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${ok ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
      <span style={{ fontSize: 10, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: ok ? '#10b981' : '#f59e0b' }}>{value}</span>
    </div>
  );
}

