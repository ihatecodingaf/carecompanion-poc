'use client';
import React, { useState } from 'react';

const DEMO_DOCTORS = [
  { name: 'Dr. Sofia Martinez', role: 'Dermatologist', initials: 'SM', email: 'dr.martinez@careai.demo', password: 'Doctor@123' },
  { name: 'Dr. Priya Nair',     role: 'Dermatologist', initials: 'PN', email: 'dr.priya@careai.demo',    password: 'Doctor@123' },
  { name: 'Dr. Anil Sharma',    role: 'Dermatologist', initials: 'AS', email: 'dr.sharma@careai.demo',   password: 'Doctor@123' },
];

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    if (!res.ok) { setError(body.error ?? 'Sign-in failed'); setLoading(false); }
    else window.location.href = '/dashboard';
  }

  function fill(doc: typeof DEMO_DOCTORS[0]) {
    setEmail(doc.email);
    setPassword(doc.password);
    setError('');
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 16px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg,var(--teal),#1a9999)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', boxShadow: '0 6px 20px rgba(43,191,191,0.35)' }}>
            <svg viewBox="0 0 24 24" fill="white" width="26" height="26"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t)', letterSpacing: '-0.3px' }}>CareCompanion</div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3, letterSpacing: '0.05em' }}>DOCTOR PORTAL</div>
        </div>

        {/* Demo doctor chips */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>
            — Demo Accounts —
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DEMO_DOCTORS.map(doc => (
              <button key={doc.email} onClick={() => fill(doc)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: email === doc.email ? 'rgba(43,191,191,0.08)' : 'var(--bg3)', border: `1px solid ${email === doc.email ? 'var(--teal)' : 'var(--b)'}`, borderRadius: 10, padding: '9px 12px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,var(--teal),#1a9999)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{doc.initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>{doc.email}</div>
                </div>
                <div style={{ fontSize: 9, color: 'var(--teal)', fontWeight: 700, flexShrink: 0 }}>TAP</div>
              </button>
            ))}
          </div>
        </div>

        {/* Login form */}
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--b)', borderRadius: 12, padding: '18px 16px' }}>
          <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="doctor@clinic.com" required
                style={{ width: '100%', background: 'var(--bg4)', border: '1.5px solid var(--b)', borderRadius: 8, padding: '8px 10px', color: 'var(--t)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                style={{ width: '100%', background: 'var(--bg4)', border: '1.5px solid var(--b)', borderRadius: 8, padding: '8px 10px', color: 'var(--t)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            {error && <div style={{ color: 'var(--red)', fontSize: 11, padding: '7px 10px', background: 'rgba(230,57,70,0.08)', borderRadius: 7, border: '1px solid rgba(230,57,70,0.2)' }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ background: loading ? 'rgba(43,191,191,0.4)' : 'var(--teal)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 2, boxShadow: '0 2px 8px rgba(43,191,191,0.3)', letterSpacing: '0.02em' }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 10, color: 'var(--t3)' }}>
          Tap any doctor above to prefill credentials
        </div>
      </div>
    </div>
  );
}
