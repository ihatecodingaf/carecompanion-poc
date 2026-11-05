import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';

export default function LandingPage() {
  const navigate = useNavigate();
  const session  = useStore((s) => s.session);

  function goViewReports() {
    // If already signed in skip login, go straight to dashboard
    navigate(session ? '/dashboard' : '/login');
  }

  return (
    <div
      className="flex flex-col"
      style={{ minHeight: '100dvh', background: 'var(--bg)' }}
    >
      {/* ── Hero ── */}
      <div
        className="flex-shrink-0 text-center pt-12 pb-5 px-5"
        style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--b)' }}
      >
        <div
          className="text-[0.95rem] font-extrabold tracking-[0.08em] mb-0.5"
          style={{ color: 'var(--t)' }}
        >
          PRECOVERY
        </div>
        <div
          className="text-[0.54rem] font-semibold tracking-widest uppercase mb-5"
          style={{ color: 'var(--teal)' }}
        >
          AI Care Companion
        </div>
        <div
          className="text-[0.7rem] font-medium leading-relaxed"
          style={{ color: 'var(--t2)' }}
        >
          AI-Powered Post-Op Recovery Platform
        </div>
      </div>

      {/* ── Install banner ── */}
      <div
        className="flex items-center gap-2.5 flex-shrink-0 px-4 py-2.5"
        style={{
          background: 'rgba(43,191,191,0.07)',
          borderBottom: '1px solid rgba(43,191,191,0.18)',
        }}
      >
        <span className="text-lg flex-shrink-0">📲</span>
        <div className="flex-1 min-w-0">
          <div className="text-[0.66rem] font-bold" style={{ color: 'var(--teal)' }}>
            Add to Home Screen
          </div>
          <div className="text-[0.54rem]" style={{ color: 'var(--t3)', marginTop: 1 }}>
            Tap Share → Add to Home Screen for app experience
          </div>
        </div>
      </div>

      {/* ── Option cards ── */}
      <div className="flex-1 flex flex-col gap-3 px-4 pt-4 pb-3 min-h-0">

        {/* Card 1 — Add New Patient */}
        <button
          onClick={() => navigate('/add-patient')}
          className="flex-1 flex items-center gap-4 rounded-2xl px-5 py-5 text-left
                     relative overflow-hidden transition-transform active:scale-[0.98]"
          style={{
            background:   'var(--bg3)',
            border:       '1.5px solid rgba(43,191,191,0.4)',
            minHeight:    0,
          }}
        >
          {/* Top accent */}
          <div
            className="absolute top-0 left-0 right-0 h-[3px]"
            style={{ background: 'linear-gradient(90deg, var(--teal), rgba(43,191,191,0.2))' }}
          />

          {/* Icon */}
          <div
            className="flex-shrink-0 w-[56px] h-[56px] rounded-[14px] flex items-center justify-center text-[1.6rem]"
            style={{
              background: 'rgba(43,191,191,0.12)',
              border:     '1.5px solid rgba(43,191,191,0.3)',
            }}
          >
            ➕
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <div
              className="text-[0.92rem] font-extrabold tracking-tight mb-1"
              style={{ color: 'var(--t)' }}
            >
              Add New Patient
            </div>
            <div
              className="text-[0.64rem] leading-[1.55]"
              style={{ color: 'var(--t2)' }}
            >
              Upload prescription, register patient &amp; begin AI-powered recovery monitoring
            </div>
            <div className="flex items-center gap-1 mt-2.5">
              <span className="text-[0.6rem] font-bold" style={{ color: 'var(--teal)' }}>
                No login required
              </span>
              <span style={{ color: 'var(--teal)', fontSize: '0.75rem' }}>›</span>
            </div>
          </div>
        </button>

        {/* Card 2 — View Reports */}
        <button
          onClick={goViewReports}
          className="flex-1 flex items-center gap-4 rounded-2xl px-5 py-5 text-left
                     transition-transform active:scale-[0.98]"
          style={{
            background: 'var(--bg3)',
            border:     '1.5px solid var(--b)',
            minHeight:  0,
          }}
        >
          {/* Icon */}
          <div
            className="flex-shrink-0 w-[56px] h-[56px] rounded-[14px] flex items-center justify-center text-[1.6rem]"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border:     '1.5px solid var(--b)',
            }}
          >
            📋
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <div
              className="text-[0.92rem] font-extrabold tracking-tight mb-1"
              style={{ color: 'var(--t)' }}
            >
              View Patient Reports
            </div>
            <div
              className="text-[0.64rem] leading-[1.55]"
              style={{ color: 'var(--t2)' }}
            >
              Access existing patients, recovery progress, clinical alerts &amp; adherence data
            </div>
            <div className="flex items-center gap-1 mt-2.5">
              <span className="text-[0.6rem] font-bold" style={{ color: 'var(--teal)' }}>
                {session ? 'Go to dashboard' : 'Sign in required'}
              </span>
              <span style={{ color: 'var(--teal)', fontSize: '0.75rem' }}>›</span>
            </div>
          </div>
        </button>
      </div>

      {/* ── Footer ── */}
      <p className="text-center text-[0.5rem] pb-6 flex-shrink-0" style={{ color: 'var(--t3)' }}>
        DPDP Act compliant · End-to-end encrypted
      </p>
    </div>
  );
}
