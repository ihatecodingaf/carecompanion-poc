import { query, SCHEMA } from '../../../lib/db';
import { getLoggedInDoctor } from '../../../lib/auth';
import BottomNav from '../../../components/BottomNav';
import Link from 'next/link';
import { redirect } from 'next/navigation';

interface Alert {
  id: string; patient_id: string; severity: string; title: string;
  ai_analysis: string; suggested_actions: string; created_at: string;
  resolved: boolean; patient_name?: string;
}

async function getAlerts(doctorId: string): Promise<Alert[]> {
  return query<Alert>(`
    SELECT a.id, a.patient_id, a.severity, a.title, a.ai_analysis,
           a.suggested_actions, a.created_at, a.resolved, p.name AS patient_name
    FROM ${SCHEMA}.alerts a
    JOIN ${SCHEMA}.patients p ON p.id = a.patient_id
    WHERE NOT a.resolved AND p.doctor_id = $1
    ORDER BY a.created_at DESC
  `, [doctorId]);
}

export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  const doctor = await getLoggedInDoctor();
  if (!doctor) redirect('/login');

  const open = await getAlerts(doctor.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{ height: 44, background: 'var(--bg2)', borderBottom: '1px solid var(--b)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', flexShrink: 0 }}>
        <Link href="/dashboard" style={{ textDecoration: 'none', color: 'var(--teal)', fontSize: 11, fontWeight: 600 }}>← Dashboard</Link>
        <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--t)' }}>🔔 Alerts</span>
        <span style={{ fontSize: 10, color: 'var(--t3)' }}>{open.length} active</span>
      </div>

      <main style={{ flex: 1, overflow: 'auto', padding: '14px 12px 80px' }}>
        {open.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--t3)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>All clear — no unresolved alerts</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {open.map((a: Alert) => (
            <div key={a.id} style={{ background: 'var(--bg3)', border: `1px solid var(--b)`, borderLeft: `3px solid ${a.severity === 'red' ? 'var(--red)' : 'var(--gold)'}`, borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: a.severity === 'red' ? 'rgba(230,57,70,.15)' : 'rgba(245,158,11,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>
                  {a.severity === 'red' ? '🔴' : '🟡'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t)' }}>{a.title}</div>
                    {a.patient_name && (
                      <span style={{ fontSize: 9, color: 'var(--teal)', background: 'rgba(43,191,191,.1)', borderRadius: 99, padding: '1px 6px', fontWeight: 600 }}>{a.patient_name}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.55, marginBottom: 7 }}>{a.ai_analysis}</div>
                  {a.suggested_actions && (
                    <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 9 }}>
                      <span style={{ color: 'var(--teal)', fontWeight: 700 }}>Suggested: </span>{a.suggested_actions}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Link href={`/dashboard/patients/${a.patient_id}`}>
                      <button style={{ background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 11px', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                        Review Patient →
                      </button>
                    </Link>
                    <span style={{ fontSize: 9, color: 'var(--t3)' }}>{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      <BottomNav alertCount={open.length} />
    </div>
  );
}
