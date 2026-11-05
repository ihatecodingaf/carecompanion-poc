import { query, queryOne, SCHEMA } from '../../../../lib/db';
import PatientDetailClient from '../../../../components/PatientDetailClient';
import { ORG_SLUG } from '../../../../lib/supabase';

interface Checkin {
  id: string; day_number: number; checkin_date: string; status: string;
  photo_url?: string; ai_headline?: string; ai_summary?: string;
  ai_zone_analysis?: string; ai_suggested_actions?: string;
  doctor_response?: string; quality_score?: number;
  symptoms_reported?: string; adherence_today?: boolean; transcript?: string;
}
interface PatientAlert {
  id: string; severity: string; title: string; ai_analysis: string;
  suggested_actions: string; photo_url?: string; created_at: string;
  resolved: boolean; doctor_action?: string;
}
interface Message {
  id: number; sender: string; content: string;
  message_type: string; timestamp: string; photo_url?: string;
}

async function getPatientData(id: string) {
  const [patient, doctor, checkins, alerts, messages] = await Promise.all([
    queryOne(`
      SELECT p.*, d.name AS doctor_name, d.specialty AS doctor_specialty
      FROM ${SCHEMA}.patients p
      LEFT JOIN ${SCHEMA}.doctors d ON d.id = p.doctor_id
      WHERE p.id = $1
    `, [id]),
    queryOne(`
      SELECT d.* FROM ${SCHEMA}.doctors d
      JOIN ${SCHEMA}.patients p ON p.doctor_id = d.id
      WHERE p.id = $1
    `, [id]),
    query<Checkin>(`
      SELECT id, day_number, checkin_date, status, photo_url, ai_headline,
             ai_summary, ai_zone_analysis, ai_suggested_actions, doctor_response,
             quality_score, symptoms_reported, adherence_today, transcript
      FROM ${SCHEMA}.checkins
      WHERE patient_id = $1
      ORDER BY day_number DESC
    `, [id]),
    query<PatientAlert>(`
      SELECT id, severity, title, ai_analysis, suggested_actions,
             photo_url, created_at, resolved, doctor_action
      FROM ${SCHEMA}.alerts
      WHERE patient_id = $1
      ORDER BY created_at DESC
    `, [id]),
    query<Message>(`
      SELECT id, sender, content, message_type, timestamp, photo_url
      FROM ${SCHEMA}.messages
      WHERE patient_id = $1
      ORDER BY timestamp ASC
    `, [id]),
  ]);

  if (!patient) return null;
  return {
    patient: patient as Record<string, unknown>,
    doctor: (doctor ?? {}) as Record<string, unknown>,
    checkins,
    alerts,
    messages,
  };
}

export default async function PatientPage({ params }: { params: { id: string } }) {
  const data = await getPatientData(params.id);
  if (!data) return <div style={{ padding: 40, color: 'var(--t3)' }}>Patient not found.</div>;
  return <PatientDetailClient data={data} orgSlug={ORG_SLUG} />;
}
