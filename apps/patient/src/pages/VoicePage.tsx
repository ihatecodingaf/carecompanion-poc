/**
 * VoicePage — Real Deepgram Voice Agent integration.
 * Aisha conducts a daily check-in via voice, then hands off to the camera step.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { ORG_SLUG } from '../lib/supabase';
import { startCallSession, saveVoiceCall, createCheckinDraft } from '../lib/api';

type CallState = 'idle' | 'requesting_mic' | 'connecting' | 'connected' | 'ending' | 'done';

interface TranscriptLine {
  role: 'user' | 'assistant';
  content: string;
}

const CONDITION_LABELS: Record<string, string> = {
  acne: 'acne',
  laser_recovery: 'post-laser skin recovery',
  androgenic_alopecia: 'androgenic alopecia (pattern hair loss)',
  alopecia_areata: 'alopecia areata',
  telogen_effluvium: 'telogen effluvium (hair shedding)',
};

function buildSystemPrompt(name: string, condition: string, dayNumber: number): string {
  const label = CONDITION_LABELS[condition] ?? condition;
  return `You are Aisha, a compassionate AI nurse for Care.ai conducting a daily check-in. The patient is ${name}, being monitored for ${label} (Day ${dayNumber} of treatment).

Ask these questions conversationally, one at a time, waiting for each answer:
1. How are you feeling today overall?
2. Have you applied or taken your prescribed medications today?
3. Are you experiencing any discomfort, pain, or side effects?
4. Have you noticed any changes in your ${label} since your last check-in?
5. Is there anything specific you would like your doctor to know?

Keep responses warm and brief. After all questions are answered, say: 'Thank you, I have everything I need. Please complete your photo check-in now and your doctor will review your progress shortly.' Then stop speaking.`;
}

function formatTime(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function VoicePage() {
  const navigate = useNavigate();
  const { patient, setCurrentCheckinId } = useStore();

  const [callState, setCallState] = useState<CallState>('idle');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const nextPlayTimeRef = useRef(0);
  const transcriptLinesRef = useRef<TranscriptLine[]>([]);
  const callStateRef = useRef<CallState>('idle');
  const finishedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);

  // Keep refs in sync
  useEffect(() => { transcriptLinesRef.current = transcript; }, [transcript]);

  function updateCallState(s: CallState) {
    callStateRef.current = s;
    setCallState(s);
  }

  const stopAll = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.close();
    if (audioCtxRef.current?.state !== 'closed') audioCtxRef.current?.close();
    wsRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
    processorRef.current = null;
    sourceRef.current = null;
    nextPlayTimeRef.current = 0;
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  function playLinear16Chunk(audioCtx: AudioContext, data: ArrayBuffer) {
    if (audioCtx.state === 'closed') return;
    const int16 = new Int16Array(data);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
    const buffer = audioCtx.createBuffer(1, float32.length, 16000);
    buffer.getChannelData(0).set(float32);
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(audioCtx.destination);
    const startAt = Math.max(audioCtx.currentTime, nextPlayTimeRef.current);
    src.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;
  }

  const finishCall = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    updateCallState('ending');
    stopAll();

    const lines = transcriptLinesRef.current;
    const transcriptText = lines
      .map(l => `${l.role === 'assistant' ? 'Aisha' : 'Patient'}: ${l.content}`)
      .join('\n');

    if (!patient) return;
    try {
      let checkinId: string;
      if (sessionIdRef.current) {
        checkinId = await saveVoiceCall(ORG_SLUG, sessionIdRef.current, transcriptText, lines);
      } else {
        // Session never started (DB unavailable) — fall back to plain transcript draft
        checkinId = await createCheckinDraft(patient.id, ORG_SLUG, patient.current_day, transcriptText);
      }
      setCurrentCheckinId(checkinId);
      updateCallState('done');
      navigate('/checkin', { state: { fromVoice: true } });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save call. Please try again.');
      finishedRef.current = false;
      updateCallState('idle');
    }
  }, [patient, navigate, setCurrentCheckinId, stopAll]);

  async function startCall() {
    if (!patient) return;
    setErrorMsg(null);
    finishedRef.current = false;
    setTranscript([]);
    setElapsed(0);
    updateCallState('requesting_mic');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setErrorMsg('Microphone access denied. Please allow microphone access and try again.');
      updateCallState('idle');
      return;
    }
    streamRef.current = stream;
    updateCallState('connecting');

    const audioCtx = new AudioContext({ sampleRate: 16000 });
    audioCtxRef.current = audioCtx;
    nextPlayTimeRef.current = audioCtx.currentTime;

    const apiKey = (import.meta.env.VITE_DEEPGRAM_KEY as string | undefined) ?? '';
    const ws = new WebSocket('wss://agent.deepgram.com/agent', ['token', apiKey]);
    wsRef.current = ws;
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'SettingsConfiguration',
        audio: {
          input:  { encoding: 'linear16', sample_rate: 16000 },
          output: { encoding: 'linear16', sample_rate: 16000, container: 'none' },
        },
        agent: {
          listen: { model: 'nova-2' },
          think: {
            provider: {
              type: 'open_ai',
              url: 'https://api.groq.com/openai/v1',
              key: (import.meta.env.VITE_GROQ_API_KEY as string) ?? '',
            },
            model: 'llama-3.3-70b-versatile',
            instructions: buildSystemPrompt(
              patient!.name.split(' ')[0],
              patient!.condition,
              patient!.current_day,
            ),
          },
          speak: { model: 'aura-asteria-en' },
        },
      }));

      // Wire microphone → ScriptProcessor → WebSocket
      const src = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = src;
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const float32 = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));
        }
        ws.send(int16.buffer);
      };
      src.connect(processor);
      processor.connect(audioCtx.destination);

      updateCallState('connected');
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);

      // Record session start in DB (non-fatal if it fails)
      startCallSession(ORG_SLUG, patient!.id)
        .then(sid => { sessionIdRef.current = sid; })
        .catch(() => { /* session tracking unavailable, voice call continues */ });
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        playLinear16Chunk(audioCtx, event.data);
        return;
      }
      try {
        const msg = JSON.parse(event.data as string) as { type: string; role?: string; content?: string };
        if (msg.type === 'ConversationText' && msg.role && msg.content) {
          const line: TranscriptLine = {
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          };
          setTranscript(prev => [...prev, line]);
          setTimeout(() => transcriptScrollRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 50);

          if (
            msg.role === 'assistant' &&
            (msg.content.includes('complete your photo check-in') ||
             msg.content.includes('everything I need'))
          ) {
            // Let the final audio finish playing before transitioning
            setTimeout(() => finishCall(), 4000);
          }
        }
      } catch { /* non-JSON binary or malformed — ignore */ }
    };

    ws.onerror = () => {
      if (callStateRef.current !== 'ending' && callStateRef.current !== 'done') {
        setErrorMsg('Connection error. Please check your internet connection and try again.');
        stopAll();
        updateCallState('idle');
      }
    };

    ws.onclose = () => {
      if (
        callStateRef.current === 'connected' &&
        !finishedRef.current
      ) {
        setErrorMsg('Call disconnected unexpectedly. Please try again.');
        stopAll();
        updateCallState('idle');
      }
    };
  }

  // Visible transcript: last 4 lines
  const visibleLines = transcript.slice(-4);

  return (
    <div className="page fade-in" style={{ display: 'flex', flexDirection: 'column', background: '#0a0a12' }}>
      {/* Header */}
      <div style={{ padding: '20px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0, fontSize: 13, fontWeight: 500 }}
          >
            ← Back
          </button>
        </div>
        <h1 style={{ margin: '10px 0 2px', fontSize: 20, fontWeight: 800 }}>AI Nurse Aisha</h1>
        <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>Daily voice check-in</p>
      </div>

      {/* Main orb / avatar area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px 0' }}>
        {/* Pulsing orb */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <div style={{
            width: 100, height: 100, borderRadius: '50%',
            background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 44,
            animation: callState === 'connected'
              ? 'voice-orb-pulse 2s ease-in-out infinite'
              : callState === 'requesting_mic' || callState === 'connecting'
              ? 'voice-orb-spin 1.2s linear infinite'
              : 'none',
            boxShadow: callState === 'connected'
              ? '0 0 0 0 rgba(124,58,237,0.4)'
              : '0 0 24px rgba(124,58,237,0.25)',
          }}>
            🩺
          </div>
          {callState === 'connected' && (
            <div style={{
              position: 'absolute', bottom: 4, right: 4,
              width: 18, height: 18, borderRadius: '50%',
              background: '#10b981', border: '2.5px solid #0a0a12',
            }} />
          )}
        </div>

        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Aisha</div>
        <div style={{ fontSize: 13, color: '#7c3aed', fontWeight: 500, marginBottom: 12 }}>AI Care Nurse</div>

        {/* Status line */}
        {callState === 'idle' && (
          <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', lineHeight: 1.5, maxWidth: 280 }}>
            Aisha will ask you a few questions about how you're feeling today. Your answers are sent to your doctor.
          </div>
        )}
        {callState === 'requesting_mic' && (
          <div style={{ color: '#f59e0b', fontSize: 13, fontWeight: 500 }}>Requesting microphone…</div>
        )}
        {callState === 'connecting' && (
          <div style={{ color: '#a78bfa', fontSize: 13, fontWeight: 500 }}>Connecting to Aisha…</div>
        )}
        {callState === 'connected' && (
          <div style={{ color: '#10b981', fontSize: 14, fontWeight: 600 }}>
            {formatTime(elapsed)} — Connected
          </div>
        )}
        {callState === 'ending' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a78bfa', fontSize: 13 }}>
            <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, display: 'inline-block' }} />
            Saving your check-in…
          </div>
        )}

        {errorMsg && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 13, textAlign: 'center', maxWidth: 300 }}>
            {errorMsg}
          </div>
        )}
      </div>

      {/* Live transcript (last 4 lines) */}
      {(callState === 'connected' || callState === 'ending') && visibleLines.length > 0 && (
        <div style={{ margin: '16px 16px 0', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#4b5563', marginBottom: 6, letterSpacing: 1 }}>LIVE TRANSCRIPT</div>
          <div
            ref={transcriptScrollRef}
            style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            {visibleLines.map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', animation: 'fadeIn 0.25s ease' }}>
                <div style={{
                  flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
                  background: line.role === 'assistant' ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                }}>
                  {line.role === 'assistant' ? '🩺' : '👤'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: '#4b5563', fontWeight: 700, marginBottom: 1 }}>
                    {line.role === 'assistant' ? 'AISHA' : (patient?.name?.split(' ')[0]?.toUpperCase() ?? 'YOU')}
                  </div>
                  <div style={{ fontSize: 12, color: line.role === 'assistant' ? '#94a3b8' : '#64748b', lineHeight: 1.4 }}>
                    {line.content}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ padding: '16px 16px 8px', flexShrink: 0 }}>
        {callState === 'idle' && (
          <button onClick={startCall} className="btn-primary">
            <svg viewBox="0 0 24 24" fill="white" width="18" height="18">
              <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
            </svg>
            Start Voice Check-in
          </button>
        )}
        {(callState === 'requesting_mic' || callState === 'connecting') && (
          <button disabled style={{ width: '100%', padding: '14px', border: 'none', borderRadius: 12, background: 'rgba(124,58,237,0.3)', color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: 600, cursor: 'not-allowed' }}>
            Connecting…
          </button>
        )}
        {callState === 'connected' && (
          <button
            onClick={() => finishCall()}
            style={{
              width: '100%', padding: '14px', border: 'none', borderRadius: 99,
              background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
              color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 4px 16px rgba(239,68,68,0.35)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="white" width="18" height="18" style={{ transform: 'rotate(135deg)' }}>
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
            End Call
          </button>
        )}
        {callState === 'ending' && (
          <button disabled style={{ width: '100%', padding: '14px', border: 'none', borderRadius: 12, background: 'rgba(124,58,237,0.3)', color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: 600, cursor: 'not-allowed' }}>
            Processing…
          </button>
        )}
      </div>

      {/* Info card (idle only) */}
      {callState === 'idle' && (
        <div style={{ margin: '0 16px 16px', padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.6 }}>
            🎙️ Aisha will guide you through 5 quick questions. After the call, you'll take a photo so your doctor can see your progress today.
          </div>
        </div>
      )}

      <div style={{ height: 16 }} />

      {/* CSS animations injected inline */}
      <style>{`
        @keyframes voice-orb-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(124,58,237,0.5), 0 0 24px rgba(124,58,237,0.2); }
          50%      { box-shadow: 0 0 0 18px rgba(124,58,237,0), 0 0 40px rgba(124,58,237,0.35); }
        }
        @keyframes voice-orb-spin {
          0%   { box-shadow: 0 0 0 0 rgba(167,139,250,0.5); }
          100% { box-shadow: 0 0 0 14px rgba(167,139,250,0); }
        }
      `}</style>
    </div>
  );
}
