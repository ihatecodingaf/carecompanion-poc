import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { getDoctorDashboardById, subscribeToAlerts } from '../lib/api';
import TopBar from '../components/TopBar';
import type { Patient, Alert, DashboardStats } from '../store/useStore';

const ADH_COLOR  = (p: number) => p >= 80 ? '#34d399' : p >= 60 ? '#fbbf24' : '#f87171';
const STAT_ACCENTS = ['var(--teal)','var(--green)','var(--red)','var(--gold)','var(--pur)','var(--blue)'];
const ALERT_TOP: Record<string, string> = { red: 'var(--red)', yellow: 'var(--gold)', green: 'var(--teal)' };

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function avatarGrad(status: string) {
  if (status === 'red')    return 'linear-gradient(135deg,#E63946,#b91c1c)';
  if (status === 'yellow') return 'linear-gradient(135deg,#F59E0B,#d97706)';
  return 'linear-gradient(135deg,#2BBFBF,#0f766e)';
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, accent, icon,
}: { label: string; value: string | number; sub?: string; accent: string; icon: string }) {
  return (
    <div
      className="rounded-xl p-2.5 relative overflow-hidden"
      style={{ background: 'var(--bg3)', border: '1px solid var(--b)' }}
    >
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: accent }} />
      <div className="absolute right-1.5 top-1.5 text-[0.85rem] opacity-15 select-none">{icon}</div>
      <div className="text-[0.5rem] font-bold uppercase tracking-[0.04em] mb-1" style={{ color: '#7BA3C4' }}>
        {label}
      </div>
      <div className="text-[1.35rem] font-extrabold leading-none" style={{ color: 'var(--t)' }}>
        {value ?? '—'}
      </div>
      {sub && <div className="text-[0.48rem] mt-1" style={{ color: '#5F82A8' }}>{sub}</div>}
    </div>
  );
}

// ── Alert card (2-col) ────────────────────────────────────────────────────────
function AlertCard({
  alert, patient, onClick,
}: { alert: Alert; patient?: Patient; onClick: () => void }) {
  const adh = patient?.adherence_percent ?? 0;
  return (
    <button
      onClick={onClick}
      className="rounded-xl p-2.5 text-left transition-transform active:scale-[0.97] w-full"
      style={{
        background: 'var(--bg3)',
        border:     '1px solid var(--b)',
        borderTop:  `3px solid ${ALERT_TOP[alert.severity] ?? 'var(--red)'}`,
        cursor:     'pointer',
      }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <div
          className="w-[26px] h-[26px] rounded-full flex-shrink-0 flex items-center justify-center
                     text-[0.52rem] font-bold text-white"
          style={{ background: avatarGrad(alert.severity) }}
        >
          {patient ? initials(patient.name) : '?'}
        </div>
        <div className="min-w-0">
          <div className="text-[0.72rem] font-bold truncate" style={{ color: 'var(--t)' }}>
            {patient?.name ?? 'Unknown'}
          </div>
          <div className="text-[0.56rem] font-semibold truncate" style={{ color: 'var(--teal)' }}>
            {patient?.treatment_name ?? '—'}
          </div>
        </div>
      </div>
      <div
        className="text-[0.58rem] leading-[1.45] mb-1.5"
        style={{
          color: 'var(--t2)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {alert.ai_analysis}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[0.66rem] font-extrabold" style={{ color: ADH_COLOR(adh) }}>
          {adh}%
        </span>
        <span className="text-[0.52rem]" style={{ color: 'var(--t3)' }}>
          Day {patient?.current_day ?? '—'}
        </span>
      </div>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate     = useNavigate();
  const doctor       = useStore((s) => s.doctor);
  const clinics      = useStore((s) => s.clinics);
  const dashboard    = useStore((s) => s.dashboard);
  const setDashboard = useStore((s) => s.setDashboard);
  const addAlert     = useStore((s) => s.addAlert);
  const showToast    = useStore((s) => s.showToast);

  const primary  = clinics.find((c) => c.is_primary) ?? clinics[0];
  const orgSlug  = primary?.org_slug        ?? 'care_demo';
  const doctorId = doctor?.id               ?? primary?.doctor_row_id ?? 'dr-martinez-001';

  const loadDashboard = useCallback(async () => {
    try {
      const data = await getDoctorDashboardById(doctorId, orgSlug);
      setDashboard(data);
    } catch (err) {
      showToast('Failed to load dashboard', 'error');
      console.error(err);
    }
  }, [doctorId, orgSlug, setDashboard, showToast]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    const unsub = subscribeToAlerts([orgSlug], (raw) => {
      addAlert(raw as unknown as Alert);
      showToast('New alert received', 'info');
    });
    return unsub;
  }, [orgSlug, addAlert, showToast]);

  const patients = dashboard?.patients ?? [];
  const alerts   = dashboard?.alerts   ?? [];
  const stats    = dashboard?.stats as DashboardStats | undefined;

  function goToPatient(patientId: string) {
    navigate(`/patient/${patientId}/${orgSlug}`);
  }

  const statItems = [
    { label: 'Registered',       value: stats?.total_patients ?? 0,
      sub: `↑ all patients`,        accent: STAT_ACCENTS[0], icon: '🫀' },
    { label: 'Active',            value: (stats?.green_count ?? 0) + (stats?.yellow_count ?? 0),
      sub: 'on-track',               accent: STAT_ACCENTS[1], icon: '✅' },
    { label: 'Alerts',            value: stats?.alerts_open ?? 0,
      sub: 'require review',         accent: STAT_ACCENTS[2], icon: '🔔' },
    { label: 'Resolved',          value: Math.max(0, (stats?.total_patients ?? 0) - (stats?.alerts_open ?? 0)),
      sub: '↑ this week',            accent: STAT_ACCENTS[3], icon: '✓'  },
    { label: 'Avg Adherence',     value: `${Math.round(stats?.avg_adherence ?? 0)}%`,
      sub: 'vs last week',           accent: STAT_ACCENTS[4], icon: '📈' },
    { label: 'Progressing Well',  value: stats?.green_count ?? 0,
      sub: '>80% adherence',         accent: STAT_ACCENTS[5], icon: '🎯' },
  ];

  // Patients without active alerts (to fill extra grid slots)
  const quietPatients = patients.filter(
    (pt) => !alerts.find((a) => a.patient_id === pt.id),
  ).slice(0, Math.max(0, 6 - alerts.length));

  return (
    <div className="flex flex-col" style={{ height: '100%', background: 'var(--bg)' }}>
      <TopBar />

      <div className="flex-1 overflow-y-auto no-scroll">

        {/* ── 3×2 Stat matrix ── */}
        <div className="grid grid-cols-3 gap-1.5 px-2.5 py-2">
          {statItems.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>

        {/* ── Patient quick-select chips ── */}
        <div
          className="px-2.5 pt-2 pb-2.5"
          style={{ borderTop: '1px solid var(--b)', borderBottom: '1px solid var(--b)' }}
        >
          <div className="text-[0.5rem] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--t3)' }}>
            Select Patient
          </div>
          <div className="flex gap-2 overflow-x-auto no-scroll pb-0.5">
            {/* Search */}
            <div
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 flex-shrink-0"
              style={{ background: 'var(--bg3)', border: '1px solid var(--b)', minWidth: 90 }}
            >
              <span style={{ color: 'var(--t3)', fontSize: '0.75rem' }}>🔍</span>
              <input
                placeholder="Search…"
                className="bg-transparent border-none outline-none text-[0.62rem]"
                style={{ color: 'var(--t)', fontFamily: 'inherit', width: 60 }}
              />
            </div>
            {/* Patient chips */}
            {patients.slice(0, 8).map((pt) => (
              <button
                key={pt.id}
                onClick={() => goToPatient(pt.id)}
                className="flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 flex-shrink-0
                           active:scale-[0.95] transition-transform"
                style={{ background: 'var(--bg3)', border: '1px solid var(--b)', cursor: 'pointer', minWidth: 52 }}
              >
                <div
                  className="w-[26px] h-[26px] rounded-full flex items-center justify-center
                             text-[0.56rem] font-bold text-white"
                  style={{ background: avatarGrad(pt.status) }}
                >
                  {initials(pt.name)}
                </div>
                <span className="text-[0.48rem] font-bold max-w-[50px] truncate" style={{ color: 'var(--t)' }}>
                  {pt.name.split(' ')[0]}
                </span>
                <span className="text-[0.44rem] font-bold" style={{ color: ADH_COLOR(pt.adherence_percent) }}>
                  {pt.adherence_percent}%
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Alerts label ── */}
        <div className="px-2.5 pt-2 pb-1 flex items-center justify-between">
          <span className="text-[0.54rem] font-bold uppercase tracking-wider" style={{ color: 'var(--t3)' }}>
            🔔 Alerts
          </span>
          {alerts.length > 0 && (
            <span
              className="text-[0.52rem] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(230,57,70,0.18)', color: '#f87171', border: '1px solid rgba(230,57,70,0.3)' }}
            >
              {alerts.filter((a) => a.severity === 'red').length} active
            </span>
          )}
        </div>

        {/* ── 2-column grid: alerts + quiet patients ── */}
        <div className="grid grid-cols-2 gap-2 px-2.5 pb-4">
          {alerts.length === 0 && quietPatients.length === 0 && (
            <div
              className="col-span-2 text-center py-8 text-[0.64rem] rounded-xl"
              style={{ background: 'var(--bg3)', border: '1px solid var(--b)', color: 'var(--t3)' }}
            >
              🎉 No active alerts
            </div>
          )}

          {/* Alert cards */}
          {alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              patient={patients.find((p) => p.id === alert.patient_id)}
              onClick={() => goToPatient(alert.patient_id)}
            />
          ))}

          {/* Quiet patient cards */}
          {quietPatients.map((pt) => (
            <button
              key={pt.id}
              onClick={() => goToPatient(pt.id)}
              className="rounded-xl p-2.5 text-left transition-transform active:scale-[0.97]"
              style={{
                background: 'var(--bg3)',
                border:     '1px solid var(--b)',
                borderTop:  '3px solid var(--teal)',
                cursor:     'pointer',
              }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <div
                  className="w-[26px] h-[26px] rounded-full flex-shrink-0 flex items-center justify-center text-[0.52rem] font-bold text-white"
                  style={{ background: avatarGrad(pt.status) }}
                >
                  {initials(pt.name)}
                </div>
                <div className="min-w-0">
                  <div className="text-[0.7rem] font-bold truncate" style={{ color: 'var(--t)' }}>{pt.name}</div>
                  <div className="text-[0.54rem] font-semibold truncate" style={{ color: 'var(--teal)' }}>{pt.treatment_name}</div>
                </div>
              </div>
              <div className="text-[0.56rem] leading-[1.4] mb-1.5" style={{ color: 'var(--t2)' }}>
                Healing on track. Continue current protocol.
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[0.66rem] font-extrabold" style={{ color: ADH_COLOR(pt.adherence_percent) }}>
                  {pt.adherence_percent}%
                </span>
                <span className="text-[0.52rem]" style={{ color: 'var(--t3)' }}>Day {pt.current_day} ✓</span>
              </div>
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
