'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import BottomNav from './BottomNav';

type PatientStatus = 'green' | 'yellow' | 'red' | 'critical' | 'warning' | 'good' | 'resolved';
interface Patient {
  id: string; name: string; age: number; gender: string;
  treatment_name: string; condition: string;
  current_day: number; day?: number;
  status: PatientStatus;
  adherence_percent: number; adherence?: number;
}
interface Alert {
  id: string; patient_id: string; severity: string; title: string;
  ai_analysis: string; created_at: string; resolved: boolean;
}
interface Stats {
  total: number; red: number; yellow: number; green: number;
  avg_adherence: number; alerts_open: number;
}
interface DashboardData {
  patients: Patient[];
  unresolved_alerts: Alert[];
  stats: Stats;
}

const AV_COLORS = ['#E63946','#2BBFBF','#F59E0B','#10B981','#8B5CF6','#3B82F6','#EC4899'];

function avatarColor(name: string) { return AV_COLORS[(name.charCodeAt(0) + name.length) % AV_COLORS.length]; }
function initials(name: string)    { return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(); }

interface Doctor { id: string; name: string; specialty: string; initials: string; }

export default function DashboardClient({ data, doctor }: { data: DashboardData; doctor?: Doctor; orgSlug?: string }) {
  const { patients = [], unresolved_alerts = [], stats } = data;
  const [search, setSearch] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  const openAlerts = (unresolved_alerts ?? []).filter(a => !a.resolved);

  const statusRank: Record<PatientStatus, number> = { critical: 0, red: 0, warning: 1, yellow: 1, good: 2, green: 2, resolved: 3 };
  const sorted = [...patients].sort((a, b) => (statusRank[a.status] ?? 2) - (statusRank[b.status] ?? 2));

  const filtered = search
    ? sorted.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : sorted;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{ height: 48, background: 'var(--bg2)', borderBottom: '1px solid var(--b)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: 'linear-gradient(135deg,var(--teal),#1A8A8A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>🏥</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--t)' }}>CARE.AI</div>
            <div style={{ fontSize: 7, fontWeight: 500, letterSpacing: '0.05em', color: 'var(--teal)', marginTop: 1 }}>AI Care Companion</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Link href="/dashboard/patients/new" style={{ textDecoration: 'none' }}>
            <button style={{ background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
              + Add Patient
            </button>
          </Link>
          <button onClick={handleSignOut} disabled={signingOut} title="Log out" style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg3)', border: '1px solid var(--b)', borderRadius: 99, padding: '3px 9px 3px 3px', cursor: 'pointer', fontFamily: 'Inter,sans-serif', opacity: signingOut ? 0.6 : 1 }}>
            <div style={{ width: 21, height: 21, borderRadius: '50%', background: 'linear-gradient(135deg,var(--teal),#1A8A8A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7.5, fontWeight: 700, color: '#fff' }}>{signingOut ? '…' : (doctor?.initials ?? 'Dr')}</div>
            <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--t)' }}>{signingOut ? 'Logging out…' : (doctor?.name ?? 'Doctor')}</span>
            {!signingOut && <span style={{ fontSize: 8, color: 'var(--t3)', marginLeft: 1 }}>↩</span>}
          </button>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>

        {/* Stats 3×2 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, padding: '8px 10px' }}>
          <StatTile label="Registered"    value={String(stats?.total ?? 0)}               icon="👥" color="var(--teal)" top="var(--teal)" />
          <StatTile label="Active"        value={String(stats?.green ?? 0)}               icon="✅" color="var(--green)" top="var(--green)" />
          <StatTile label="Alerts"        value={String(stats?.red ?? 0)}                 icon="🔔" color="#f87171" top="var(--red)" />
          <StatTile label="Avg Adherence" value={`${Math.round(stats?.avg_adherence ?? 0)}%`} icon="📈" color="#a78bfa" top="var(--pur)" />
          <StatTile label="On Track"      value={String(stats?.green ?? 0)}               icon="🎯" color="#93c5fd" top="var(--blue)" />
          <StatTile label="Watch"         value={String(stats?.yellow ?? 0)}              icon="⚠️" color="#fbbf24" top="var(--gold)" />
        </div>

        {/* Patient quick-select */}
        <div style={{ padding: '7px 11px 8px', borderBottom: '1px solid var(--b)' }}>
          <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 5 }}>Select Patient</div>
          <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 2, msOverflowStyle: 'none', scrollbarWidth: 'none' } as React.CSSProperties}>
            {/* Search box */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg3)', border: '1px solid var(--b)', borderRadius: 8, padding: '5px 8px', flexShrink: 0, minWidth: 110 }}>
              <span style={{ fontSize: 11 }}>🔍</span>
              <input
                style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--t)', fontSize: 10, outline: 'none', fontFamily: 'Inter,sans-serif', width: 70 }}
                placeholder="Search patient…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {/* Patient chips */}
            {filtered.map(p => (
              <Link key={p.id} href={`/dashboard/patients/${p.id}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  background: 'var(--bg3)', border: `1px solid ${['red','critical'].includes(p.status) ? 'rgba(230,57,70,.4)' : ['yellow','warning'].includes(p.status) ? 'rgba(245,158,11,.4)' : 'var(--b)'}`,
                  borderRadius: 8, padding: '6px 8px', cursor: 'pointer', minWidth: 56, transition: '0.12s',
                }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg,${avatarColor(p.name)},${avatarColor(p.name)}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', marginBottom: 2 }}>
                    {initials(p.name)}
                  </div>
                  <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--t)', whiteSpace: 'nowrap', maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.name.split(' ')[0]}
                  </div>
                  <div style={{ fontSize: 7.5, fontWeight: 700, color: (p.adherence ?? p.adherence_percent) >= 80 ? '#34d399' : (p.adherence ?? p.adherence_percent) >= 60 ? '#fbbf24' : '#f87171' }}>
                    {Math.round(p.adherence ?? p.adherence_percent)}%
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Alerts header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 11px 5px' }}>
          <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>🔔 Alerts</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {openAlerts.length > 0 && (
              <span style={{ fontSize: 8.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(230,57,70,.18)', color: '#f87171', border: '1px solid rgba(230,57,70,.3)' }}>
                {openAlerts.length} active
              </span>
            )}
            <Link href="/dashboard/alerts" style={{ textDecoration: 'none', fontSize: 9, color: 'var(--teal)', fontWeight: 600 }}>View all →</Link>
          </div>
        </div>

        {/* Alert cards 2-col grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, padding: '0 10px 10px' }}>
          {openAlerts.length === 0 ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--t3)', padding: '24px 0', fontSize: 11 }}>
              No active alerts 🎉
            </div>
          ) : (
            openAlerts.map(alert => {
              const pt = patients.find(p => p.id === alert.patient_id);
              const av = avatarColor(pt?.name ?? '?');
              return (
                <Link key={alert.id} href={`/dashboard/patients/${alert.patient_id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ background: 'var(--bg3)', border: '1px solid var(--b)', borderTop: '3px solid var(--red)', borderRadius: 10, padding: '11px 10px', cursor: 'pointer', height: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg,${av},${av}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8.5, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {pt ? initials(pt.name) : '?'}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--t)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pt?.name ?? 'Unknown'}</div>
                        <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--teal)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{alert.title}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 9.5, color: 'var(--t2)', lineHeight: 1.45, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>
                      {alert.ai_analysis}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: 'rgba(230,57,70,.18)', color: '#f87171', border: '1px solid rgba(230,57,70,.3)' }}>
                        {(alert.severity ?? 'high').toUpperCase()}
                      </span>
                      <span style={{ fontSize: 8, color: 'var(--t3)' }}>Day {pt?.current_day ?? pt?.day ?? '?'}</span>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* Spacer for bottom nav */}
        <div style={{ height: 8 }} />
      </div>

      <BottomNav alertCount={openAlerts.length} />
    </div>
  );
}

function StatTile({ label, value, icon, color, top }: { label: string; value: string; icon: string; color: string; top: string }) {
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--b)', borderRadius: 9, padding: '10px 10px', position: 'relative', overflow: 'hidden', borderTop: `2px solid ${top}` }}>
      <div style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#7BA3C4', marginBottom: 3, lineHeight: 1.2 }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ position: 'absolute', right: 7, top: 7, fontSize: 13, opacity: 0.15 }}>{icon}</div>
    </div>
  );
}
