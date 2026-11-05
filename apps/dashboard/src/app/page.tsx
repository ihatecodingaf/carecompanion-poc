'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Root() {
  const [checking, setChecking] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [pressed, setPressed] = useState<string | null>(null);

  useEffect(() => {
    const hasSession = /sb-[a-z0-9]+-auth-token=/.test(document.cookie);
    setLoggedIn(hasSession);
    setChecking(false);
  }, []);

  function press(key: string) {
    setPressed(key);
    setTimeout(() => setPressed(null), 180);
  }

  function cardStyle(key: string, teal: boolean): React.CSSProperties {
    const isPressed = pressed === key;
    return {
      background: teal ? 'var(--teal)' : 'var(--bg3)',
      border: teal ? 'none' : '1px solid var(--b)',
      borderRadius: 12,
      padding: '18px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      cursor: 'pointer',
      boxShadow: teal ? '0 4px 16px rgba(43,191,191,0.3)' : 'none',
      transform: isPressed ? 'scale(0.96)' : 'scale(1)',
      opacity: isPressed ? 0.82 : 1,
      transition: 'transform 0.12s ease, opacity 0.12s ease',
    };
  }

  function iconBox(teal: boolean): React.CSSProperties {
    return {
      width: 44, height: 44, borderRadius: 12, flexShrink: 0,
      background: teal ? 'rgba(255,255,255,0.2)' : 'rgba(43,191,191,0.1)',
      border: teal ? 'none' : '1px solid rgba(43,191,191,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
    };
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: 320 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18, margin: '0 auto 14px',
            background: 'linear-gradient(135deg, #0D1B2A, #132338)',
            border: '1px solid rgba(43,191,191,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 28px rgba(43,191,191,0.15)',
          }}>
            <span style={{ fontWeight: 800, fontSize: 22, color: 'var(--teal)' }}>Rx</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t)', letterSpacing: '-0.3px' }}>Care.ai</div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>AI-Powered Doctor Portal</div>
        </div>

        {checking ? (
          <div style={{ textAlign: 'center', color: 'var(--t3)', fontSize: 12 }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Doctor Login / Continue to Dashboard */}
            <Link href={loggedIn ? '/dashboard' : '/login'} style={{ textDecoration: 'none' }} onClick={() => press('auth')}>
              <div style={cardStyle('auth', true)}>
                <div style={iconBox(true)}>{loggedIn ? '📋' : '🩺'}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 2 }}>
                    {loggedIn ? 'Continue to Dashboard' : 'Doctor Login'}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>
                    {loggedIn ? 'You are already signed in' : 'Choose a doctor to sign in'}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.7)', fontSize: 16 }}>→</div>
              </div>
            </Link>

            {/* Add Patient — always visible, no login required */}
            <Link href="/add-patient" style={{ textDecoration: 'none' }} onClick={() => press('add')}>
              <div style={cardStyle('add', false)}>
                <div style={iconBox(false)}>➕</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Add Patient</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>Register via prescription scan</div>
                </div>
                <div style={{ marginLeft: 'auto', color: 'var(--t3)', fontSize: 16 }}>→</div>
              </div>
            </Link>

          </div>
        )}
      </div>
    </div>
  );
}
