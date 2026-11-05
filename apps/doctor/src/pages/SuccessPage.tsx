import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';

export default function SuccessPage() {
  const navigate       = useNavigate();
  const registered     = useStore((s) => s.lastRegistered);
  const setOcrResult   = useStore((s) => s.setOcrResult);
  const setDraft       = useStore((s) => s.setNewPatientDraft);

  function addAnother() {
    setOcrResult(null);
    setDraft(null);
    navigate('/add-patient');
  }

  return (
    <div
      className="flex flex-col items-center justify-center px-5 text-center"
      style={{ minHeight: '100dvh', background: 'var(--bg)' }}
    >
      {/* Success icon */}
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center text-[1.4rem] mb-4"
        style={{
          background: 'linear-gradient(135deg, var(--teal), #0f766e)',
          boxShadow:  '0 6px 20px rgba(43,191,191,0.35)',
        }}
      >
        ✓
      </div>

      <div className="text-[0.88rem] font-bold mb-1" style={{ color: 'var(--t)' }}>
        Patient Registered!
      </div>

      <div className="text-[0.62rem] leading-relaxed mb-3" style={{ color: 'var(--t2)' }}>
        {registered
          ? <><strong>{registered.name}</strong> registered successfully.</>
          : 'Patient registered successfully.'
        }<br />
        WhatsApp invite sent for app activation.
      </div>

      {/* Status badge */}
      <div
        className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[0.56rem] font-bold mb-4"
        style={{
          background: 'rgba(245,158,11,0.12)',
          border:     '1px solid rgba(245,158,11,0.3)',
          color:      '#fbbf24',
        }}
      >
        ⏳ Registered · Activation Pending
      </div>

      {/* Summary card */}
      {registered && (
        <div
          className="w-full rounded-xl px-3.5 py-3 mb-4 text-left"
          style={{ background: 'var(--bg3)', border: '1px solid var(--b)' }}
        >
          <Row label="Patient"    value={registered.name} />
          <Row label="Condition"  value={registered.condition} />
          <Row label="Treatment"  value={registered.treatment_name} />
          {registered.follow_up_date && (
            <Row label="Follow-up" value={registered.follow_up_date} />
          )}
          <Row label="Patient App" value="⏳ Awaiting activation" valueColor="#fbbf24" last />
        </div>
      )}

      {/* CTA buttons */}
      <div className="flex gap-3">
        <button
          onClick={addAnother}
          className="px-4 py-2.5 rounded-xl text-[0.68rem] font-semibold"
          style={{
            background: 'var(--bg3)',
            border:     '1px solid var(--b)',
            color:      'var(--t2)',
            cursor:     'pointer',
          }}
        >
          + Add Another
        </button>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2.5 rounded-xl text-[0.72rem] font-bold"
          style={{
            background: 'var(--teal)',
            color:      '#fff',
            border:     'none',
            cursor:     'pointer',
            boxShadow:  '0 2px 10px rgba(43,191,191,0.3)',
          }}
        >
          Dashboard →
        </button>
      </div>
    </div>
  );
}

function Row({
  label, value, valueColor, last,
}: {
  label: string; value: string; valueColor?: string; last?: boolean;
}) {
  return (
    <div
      className="flex justify-between items-center text-[0.62rem] py-1"
      style={{ borderBottom: last ? 'none' : '1px solid var(--b2)' }}
    >
      <span style={{ color: 'var(--t3)' }}>{label}</span>
      <span style={{ color: valueColor ?? 'var(--t)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}
