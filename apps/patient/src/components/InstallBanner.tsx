/**
 * InstallBanner — shows install instructions on iOS Safari only.
 * Chrome/Android: native prompt is handled via beforeinstallprompt.
 * iOS Safari:     no API exists, so we show a manual step guide.
 * Dismissed state persists for the session.
 */

import React, { useEffect, useState } from 'react';

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator &&
      (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

export default function InstallBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isIOS()) return;
    if (isInStandaloneMode()) return; // already installed
    if (sessionStorage.getItem('ios-install-dismissed')) return;

    // Show after 3s so the user has a moment to orient themselves
    const t = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    sessionStorage.setItem('ios-install-dismissed', '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 88, // above bottom nav
      left: 12,
      right: 12,
      zIndex: 200,
      background: 'linear-gradient(135deg, #1a1a2e, #12121e)',
      border: '1px solid rgba(124,58,237,0.4)',
      borderRadius: 18,
      padding: '16px 16px 14px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg viewBox="0 0 24 24" fill="white" width="18" height="18">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Install Care.ai</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>Add to your home screen</div>
          </div>
        </div>
        <button onClick={dismiss} style={{
          background: 'none', border: 'none', color: '#475569',
          fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '2px 4px',
        }}>×</button>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Step 1 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={stepIconStyle}>
            {/* iOS share icon */}
            <svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <path d="M12 3v12M8 7l4-4 4 4"/>
              <path d="M8 13H5a1 1 0 00-1 1v5a1 1 0 001 1h14a1 1 0 001-1v-5a1 1 0 00-1-1h-3"/>
            </svg>
          </div>
          <div style={stepTextStyle}>
            Tap the <span style={{ color: '#a78bfa', fontWeight: 600 }}>Share</span> button at the bottom of Safari
          </div>
        </div>

        {/* Step 2 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={stepIconStyle}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.2"
              strokeLinecap="round" width="16" height="16">
              <rect x="3" y="3" width="18" height="18" rx="3"/>
              <path d="M12 8v8M8 12h8"/>
            </svg>
          </div>
          <div style={stepTextStyle}>
            Scroll and tap <span style={{ color: '#a78bfa', fontWeight: 600 }}>"Add to Home Screen"</span>
          </div>
        </div>

        {/* Step 3 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={stepIconStyle}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <path d="M5 13l4 4L19 7"/>
            </svg>
          </div>
          <div style={stepTextStyle}>
            Tap <span style={{ color: '#a78bfa', fontWeight: 600 }}>"Add"</span> — done!
          </div>
        </div>

      </div>

      {/* Bottom hint */}
      <div style={{
        marginTop: 12,
        paddingTop: 10,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        fontSize: 10,
        color: '#475569',
        textAlign: 'center',
      }}>
        Must be opened in Safari · Works offline once installed
      </div>

    </div>
  );
}

const stepIconStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  background: 'rgba(124,58,237,0.12)',
  border: '1px solid rgba(124,58,237,0.2)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const stepTextStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#94a3b8',
  lineHeight: 1.4,
};
