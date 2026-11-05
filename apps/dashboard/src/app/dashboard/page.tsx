import { query, SCHEMA } from '../../lib/db';
import { getLoggedInDoctor } from '../../lib/auth';
import DashboardClient from '../../components/DashboardClient';
import { redirect } from 'next/navigation';

type PatientStatus = 'green' | 'yellow' | 'red' | 'critical' | 'warning' | 'good' | 'resolved';
interface Patient {
  id: string; name: string; age: number; gender: string;
  treatment_name: string; condition: string;
  current_day: number; day?: number; status: PatientStatus;
  adherence_percent: number; adherence?: number;
}
interface Alert {
  id: string; patient_id: string; severity: string; title: string;
  ai_analysis: string; created_at: string; resolved: boolean; patient_name?: string;
}
interface Stats {
  total: string; red: string; yellow: string; green: string;
  avg_adherence: string; alerts_open: string;
}

async function getDashboardData(doctorId: string) {
  const [patients, alerts, statsRows] = await Promise.all([
    query<Patient>(`
      SELECT id, name, age, gender, treatment_name, condition,
             current_day, day, status, adherence_percent, adherence
      FROM ${SCHEMA}.patients
      WHERE doctor_id = $1 AND auth_user_id IS NOT NULL
      ORDER BY
        CASE status
          WHEN 'critical' THEN 0  WHEN 'red' THEN 0
          WHEN 'warning'  THEN 1  WHEN 'yellow' THEN 1
          ELSE 2
        END, name
    `, [doctorId]),
    query<Alert>(`
      SELECT a.id, a.patient_id, a.severity, a.title, a.ai_analysis,
             a.created_at, a.resolved, p.name AS patient_name
      FROM ${SCHEMA}.alerts a
      JOIN ${SCHEMA}.patients p ON p.id = a.patient_id
      WHERE NOT a.resolved AND p.doctor_id = $1 AND p.auth_user_id IS NOT NULL
      ORDER BY a.created_at DESC
      LIMIT 20
    `, [doctorId]),
    query<Stats>(`
      SELECT
        COUNT(*)                                                              AS total,
        COUNT(*) FILTER (WHERE status IN ('red','critical'))                 AS red,
        COUNT(*) FILTER (WHERE status IN ('yellow','warning'))               AS yellow,
        COUNT(*) FILTER (WHERE status IN ('green','good','resolved'))        AS green,
        ROUND(AVG(COALESCE(adherence, adherence_percent))::numeric, 1)       AS avg_adherence,
        (SELECT COUNT(*) FROM ${SCHEMA}.alerts a2
         JOIN ${SCHEMA}.patients p2 ON p2.id = a2.patient_id
         WHERE NOT a2.resolved AND p2.doctor_id = $1 AND p2.auth_user_id IS NOT NULL) AS alerts_open
      FROM ${SCHEMA}.patients
      WHERE doctor_id = $1 AND auth_user_id IS NOT NULL
    `, [doctorId]),
  ]);

  const s = statsRows[0];
  return {
    patients,
    unresolved_alerts: alerts,
    stats: {
      total:         Number(s?.total ?? 0),
      red:           Number(s?.red ?? 0),
      yellow:        Number(s?.yellow ?? 0),
      green:         Number(s?.green ?? 0),
      avg_adherence: Number(s?.avg_adherence ?? 0),
      alerts_open:   Number(s?.alerts_open ?? 0),
    },
  };
}

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const doctor = await getLoggedInDoctor();
  if (!doctor) redirect('/login');

  const data = await getDashboardData(doctor.id);
  return <DashboardClient data={data} doctor={doctor} />;
}
