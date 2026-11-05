/**
 * API layer — wraps Supabase RPC calls.
 * All clinical data queries go through Postgres functions
 * that are schema-aware (org_slug → org_{slug} schema).
 */

import { supabase, ORG_SLUG } from './supabase';
import type { PatientRow, CheckinRow, MessageRow, AIAnalysis } from './database.types';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// ─── Patient ───────────────────────────────────────────────────────────────────

export async function getPatientProfile(email: string): Promise<PatientRow | null> {
  const { data, error } = await supabase.rpc('get_patient_by_email', {
    p_email: email,
    p_org_slug: ORG_SLUG,
  });
  if (error) throw error;
  return data ?? null;
}

// ─── Check-ins ────────────────────────────────────────────────────────────────

export async function getCheckins(patientId: string): Promise<CheckinRow[]> {
  const { data, error } = await supabase.rpc('get_patient_checkins', {
    p_patient_id: patientId,
    p_org_slug: ORG_SLUG,
  });
  if (error) throw error;
  return (data as CheckinRow[]) ?? [];
}

export async function getMessages(patientId: string): Promise<MessageRow[]> {
  const { data, error } = await supabase.rpc('get_patient_messages', {
    p_patient_id: patientId,
    p_org_slug: ORG_SLUG,
  });
  if (error) throw error;
  return (data as MessageRow[]) ?? [];
}

// ─── AI Analysis (Edge Function) ──────────────────────────────────────────────

export interface CheckinSubmission {
  patientId: string;
  orgSlug: string;
  dayNumber: number;
  imageBase64: string;
  imageMimeType: string;
  symptomsText: string;
  adherenceToday: boolean;
  qualityScore: number;
  appMode?: 'demo' | 'pilot';
  checkinType?: 'face' | 'hair';
  checkinId?: string;
}

export interface CheckinResult {
  checkInId: string;
  analysis: AIAnalysis;
  storedPhotoUrl?: string;
}

export async function createCheckinDraft(
  patientId: string,
  orgSlug: string,
  dayNumber: number,
  transcript: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_checkin_draft', {
    p_org_slug: orgSlug,
    p_patient_id: patientId,
    p_day_number: dayNumber,
    p_transcript: transcript,
  });
  if (error) throw new Error(error.message || 'Failed to create checkin draft');
  return data as string;
}

export async function startCallSession(
  orgSlug: string,
  patientId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('start_call_session', {
    p_org_slug: orgSlug,
    p_patient_id: patientId,
  });
  if (error) throw new Error(error.message || 'Failed to start call session');
  return data as string;
}

export async function saveVoiceCall(
  orgSlug: string,
  sessionId: string,
  transcriptText: string,
  fullTranscript: { role: string; content: string }[],
): Promise<string> {
  const { data, error } = await supabase.rpc('save_voice_call', {
    p_org_slug: orgSlug,
    p_session_id: sessionId,
    p_transcript_text: transcriptText,
    p_full_transcript: fullTranscript,
  });
  if (error) throw new Error(error.message || 'Failed to save voice call');
  return data as string;
}

export async function updateCheckinPhoto(
  checkinId: string,
  orgSlug: string,
  photoUrl: string,
): Promise<void> {
  const { error } = await supabase.rpc('update_checkin_photo', {
    p_org_slug: orgSlug,
    p_checkin_id: checkinId,
    p_photo_url: photoUrl,
  });
  if (error) throw new Error(error.message || 'Failed to update checkin photo');
}

export async function submitCheckin(payload: CheckinSubmission): Promise<CheckinResult> {
  const { data, error } = await supabase.functions.invoke('analyze-checkin', {
    body: payload,
  });
  if (error) throw new Error(error.message || 'Analysis failed');
  if (data.error) throw new Error(data.error);
  return data as CheckinResult;
}

// ─── Photo pre-validation (Haiku gate) ───────────────────────────────────────

export interface PhotoValidationResult {
  valid: boolean;
  reason: string;
  message: string;
  confidence: number;
}

/**
 * Calls the validate-photo edge function to confirm the photo shows the right
 * subject before running the full AI analysis.
 * Always resolves — returns valid=true on any network/parse failure so users
 * are never hard-blocked by infrastructure issues.
 *
 * Uses a direct fetch with AbortSignal.timeout instead of supabase.functions.invoke
 * + setTimeout, because mobile browsers throttle setTimeout in background tabs,
 * which could leave the spinner running forever.
 */
const VALIDATION_SKIPPED: PhotoValidationResult = { valid: true, reason: 'validation_skipped', message: '', confidence: 0.5 };

export async function validatePhoto(
  imageBase64: string,
  imageMimeType: string,
  shotType: 'crown' | 'scalp' | 'hairline' | 'face',
  appMode?: 'demo' | 'pilot',
  patientCondition?: string,
): Promise<PhotoValidationResult> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

    // validate-photo has verify_jwt=false, so the anon key is sufficient.
    // Avoid getSession() here — it can trigger a silent token refresh (network call)
    // that has no timeout, leaving isReviewValidating stuck true indefinitely.
    const resp = await fetch(`${supabaseUrl}/functions/v1/validate-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify({ imageBase64, imageMimeType, shotType, appMode, patientCondition }),
      signal: AbortSignal.timeout(12000),
    });

    if (!resp.ok) return VALIDATION_SKIPPED;
    const data = await resp.json();
    return data as PhotoValidationResult;
  } catch {
    return VALIDATION_SKIPPED;
  }
}
