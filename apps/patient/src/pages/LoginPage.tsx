import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, getPatientProfile } from '../lib/api';
import { useStore } from '../store/useStore';
import { supabase, ORG_SLUG } from '../lib/supabase';

interface PatientEntry {
  id: string;
  name: string;
  email: string;
  condition: string;
  current_day: number;
  status: string;
}

const STATUS_COLOR: Record<string, { dot: string; bg: string; border: string; text: string }> = {
  green:    { dot: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)',  text: '#10b981' },
  good:     { dot: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)',  text: '#10b981' },
  yellow:   { dot: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)',  text: '#f59e0b' },
  warning:  { dot: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)',  text: '#f59e0b' },
  red:      { dot: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)',   text: '#ef4444' },
  critical: { dot: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)',   text: '#ef4444' },
};

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function conditionLabel(c: string) {
  const map: Record<string, string> = {
    acne: 'Acne', laser_recovery: 'Laser', androgenic_alopecia: 'Hair',
    alopecia_areata: 'Hair', telogen_effluvium: 'Hair',
    post_hair_transplant: 'Hair Transplant', post_dental_implant: 'Dental',
    post_extraction: 'Dental', post_root_canal: 'Dental',
  };
  return map[c] ?? c;
}

export default function LoginPage() {
  const { setSession, setPatient, showToast } = useStore();
  const navigate = useNavigate();

  const [patients, setPatients]   = useState<PatientEntry[]>([]);
  const [fetching, setFetching]   = useState(true);
  const [selected, setSelected]   = useState<PatientEntry | null>(null);
  const [password, setPassword]   = useState('');
  const [loading, setLoading]     = useState(false);

  // Fetch enrolled patients via raw fetch (bypasses TS typing for new RPCs).
  // Falls back to get_org_dashboard (always exists) if list_org_patients not yet applied.
  useEffect(() => {
    const base = import.meta.env.VITE_SUPABASE_URL as string;
    const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const headers = {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    };

    async function load() {
      // Primary: list_org_patients (fast, returns only enrolled patients)
      try {
        const r = await fetch(`${base}/rest/v1/rpc/list_org_patients`, {
          method: 'POST', headers,
          body: JSON.stringify({ p_org_slug: ORG_SLUG }),
        });
        if (r.ok) {
          const rows = await r.json();
          if (Array.isArray(rows) && rows.length > 0) { setPatients(rows as PatientEntry[]); return; }
        }
      } catch { /* ignore — RPC may not exist yet */ }

      // Fallback: get_org_dashboard — filter to patients that have an auth account
      try {
        const r = await fetch(`${base}/rest/v1/rpc/get_org_dashboard`, {
          method: 'POST', headers,
          body: JSON.stringify({ p_org_slug: ORG_SLUG }),
        });
        if (r.ok) {
          const dash = await r.json();
          if (Array.isArray(dash?.patients)) {
            const enrolled = (dash.patients as Array<PatientEntry & { auth_user_id?: string }>)
              .filter(p => !!p.auth_user_id && !!p.email);
            setPatients(enrolled);
          }
        }
      } catch { /* ignore */ }
    }

    load().finally(() => setFetching(false));
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);
    try {
      const data = await signIn(selected.email, password);
      if (data.user) {
        setSession({ user: { id: data.user.id, email: data.user.email! } });
        const profile = await getPatientProfile(data.user.email!);
        if (profile) setPatient(profile);
        navigate('/', { replace: true });
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Sign in failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  const c = selected ? (STATUS_COLOR[selected.status] ?? STATUS_COLOR.green) : STATUS_COLOR.green;

  return (
    <div
      className="page-no-nav"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '32px 20px 40px', minHeight: '100%', overflowY: 'auto',
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18, marginBottom: 12,
          marginLeft: 'auto', marginRight: 'auto',
          background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 28px rgba(124,58,237,0.35)',
        }}>
          <svg viewBox="0 0 24 24" fill="white" width="32" height="32">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
          </svg>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px' }}>
          <span className="gradient-text">Care.ai</span>
        </div>
        <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>
          AI-powered skin recovery monitoring
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Step 1 — pick a patient */}
        {!selected && (
          <>
            <div style={{
              fontSize: 11, fontWeight: 600, color: '#64748b',
              letterSpacing: '0.08em', textAlign: 'center', marginBottom: 14,
              textTransform: 'uppercase',
            }}>
              {fetching ? 'Loading patients…' : patients.length === 0 ? 'No patients found' : 'Select your profile'}
            </div>

            {fetching && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                <div className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {patients.map(p => {
                const col = STATUS_COLOR[p.status] ?? STATUS_COLOR.green;
                return (
                  <button
                    key={p.id}
                    onClick={() => { setSelected(p); setPassword(''); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: 14, textAlign: 'left', width: '100%',
                      border: '1px solid rgba(255,255,255,0.07)',
                      background: 'rgba(255,255,255,0.03)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                      background: col.bg, border: `1px solid ${col.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: col.text,
                    }}>
                      {initials(p.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{p.name}</span>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: col.dot, flexShrink: 0,
                          boxShadow: `0 0 6px ${col.dot}`,
                        }} />
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        {conditionLabel(p.condition)} · Day {p.current_day}
                      </div>
                    </div>
                    <svg viewBox="0 0 20 20" fill="#4b5563" width="16" height="16" style={{ flexShrink: 0 }}>
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"/>
                    </svg>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Step 2 — enter password */}
        {selected && (
          <div>
            {/* Selected patient card */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px', borderRadius: 14, marginBottom: 20,
              border: `1px solid ${c.border}`, background: c.bg,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: c.bg, border: `1px solid ${c.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: c.text,
              }}>
                {initials(selected.name)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 2 }}>{selected.name}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {conditionLabel(selected.condition)} · Day {selected.current_day} · {selected.email}
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}
              >×</button>
            </div>

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500, marginBottom: 5, display: 'block' }}>Password</label>
                <input
                  className="input"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div style={{ fontSize: 11, color: '#4b5563', textAlign: 'center' }}>
                Default password for new patients: <span style={{ color: '#94a3b8', fontWeight: 600 }}>Patient@123</span>
              </div>
              <button
                type="submit"
                className="btn-primary"
                disabled={loading || !password}
                style={{ marginTop: 4 }}
              >
                {loading ? <div className="spinner" /> : 'Sign In →'}
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}
