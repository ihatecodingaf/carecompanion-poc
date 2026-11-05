/**
 * Request handlers that mirror the Postgres functions in supabase/migrations
 * and the edge functions in supabase/functions. Same inputs, same JSON shapes,
 * so the apps can't tell the difference.
 */
import { load, mutate, ORG_NAME, ORG_SLUG, type DemoDb } from './store';
import { makeMockAnalysis } from './mockAnalysis';

type Row = Record<string, any>;
type Args = Record<string, any>;

const now = () => new Date().toISOString();
const byDayDesc = (a: Row, b: Row) => b.day_number - a.day_number || String(b.checkin_date).localeCompare(String(a.checkin_date));
const byTimeAsc = (a: Row, b: Row) => String(a.timestamp).localeCompare(String(b.timestamp));
const byCreatedDesc = (a: Row, b: Row) => String(b.created_at).localeCompare(String(a.created_at));
const uuid = () => crypto.randomUUID();

const withOrg = (p: Row) => ({ ...p, org_slug: ORG_SLUG });
const patientId = (a: Args) => a.p_patient_id ?? a.patient_id;

// ─── RPCs (public.* functions) ───────────────────────────────────────────────

export const rpc: Record<string, (args: Args) => unknown> = {
  list_org_patients: () =>
    load().patients.map(({ id, name, email, condition, current_day, status }) => ({ id, name, email, condition, current_day, status })),

  get_org_dashboard: () => {
    const db = load();
    return { patients: db.patients.map((p) => ({ ...p, auth_user_id: p.auth_user_id ?? `demo-${p.id}` })), alerts: db.alerts };
  },

  get_patient_by_email: (a) => {
    const p = load().patients.find((x) => x.email?.toLowerCase() === String(a.p_email).toLowerCase());
    return p ? withOrg(p) : null;
  },

  get_patient_checkins: (a) =>
    load().checkins.filter((c) => c.patient_id === patientId(a) && c.checkin_status !== 'draft').sort(byDayDesc),

  get_patient_messages: (a) => load().messages.filter((m) => m.patient_id === patientId(a)).sort(byTimeAsc),

  create_checkin_draft: (a) =>
    mutate((db) => {
      const id = `ci-${String(a.p_patient_id).slice(-6)}-d${a.p_day_number}-${Date.now()}`;
      db.checkins.push(emptyCheckin(id, a.p_patient_id, a.p_day_number, { transcript: a.p_transcript, checkin_status: 'draft' }));
      return id;
    }),

  update_checkin_photo: (a) =>
    mutate((db) => {
      const c = db.checkins.find((x) => x.id === a.p_checkin_id);
      if (c) c.photo_url = a.p_photo_url;
      return null;
    }),

  start_call_session: (a) =>
    mutate((db) => {
      const id = uuid();
      db.call_sessions.push({ id, patient_id: a.p_patient_id, started_at: now(), transcript_text: null });
      return id;
    }),

  save_voice_call: (a) =>
    mutate((db) => {
      const s = db.call_sessions.find((x) => x.id === a.p_session_id);
      if (s) Object.assign(s, { transcript_text: a.p_transcript_text, full_transcript: a.p_full_transcript ?? null, ended_at: now() });
      return a.p_session_id;
    }),

  get_doctor_dashboard_bypass: (a) => doctorDashboard(load(), a.p_doctor_id),

  get_doctor_profile: (a) => load().doctors.find((d) => d.auth_user_id === a.p_auth_user_id) ?? null,

  get_doctor_clinics: (a) => {
    const d = load().doctors.find((x) => x.auth_user_id === a.p_auth_user_id);
    return d ? [{ org_slug: ORG_SLUG, doctor_row_id: d.id, is_primary: true, org_name: ORG_NAME, specialty: 'dermatology', city: d.clinic_location }] : [];
  },

  get_patient_detail: (a) => {
    const db = load();
    const p = db.patients.find((x) => x.id === patientId(a));
    if (!p) return null;
    return {
      patient: p,
      doctor: db.doctors.find((d) => d.id === p.doctor_id) ?? null,
      checkins: db.checkins.filter((c) => c.patient_id === p.id && c.checkin_status !== 'draft').sort(byDayDesc),
      alerts: db.alerts.filter((x) => x.patient_id === p.id).sort(byCreatedDesc),
      messages: db.messages.filter((m) => m.patient_id === p.id).sort(byTimeAsc),
    };
  },

  send_doctor_message: (a) =>
    mutate((db) => {
      addMessage(db, a.p_patient_id, 'doctor', a.p_content, 'text');
      return null;
    }),

  resolve_alert: (a) =>
    mutate((db) => {
      const al = db.alerts.find((x) => x.id === a.p_alert_id);
      if (al) Object.assign(al, { resolved: true, doctor_action: a.p_doctor_note });
      return null;
    }),

  add_doctor_response: (a) =>
    mutate((db) => {
      const c = db.checkins.find((x) => x.id === a.p_checkin_id);
      if (c) c.doctor_response = a.p_response;
      return null;
    }),

  register_patient: (a) =>
    mutate((db) => {
      const d: Args = a.p_data ?? {};
      const name = String(d.name ?? '').trim();
      if (!name) throw new Error('register_patient failed: Patient name is required');
      const id = `pt-${ORG_SLUG}-${Math.floor(Date.now() / 1000)}`;
      const condition = String(d.condition ?? '').trim() || 'acne';
      const treatment = String(d.treatment_name ?? '').trim() || 'As prescribed';
      db.patients.push({
        id, doctor_id: a.p_doctor_id, name,
        age: Number.parseInt(d.age, 10) || 0,
        gender: d.gender || 'Unknown',
        phone: d.phone || null,
        email: null, avatar_url: d.photo_url || null, auth_user_id: null,
        condition, treatment_name: treatment, treatment_description: d.diagnosis || null,
        treatment_start_date: now().slice(0, 10), current_day: 1, status: 'green', adherence_percent: 100,
        prescribed_products: d.medications || null, notes: null, created_at: now(),
        clinical_data: d,
      });
      addMessage(db, id, 'aisha',
        `Welcome to your recovery journey, ${name}! 🌟\n\n📋 Treatment: ${treatment}\n💊 Medications:\n${d.medications || 'See prescription'}\n\n` +
        `✅ What to do:\n${d.dos || 'Follow your care plan'}\n\n🚫 What to avoid:\n${d.donts || "Follow your doctor's advice"}\n\n` +
        'Your doctor is monitoring your progress. Complete your daily check-ins for personalised AI feedback.', 'text');
      return { patient_id: id, name, condition, treatment_name: treatment, follow_up_date: d.follow_up_date ?? '' };
    }),
};

// ─── Edge functions ──────────────────────────────────────────────────────────

export const functions: Record<string, (body: Args) => Promise<unknown> | unknown> = {
  'validate-photo': () => ({ valid: true, reason: 'demo', message: '', confidence: 0.95 }),

  'analyze-checkin': async (b) => {
    const { patientId: pid, dayNumber, symptomsText = '', adherenceToday = true, qualityScore = null, checkinType = 'face', checkinId } = b;
    const photo = b.imageBase64 ? await thumbnail(b.imageBase64, b.imageMimeType) : null;

    return mutate((db) => {
      const patient = db.patients.find((p) => p.id === pid);
      if (!patient) throw new Error('Patient not found');
      const analysis = makeMockAnalysis(patient.condition, checkinType, dayNumber, symptomsText, adherenceToday) as Row;
      const status = ({ 1: 'green', 2: 'yellow', 3: 'red' } as Record<number, string>)[analysis.alert_level] ?? 'green';
      const id = checkinId ?? `ci-${String(pid).slice(-6)}-d${dayNumber}-${Date.now()}`;

      let c = db.checkins.find((x) => x.id === id);
      if (!c) { c = emptyCheckin(id, pid, dayNumber); db.checkins.push(c); }
      Object.assign(c, {
        checkin_date: now(), status, symptoms_reported: symptomsText, adherence_today: adherenceToday,
        photo_url: photo ?? c.photo_url ?? null,
        photo_label: `Day ${dayNumber} ${checkinType === 'hair' ? 'Hair' : ''} Check-in`,
        ai_headline: analysis.headline, ai_summary: analysis.summary,
        ai_zone_analysis: JSON.stringify(checkinType === 'hair' ? analysis.hair_zone_analysis : analysis.zone_analysis),
        ai_suggested_actions: analysis.recommendation, quality_score: qualityScore, checkin_status: 'pending_review',
      });

      patient.current_day = dayNumber + 1;
      if (status !== 'green') patient.status = status;

      if (analysis.alert_level >= 2 && !db.alerts.some((x) => x.id === `alert-${id}`)) {
        db.alerts.push({
          id: `alert-${id}`, patient_id: pid, severity: status, title: `Day ${dayNumber}: ${analysis.headline}`,
          ai_analysis: analysis.summary, suggested_actions: analysis.doctor_note,
          patient_context: `Day ${dayNumber}. ${symptomsText}`, photo_url: c.photo_url, created_at: now(),
          resolved: false, doctor_action: null, instructions_given_to_patient: null,
        });
      }
      addMessage(db, pid, 'aisha', `✦ AI Analysis — Day ${dayNumber}\n\n${analysis.headline}\n\n${analysis.doctor_note}`, 'ai_analysis', c.photo_url);
      return { checkInId: id, analysis, storedPhotoUrl: c.photo_url ?? undefined };
    });
  },

  'upload-to-drive': async (b) => ({ url: await thumbnail(b.base64Data, 'image/jpeg') }),

  // The doctor app falls back to its built-in sample prescription when this fails.
  'extract-prescription': () => { throw Object.assign(new Error('OCR is not available in the demo'), { status: 501 }); },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function doctorDashboard(db: DemoDb, doctorId: string) {
  const rank: Record<string, number> = { red: 0, yellow: 1, green: 2 };
  const patients = db.patients
    .filter((p) => p.doctor_id === doctorId)
    .map(({ id, name, age, gender, condition, treatment_name, current_day, status, adherence_percent, avatar_url, phone }) =>
      ({ id, name, age, gender, condition, treatment_name, current_day, status, adherence_percent, avatar_url, phone, org_slug: ORG_SLUG, org_name: ORG_NAME }))
    .sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || a.name.localeCompare(b.name));
  const ids = new Set(patients.map((p) => p.id));
  const alerts = db.alerts
    .filter((a) => ids.has(a.patient_id) && !a.resolved)
    .sort(byCreatedDesc)
    .map(({ id, patient_id, severity, title, ai_analysis, created_at }) => ({ id, patient_id, severity, title, ai_analysis, created_at, org_slug: ORG_SLUG, org_name: ORG_NAME }));
  const count = (s: string) => patients.filter((p) => p.status === s).length;
  return {
    patients, alerts,
    stats: {
      total_patients: patients.length, alerts_open: alerts.length,
      red_count: count('red'), yellow_count: count('yellow'), green_count: count('green'),
      avg_adherence: patients.length ? Math.round(patients.reduce((s, p) => s + Number(p.adherence_percent || 0), 0) / patients.length) : 0,
    },
  };
}

function emptyCheckin(id: string, pid: string, day: number, extra: Row = {}): Row {
  return {
    id, patient_id: pid, day_number: day, checkin_date: now(), status: 'green', symptoms_reported: null,
    adherence_today: true, photo_url: null, photo_label: null, ai_headline: null, ai_summary: null,
    ai_zone_analysis: null, ai_suggested_actions: null, doctor_response: null, doctor_action_taken: null,
    notes: null, quality_score: null, created_at: now(), transcript: null, checkin_status: null, call_session_id: null,
    ...extra,
  };
}

function addMessage(db: DemoDb, pid: string, sender: string, content: string, type: string, photo: string | null = null) {
  db.messages.push({ id: db.nextMessageId++, patient_id: pid, sender, content, message_type: type, timestamp: now(), is_read: false, photo_url: photo, metadata: null });
}

/** Shrink a photo to a small JPEG data URL so a handful fit in localStorage. */
async function thumbnail(base64: string, mime = 'image/jpeg'): Promise<string | null> {
  try {
    const src = base64.startsWith('data:') ? base64 : `data:${mime};base64,${base64}`;
    const img = new Image();
    img.src = src;
    await img.decode();
    const scale = Math.min(1, 480 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;
  }
}
