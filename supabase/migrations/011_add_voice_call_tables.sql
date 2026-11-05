-- 011_add_voice_call_tables.sql
-- Migrates the Deepgram voice-call tables (call_sessions, call_captures, faq_usage)
-- from the public prototype schema into org_care_demo.
-- Also links checkins to their originating call session.

-- ── 1. Core tables ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_care_demo.call_sessions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       TEXT        NOT NULL REFERENCES org_care_demo.patients(id) ON DELETE CASCADE,
  checkin_day      INTEGER     NOT NULL,
  condition        TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ,
  duration_seconds INTEGER,
  status           TEXT        NOT NULL DEFAULT 'in_progress'
);

CREATE TABLE IF NOT EXISTS org_care_demo.call_captures (
  id                           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id              UUID        NOT NULL REFERENCES org_care_demo.call_sessions(id) ON DELETE CASCADE,
  patient_id                   TEXT        NOT NULL REFERENCES org_care_demo.patients(id),
  checkin_day                  INTEGER,
  condition                    TEXT,
  pain_score                   INTEGER,
  overall_feeling              TEXT,
  medications_taken            BOOLEAN,
  symptoms_reported            TEXT[]      DEFAULT '{}',
  patient_questions            TEXT[]      DEFAULT '{}',
  faq_questions_answered       TEXT[]      DEFAULT '{}',
  unanswered_patient_questions TEXT[]      DEFAULT '{}',
  notes_for_doctor             TEXT,
  full_transcript              JSONB,
  full_transcript_text         TEXT,
  per_turn_captures            JSONB,
  post_processing_payload      JSONB,
  sent_to_post_processing      BOOLEAN     DEFAULT false,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_care_demo.faq_usage (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id  UUID        NOT NULL REFERENCES org_care_demo.call_sessions(id) ON DELETE CASCADE,
  patient_id       TEXT        NOT NULL REFERENCES org_care_demo.patients(id),
  condition        TEXT,
  faq_id           TEXT,
  patient_question TEXT,
  answered_from_faq BOOLEAN    DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Link checkins → call session ──────────────────────────────────────────

ALTER TABLE org_care_demo.checkins
  ADD COLUMN IF NOT EXISTS call_session_id UUID
    REFERENCES org_care_demo.call_sessions(id) ON DELETE SET NULL;

-- ── 3. RPC: start_call_session ────────────────────────────────────────────────
-- Called when the WebSocket connects. Returns the new session UUID.

CREATE OR REPLACE FUNCTION start_call_session(
  p_org_slug   TEXT,
  p_patient_id TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema TEXT := 'org_' || p_org_slug;
  v_day    INTEGER;
  v_cond   TEXT;
  v_sid    UUID;
BEGIN
  EXECUTE format(
    'SELECT current_day, condition FROM %I.patients WHERE id = $1',
    v_schema
  ) INTO v_day, v_cond USING p_patient_id;

  EXECUTE format(
    'INSERT INTO %I.call_sessions (patient_id, checkin_day, condition, status)
     VALUES ($1, $2, $3, ''in_progress'') RETURNING id',
    v_schema
  ) INTO v_sid USING p_patient_id, v_day, v_cond;

  RETURN v_sid;
END;
$$;

-- ── 4. RPC: save_voice_call ───────────────────────────────────────────────────
-- Called at the end of the call. Closes the session, saves the capture,
-- and creates a checkin draft (pending_photo). Returns the checkin UUID.

CREATE OR REPLACE FUNCTION save_voice_call(
  p_org_slug        TEXT,
  p_session_id      UUID,
  p_transcript_text TEXT,
  p_full_transcript JSONB DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema     TEXT := 'org_' || p_org_slug;
  v_pid        TEXT;
  v_day        INTEGER;
  v_cond       TEXT;
  v_started_at TIMESTAMPTZ;
  v_duration   INTEGER;
  v_checkin_id TEXT;
BEGIN
  EXECUTE format(
    'SELECT patient_id, checkin_day, condition, started_at FROM %I.call_sessions WHERE id = $1',
    v_schema
  ) INTO v_pid, v_day, v_cond, v_started_at USING p_session_id;

  v_duration := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_started_at))::INTEGER);

  -- Close the session
  EXECUTE format(
    'UPDATE %I.call_sessions
     SET ended_at = now(), duration_seconds = $1, status = ''completed''
     WHERE id = $2',
    v_schema
  ) USING v_duration, p_session_id;

  -- Save structured capture
  EXECUTE format(
    'INSERT INTO %I.call_captures
       (call_session_id, patient_id, checkin_day, condition, full_transcript_text, full_transcript)
     VALUES ($1, $2, $3, $4, $5, $6)',
    v_schema
  ) USING p_session_id, v_pid, v_day, v_cond, p_transcript_text, p_full_transcript;

  -- Create checkin draft linked to this session
  EXECUTE format(
    'INSERT INTO %I.checkins
       (patient_id, day_number, checkin_date, status, adherence_today,
        transcript, checkin_status, call_session_id)
     VALUES ($1, $2, CURRENT_DATE, ''green'', true, $3, ''pending_photo'', $4)
     RETURNING id',
    v_schema
  ) INTO v_checkin_id USING v_pid, v_day, p_transcript_text, p_session_id;

  RETURN v_checkin_id;
END;
$$;

-- ── 5. Grants ─────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION start_call_session(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION save_voice_call(TEXT, UUID, TEXT, JSONB) TO anon, authenticated;
