import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { getCheckins, getPatientProfile, signOut } from '../lib/api';
import type { CheckinRow } from '../lib/database.types';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    green:    { label: 'On Track',    bg: 'rgba(16,185,129,0.12)',  color: '#10b981' },
    good:     { label: 'On Track',    bg: 'rgba(16,185,129,0.12)',  color: '#10b981' },
    yellow:   { label: 'Watch',       bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b' },
    warning:  { label: 'Watch',       bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b' },
    red:      { label: 'Needs Attn',  bg: 'rgba(239,68,68,0.12)',   color: '#ef4444' },
    critical: { label: 'Needs Attn',  bg: 'rgba(239,68,68,0.12)',   color: '#ef4444' },
  };
  const s = map[status] ?? map.green;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 100, background: s.bg, color: s.color, fontSize: 12, fontWeight: 600 }}>
      <span className={`status-dot ${ ['red','critical'].includes(status) ? 'red' : ['yellow','warning'].includes(status) ? 'yellow' : 'green' }`} />
      {s.label}
    </span>
  );
}

function ProgressRing({ percent, color }: { percent: number; color: string }) {
  const r = 28, circ = 2 * Math.PI * r;
  return (
    <svg width="72" height="72" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
      <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - percent / 100)}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
    </svg>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { session, patient, setPatient, checkins, setCheckins, showToast, logout } = useStore();

  async function handleLogout() {
    logout(); // clear store first so /login doesn't redirect back
    try { await signOut(); } catch { /* ignore */ }
    navigate('/login', { replace: true });
  }
  const [loading, setLoading] = useState(!patient);
  // Track which email we last loaded for — prevents double-fetching when
  // App.tsx fires setSession twice (getSession + onAuthStateChange).
  const loadedForRef = useRef<string | null>(patient ? session?.user?.email ?? null : null);

  useEffect(() => {
    const email = session?.user?.email;
    if (!email) { setLoading(false); return; }
    // Already loaded for this email — no refetch needed
    if (email === loadedForRef.current && patient) return;

    async function load() {
      setLoading(true);
      // 10 s hard ceiling — a hung Supabase RPC must never freeze the screen
      const timeout = setTimeout(() => setLoading(false), 10_000);
      try {
        const p = patient ?? await getPatientProfile(email!);
        if (p) {
          setPatient(p);
          // Use p.id (freshly resolved) — patient?.id is empty on first load
          const c = await getCheckins(p.id).catch(() => [] as CheckinRow[]);
          setCheckins(c);
        }
      } catch {
        showToast('Could not load patient data', 'error');
      } finally {
        clearTimeout(timeout);
        loadedForRef.current = email!;
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const latest = checkins[0];
  const todayCheckedIn = latest?.day_number === patient?.current_day;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          <div style={{ color: '#64748b', fontSize: 13 }}>Loading your care plan…</div>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🩺</div>
        <h2 style={{ margin: '0 0 8px', fontWeight: 700 }}>Not enrolled yet</h2>
        <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>Your account is set up but hasn't been linked to a treatment plan yet. Contact your care team to get started.</p>
      </div>
    );
  }

  const treatmentDays = Math.max(1, Math.floor((Date.now() - new Date(patient.treatment_start_date).getTime()) / 86400000) + 1);
  const totalDays = patient.condition === 'acne' ? 90 : 28;
  const progressPct = Math.min(100, Math.round((treatmentDays / totalDays) * 100));

  return (
    <div className="page fade-in">
      {/* Header */}
      <div style={{ padding: '20px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: 13 }}>{greeting},</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.3px', marginTop: 2 }}>{patient.name.split(' ')[0]}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBadge status={patient.status} />
            <button
              onClick={handleLogout}
              title="Switch patient"
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, width: 44, height: 44, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, touchAction: 'manipulation',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
        </div>
      </div>

      {/* Treatment progress card */}
      <div style={{ margin: '16px 16px 0' }}>
        <div className="card" style={{ padding: '18px 20px', background: 'linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(18,18,30,1) 60%)', border: '1px solid rgba(124,58,237,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <ProgressRing percent={progressPct} color="#7c3aed" />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>D{patient.current_day}</div>
                <div style={{ fontSize: 9, color: '#64748b' }}>DAY</div>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{patient.treatment_name}</div>
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>Day {patient.current_day} of {totalDays} · {progressPct}% complete</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <Stat label="Adherence" value={`${Math.round(patient.adherence_percent)}%`} color="#10b981" />
                <Stat label="Check-ins" value={String(checkins.length)} color="#a78bfa" />
                <Stat label="Status" value={patient.status.charAt(0).toUpperCase() + patient.status.slice(1)} color={patient.status === 'green' ? '#10b981' : patient.status === 'yellow' ? '#f59e0b' : '#ef4444'} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Today's check-in CTA — always shown */}
      <div style={{ margin: '12px 16px 0' }}>
        <button
          onClick={() => navigate('/checkin-flow')}
          style={{
            width: '100%', padding: '18px 20px', border: 'none', borderRadius: 16, cursor: 'pointer',
            background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
            boxShadow: '0 8px 24px rgba(124,58,237,0.35)',
            display: 'flex', alignItems: 'center', gap: 14,
          }}
        >
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" fill="white" width="22" height="22">
              <path d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z"/>
              <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9z"/>
            </svg>
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 15 }}>
              {todayCheckedIn ? 'Check-in Again' : "Start Today's Check-in"}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 }}>
              Day {patient.current_day} · Takes ~60 seconds
              {todayCheckedIn && ' · Already checked in today'}
            </div>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={2} width="20" height="20">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Voice nurse button */}
      <div style={{ margin: '10px 16px 0' }}>
        <button
          onClick={() => navigate('/voice')}
          className="card"
          style={{ width: '100%', padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, cursor: 'pointer', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, rgba(167,139,250,0.2), rgba(124,58,237,0.2))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" fill="#a78bfa" width="20" height="20">
              <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
            </svg>
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Call AI Nurse Aisha</div>
            <div style={{ color: '#64748b', fontSize: 12, marginTop: 1 }}>Daily check-in voice call</div>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth={2} width="18" height="18">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Latest photo + heatmap */}
      {latest?.photo_url && (
        <div style={{ margin: '16px 16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>LATEST CHECK-IN</div>
            <button onClick={() => navigate('/history')} style={{ fontSize: 12, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>View all →</button>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <img src={latest.photo_url} alt="Latest check-in" style={{ width: '100%', display: 'block', objectFit: 'cover' }} />
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{latest.ai_headline ?? 'Analysis complete'}</div>
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{latest.ai_summary?.slice(0, 120)}{(latest.ai_summary?.length ?? 0) > 120 ? '…' : ''}</div>
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#4b5563' }}>Day {latest.day_number} · {new Date(latest.checkin_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                <StatusBadge status={latest.status as 'green' | 'yellow' | 'red'} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prescriptions */}
      {patient.prescribed_products && (
        <div style={{ margin: '16px 16px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 10 }}>YOUR TREATMENT</div>
          <div className="card" style={{ padding: '14px 16px' }}>
            {JSON.parse(patient.prescribed_products).map((p: string, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < JSON.parse(patient.prescribed_products!).length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#7c3aed', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#94a3b8' }}>{p}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ height: 24 }} />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 9, color: '#64748b', fontWeight: 500, marginTop: 1 }}>{label.toUpperCase()}</div>
    </div>
  );
}
