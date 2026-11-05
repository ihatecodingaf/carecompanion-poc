import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { sendDoctorMessage } from '../lib/api';
import ActionModal from '../components/ActionModal';
import ChatSheet   from '../components/ChatSheet';
import type { Patient, Alert } from '../store/useStore';

const STATUS_GRAD: Record<string, string> = {
  red:    'linear-gradient(135deg,#E63946,#b91c1c)',
  yellow: 'linear-gradient(135deg,#F59E0B,#d97706)',
  green:  'linear-gradient(135deg,#10B981,#059669)',
};
const ADH_COLOR = (p: number) => p >= 80 ? '#34d399' : p >= 60 ? '#fbbf24' : '#f87171';

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Demo check-in day state ───────────────────────────────────────────────────
type DayStatus = 'done' | 'missed' | 'today' | 'pending';

function buildDayStatuses(currentDay: number, totalDays = 14): DayStatus[] {
  return Array.from({ length: totalDays }, (_, i) => {
    const d = i + 1;
    if (d < currentDay)  return Math.random() > 0.2 ? 'done' : 'missed';
    if (d === currentDay) return 'today';
    return 'pending';
  });
}

const DAY_STYLE: Record<DayStatus, React.CSSProperties> = {
  done:    { background: 'var(--teal)',                       color: '#fff' },
  missed:  { background: 'rgba(230,57,70,0.2)',               color: '#f87171', border: '1px solid rgba(230,57,70,0.35)' },
  today:   { background: 'var(--gold)',                       color: '#fff', boxShadow: '0 0 0 2px rgba(245,158,11,0.4)' },
  pending: { background: 'var(--bg4)', border: '1px solid var(--b)', color: 'var(--t3)' },
};

const HISTORY_TABS = ['Symptoms','Diagnosis','Medications','Precautions','Tests','Follow-up'];

const DOCTOR_ACTIONS = [
  { icon: '🤖', title: 'Update AI Analysis',     sub: 'Edit notes or add doctor override',     pri: true  },
  { icon: '💊', title: 'Change Prescription',    sub: 'Update medications, dosage, frequency', pri: false },
  { icon: '📅', title: 'Change Check-in Schedule',sub: 'Frequency, duration, questions',       pri: false },
  { icon: '🩺', title: 'Update Diagnosis',        sub: 'Revise clinical diagnosis and notes',   pri: false },
  { icon: '📌', title: 'Update Precautions',      sub: 'Edit patient dos and don\'ts',          pri: false },
  { icon: '💬', title: 'Contact Patient',         sub: 'Call, video, message, AI suggestions',  pri: true  },
  { icon: '📆', title: 'Schedule Appointment',   sub: 'Book next visit or follow-up',          pri: false },
];

export default function PatientDetailPage() {
  const { patientId, orgSlug } = useParams<{ patientId: string; orgSlug: string }>();
  const navigate   = useNavigate();
  const dashboard  = useStore((s) => s.dashboard);
  const doctor     = useStore((s) => s.doctor);
  const showToast  = useStore((s) => s.showToast);

  // Find patient + alerts from already-loaded dashboard data
  const patient = dashboard?.patients.find((p) => p.id === patientId) as Patient | undefined;
  const alerts  = (dashboard?.alerts ?? []).filter(
    (a: Alert) => a.patient_id === patientId,
  );

  const [selDay,       setSelDay]       = useState((patient?.current_day ?? 7));
  const [dayStatuses,  setDayStatuses]  = useState<DayStatus[]>([]);
  const [histTab,      setHistTab]      = useState(0);
  const [chatOpen,     setChatOpen]     = useState(false);
  const [modalConfig,  setModalConfig]  = useState<{ title: string; sub: string } | null>(null);
  const [modalVal,     setModalVal]     = useState('');
  const [aiText,       setAiText]       = useState('');

  useEffect(() => {
    if (patient) {
      setDayStatuses(buildDayStatuses(patient.current_day));
      const topAlert = alerts[0];
      setAiText(topAlert?.ai_analysis ?? `Day ${patient.current_day} — Review pending. No new check-in data available.`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  // If dashboard hasn't loaded or patient not found
  if (!patient) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3">
        <span className="text-2xl">👤</span>
        <p className="text-[0.72rem]" style={{ color: 'var(--t2)' }}>Patient not found</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-[0.68rem] font-semibold"
          style={{ color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ← Back to dashboard
        </button>
      </div>
    );
  }

  const hasUrgentAlert = alerts.some((a) => a.severity === 'red' || a.severity === 'critical');
  const adh            = patient.adherence_percent ?? 0;
  const avColor        = STATUS_GRAD[patient.status] ?? STATUS_GRAD.green;
  const totalDays      = 14;

  function openAction(title: string, sub: string) {
    if (title === 'Contact Patient') { setChatOpen(true); return; }
    setModalConfig({ title, sub });
    setModalVal('');
  }

  async function saveModal() {
    if (!modalConfig) return;
    if (modalConfig.title === 'Update AI Analysis') setAiText(modalVal);
    showToast(`${modalConfig.title} updated`, 'success');
    setModalConfig(null);
  }

  async function pushToPatient() {
    try {
      await sendDoctorMessage(patientId!, orgSlug!, aiText, doctor?.id ?? 'dr-demo');
      showToast('Updates sent to patient app', 'success');
    } catch {
      showToast('Failed to send', 'error');
    }
  }

  return (
    <>
      <div className="flex flex-col" style={{ height: '100%', background: 'var(--bg)' }}>

        {/* ── Back bar ── */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-3.5"
          style={{ height: 44, background: 'var(--bg2)', borderBottom: '1px solid var(--b)' }}
        >
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1 text-[0.72rem] font-semibold"
            style={{ color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ‹ Alerts
          </button>
          <span className="text-[0.8rem] font-bold" style={{ color: 'var(--t)' }}>Patient Review</span>
          <button
            onClick={() => setChatOpen(true)}
            className="text-[0.68rem] font-semibold"
            style={{ color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            💬
          </button>
        </div>

        {/* ── Urgent banner ── */}
        {hasUrgentAlert && (
          <div
            className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5"
            style={{ background: 'rgba(230,57,70,0.12)', borderBottom: '1px solid rgba(230,57,70,0.25)' }}
          >
            <span>🚨</span>
            <span className="flex-1 text-[0.62rem] font-bold leading-snug" style={{ color: '#f87171' }}>
              {alerts[0]?.title ?? 'Urgent · Immediate Review Required'}
            </span>
            <button
              onClick={() => openAction('Update AI Analysis', 'Add doctor override or action taken')}
              className="text-[0.54rem] font-bold px-2 py-0.5 rounded-lg"
              style={{ background: 'var(--red)', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              Act
            </button>
          </div>
        )}

        {/* ── Patient strip ── */}
        <div
          className="flex-shrink-0 flex items-center gap-2.5 px-3 py-2"
          style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--b)' }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-[0.68rem] font-bold text-white flex-shrink-0"
            style={{ background: avColor }}
          >
            {initials(patient.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[0.78rem] font-bold" style={{ color: 'var(--t)' }}>{patient.name}</div>
            <div className="flex gap-1.5 flex-wrap mt-0.5">
              <Chip>{patient.condition}</Chip>
              <Chip>{patient.treatment_name}</Chip>
              <Chip color={patient.status === 'red' ? 'rgba(230,57,70,0.3)' : patient.status === 'yellow' ? 'rgba(245,158,11,0.3)' : 'rgba(43,191,191,0.3)'}>
                {patient.status === 'red' ? '🔴 Alert' : patient.status === 'yellow' ? '🟡 Watch' : '🟢 On Track'}
              </Chip>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-[1.1rem] font-extrabold" style={{ color: ADH_COLOR(adh) }}>{adh}%</div>
            <div className="text-[0.46rem]" style={{ color: 'var(--t3)' }}>Adherence</div>
            <div className="w-11 h-[3px] rounded-full overflow-hidden mt-1" style={{ background: 'var(--bg4)' }}>
              <div className="h-full rounded-full" style={{ width: `${adh}%`, background: ADH_COLOR(adh) }} />
            </div>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto no-scroll" id="det-scroll">

          {/* Adherence breakdown */}
          <div
            className="px-3 py-2"
            style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--b)' }}
          >
            <div className="text-[0.5rem] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--t3)' }}>
              Adherence Breakdown
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.58rem' }}>
              <thead>
                <tr>
                  {['Metric','Progress','Score','Status'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', color: 'var(--t3)', padding: '2px 3px', fontSize: '0.48rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Medication', pct: Math.round(adh * 0.9),  badge: adh >= 80 ? 'Good' : adh >= 60 ? 'Low' : 'Critical', bc: adh >= 80 ? 'rgba(16,185,129,0.15)' : adh >= 60 ? 'rgba(245,158,11,0.15)' : 'rgba(230,57,70,0.18)', tc: ADH_COLOR(adh) },
                  { label: 'Check-ins',  pct: Math.round(adh * 1.1 > 100 ? 100 : adh * 1.1), badge: 'Low', bc: 'rgba(245,158,11,0.15)', tc: '#fbbf24' },
                  { label: 'Photos',     pct: Math.round(adh * 1.2 > 100 ? 100 : adh * 1.2), badge: 'Good', bc: 'rgba(43,191,191,0.15)', tc: 'var(--teal)' },
                  { label: 'Precautions',pct: Math.round(adh * 0.7), badge: adh >= 70 ? 'Low' : 'Critical', bc: adh >= 70 ? 'rgba(245,158,11,0.15)' : 'rgba(230,57,70,0.18)', tc: adh >= 70 ? '#fbbf24' : '#f87171' },
                ].map((row) => (
                  <tr key={row.label}>
                    <td style={{ padding: '3px', color: 'var(--t2)', fontWeight: 600, width: 72 }}>{row.label}</td>
                    <td style={{ padding: '3px' }}>
                      <div style={{ width: 56, height: 3, background: 'var(--bg4)', borderRadius: 99, overflow: 'hidden', display: 'inline-block', verticalAlign: 'middle' }}>
                        <div style={{ height: '100%', width: `${row.pct}%`, background: row.tc, borderRadius: 99 }} />
                      </div>
                    </td>
                    <td style={{ padding: '3px', fontWeight: 700, color: row.tc }}>{row.pct}%</td>
                    <td style={{ padding: '3px' }}>
                      <span style={{ fontSize: '0.46rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: row.bc, color: row.tc }}>{row.badge}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Check-in day timeline */}
          <div
            className="mx-2.5 my-2 rounded-xl px-3 py-2.5"
            style={{ background: 'var(--bg3)', border: '1px solid var(--b)' }}
          >
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[0.66rem] font-bold" style={{ color: 'var(--t)' }}>Check-in Progress</span>
              <span
                className="text-[0.52rem] font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(43,191,191,0.15)', color: 'var(--teal)', border: '1px solid rgba(43,191,191,0.25)' }}
              >
                Day {patient.current_day} of {totalDays}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden mb-1.5" style={{ background: 'var(--bg4)' }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${(patient.current_day / totalDays) * 100}%`, background: 'linear-gradient(90deg, var(--teal), #0f766e)' }}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dayStatuses.map((status, i) => {
                const d = i + 1;
                const isSel = d === selDay;
                return (
                  <button
                    key={d}
                    onClick={() => setSelDay(d)}
                    className="w-[18px] h-[18px] rounded-full text-[0.45rem] font-bold flex items-center justify-center flex-shrink-0 transition-transform active:scale-[0.88]"
                    style={{
                      ...DAY_STYLE[status],
                      boxShadow: isSel
                        ? `0 0 0 2px #fff, 0 0 0 3.5px var(--teal), ${DAY_STYLE[status].boxShadow ?? 'none'}`
                        : DAY_STYLE[status].boxShadow,
                      cursor: 'pointer',
                    }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3 mt-2">
              {[['done','var(--teal)','Done'],['today','var(--gold)','Today'],['missed','#f87171','Missed'],['pending','var(--t3)','Pending']].map(([,c,l]) => (
                <span key={l} className="text-[0.5rem]" style={{ color: c as string }}>{l}</span>
              ))}
            </div>
          </div>

          {/* AI Analysis card */}
          <div
            className="mx-2.5 mb-2 rounded-xl overflow-hidden"
            style={{ background: 'var(--bg4)', border: '1px solid rgba(43,191,191,0.2)' }}
          >
            {/* Patient-facing section */}
            <div
              className="flex items-center justify-between px-3 py-2"
              style={{ background: 'rgba(43,191,191,0.08)', borderBottom: '1px solid rgba(43,191,191,0.15)' }}
            >
              <div className="flex items-center gap-2">
                <span className="text-[0.52rem] font-bold uppercase tracking-wider" style={{ color: 'var(--teal)' }}>
                  🤖 AI Analysis
                </span>
                <span
                  className="text-[0.48rem] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(43,191,191,0.2)', border: '1px solid rgba(43,191,191,0.35)', color: 'var(--teal)' }}
                >
                  📤 Sent to Patient
                </span>
              </div>
              <span className="text-[0.48rem] font-semibold" style={{ color: 'var(--teal)' }}>Review before sending</span>
            </div>
            <textarea
              className="w-full bg-transparent border-none outline-none text-[0.68rem] leading-relaxed"
              style={{ color: 'var(--t)', fontFamily: 'inherit', resize: 'none', padding: '8px 12px', minHeight: 70 }}
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
            />

            {/* Internal KPIs */}
            <div
              className="flex items-center gap-2 px-3 pt-1.5 pb-1"
              style={{ borderTop: '1px solid rgba(43,191,191,0.15)' }}
            >
              <span className="text-[0.5rem] font-bold uppercase tracking-wider" style={{ color: '#7BA3C4' }}>
                📊 Clinical KPIs
              </span>
              <span
                className="text-[0.46rem] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' }}
              >
                🔒 Internal Only
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 px-3 pb-3">
              {alerts[0] && [
                { v: alerts[0].severity === 'red' ? 'High' : 'Med', l: 'Alert Level', r: alerts[0].severity === 'red' },
                { v: `${adh}%`, l: 'Adherence', r: adh < 60 },
                { v: `Day ${patient.current_day}`, l: 'Current Day', r: false },
              ].map((kpi) => (
                <div key={kpi.l} className="rounded-lg px-2 py-1.5 text-center" style={{ background: 'var(--bg3)', border: '1px solid var(--b)', minWidth: 56 }}>
                  <div className="text-[0.82rem] font-extrabold" style={{ color: kpi.r ? '#f87171' : 'var(--teal)' }}>{kpi.v}</div>
                  <div className="text-[0.46rem]" style={{ color: 'var(--t3)' }}>{kpi.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Doctor Actions */}
          <div className="mx-2.5 mb-2">
            <div className="text-[0.52rem] font-bold uppercase tracking-[0.08em] mb-2 pl-0.5" style={{ color: 'var(--t3)' }}>
              ⚡ Doctor Actions
            </div>
            <div className="flex flex-col gap-1.5">
              {DOCTOR_ACTIONS.map((a) => (
                <button
                  key={a.title}
                  onClick={() => openAction(a.title, a.sub)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left
                             transition-transform active:scale-[0.98] w-full"
                  style={{
                    background: a.pri ? 'rgba(43,191,191,0.07)' : 'var(--bg3)',
                    border:     `1px solid ${a.pri ? 'rgba(43,191,191,0.25)' : 'var(--b)'}`,
                    cursor:     'pointer',
                  }}
                >
                  <span className="text-[0.9rem] flex-shrink-0">{a.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[0.7rem] font-bold" style={{ color: 'var(--t)' }}>{a.title}</div>
                    <div className="text-[0.54rem]" style={{ color: 'var(--t3)' }}>{a.sub}</div>
                  </div>
                  <span className="text-[0.7rem] flex-shrink-0" style={{ color: a.pri ? 'var(--teal)' : 'var(--t3)' }}>›</span>
                </button>
              ))}
            </div>
          </div>

          {/* Send to Patient CTA */}
          <button
            onClick={pushToPatient}
            className="mx-2.5 mb-3 flex items-center gap-3 rounded-xl px-4 py-3 w-[calc(100%-20px)]
                       transition-transform active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, var(--teal), #0f766e)', cursor: 'pointer', border: 'none' }}
          >
            <span className="text-[1.2rem] flex-shrink-0">📤</span>
            <div className="flex-1 text-left">
              <div className="text-[0.74rem] font-bold text-white">Send Updates to Patient</div>
              <div className="text-[0.54rem]" style={{ color: 'rgba(255,255,255,0.75)' }}>Push care plan &amp; notes to patient app</div>
            </div>
            <span className="text-white text-[0.85rem]">›</span>
          </button>

          {/* Patient History tabs */}
          <div
            className="flex overflow-x-auto no-scroll"
            style={{ background: 'var(--bg2)', borderTop: '1px solid var(--b)', borderBottom: '1px solid var(--b)' }}
          >
            {HISTORY_TABS.map((tab, i) => (
              <button
                key={tab}
                onClick={() => setHistTab(i)}
                className="flex-shrink-0 px-3 py-2 text-[0.6rem] font-semibold whitespace-nowrap"
                style={{
                  background:   'none',
                  border:       'none',
                  borderBottom: `2px solid ${histTab === i ? 'var(--teal)' : 'transparent'}`,
                  color:        histTab === i ? 'var(--teal)' : 'var(--t3)',
                  cursor:       'pointer',
                  marginBottom: -1,
                }}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="px-3 py-3 mb-4" style={{ background: 'var(--bg2)' }}>
            <HistoryContent tab={histTab} patient={patient} />
          </div>

        </div>
      </div>

      {/* ── Action Modal ── */}
      {modalConfig && (
        <ActionModal
          title={modalConfig.title}
          subtitle={modalConfig.sub}
          value={modalVal}
          onChange={setModalVal}
          onSave={saveModal}
          onClose={() => setModalConfig(null)}
        />
      )}

      {/* ── Chat Sheet ── */}
      {chatOpen && (
        <ChatSheet
          patientId={patientId!}
          orgSlug={orgSlug!}
          patientName={patient.name}
          patientSub={`${patient.condition} · ${patient.treatment_name}`}
          avatarText={initials(patient.name)}
          avatarColor={avColor}
          onClose={() => setChatOpen(false)}
        />
      )}
    </>
  );
}

// ── History Tab Content ───────────────────────────────────────────────────────

function HistoryContent({ tab, patient }: { tab: number; patient: Patient }) {
  const rows: Array<[string, string]>[] = [
    [['Condition',   patient.condition], ['Severity', 'Moderate']],
    [['Diagnosis',   patient.condition], ['Treatment', patient.treatment_name]],
    [['Medications', 'Per prescription — see clinical notes'], ['Adherence', `${patient.adherence_percent}%`]],
    [['Precautions', 'Follow post-treatment guidelines'], ['Protocol',    'Standard']],
    [['Pending Tests','Refer to clinical notes'], ['Status', 'Not conducted']],
    [['Next Follow-up', 'As scheduled'], ['Session', 'Pending review']],
  ];

  return (
    <div>
      {rows[tab]?.map(([label, value]) => (
        <div key={label} className="py-1.5" style={{ borderBottom: '1px solid var(--b2)' }}>
          <div className="text-[0.5rem] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--t3)' }}>{label}</div>
          <div className="text-[0.68rem] leading-relaxed" style={{ color: 'var(--t)' }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Tiny helpers ─────────────────────────────────────────────────────────────

function Chip({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="text-[0.5rem] font-medium px-1.5 py-0.5 rounded-full"
      style={{
        background: color ? `${color.replace('0.3', '0.08')}` : 'var(--bg4)',
        border:     `1px solid ${color ?? 'var(--b)'}`,
        color:      'var(--t2)',
      }}
    >
      {children}
    </span>
  );
}
