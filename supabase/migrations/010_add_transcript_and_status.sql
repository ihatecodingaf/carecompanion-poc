-- ============================================================
-- Migration 010: Add transcript + checkin_status to checkins
-- Adds two new RPCs: create_checkin_draft, update_checkin_photo
-- Apply in Supabase SQL Editor
-- ============================================================

-- ── 1. New columns on checkins ────────────────────────────────
ALTER TABLE org_care_demo.checkins
  ADD COLUMN IF NOT EXISTS transcript    TEXT,
  ADD COLUMN IF NOT EXISTS checkin_status TEXT DEFAULT 'pending_review';

-- ── 2. Refresh get_patient_checkins (now returns new columns) ─
-- The existing SELECT json_agg(c …) already picks up all columns;
-- re-creating keeps the function signature in sync.
CREATE OR REPLACE FUNCTION public.get_patient_checkins(
  p_patient_id TEXT,
  p_org_slug   TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema TEXT := 'org_' || p_org_slug;
  v_result JSONB;
BEGIN
  EXECUTE format(
    'SELECT json_agg(c ORDER BY c.day_number DESC)::jsonb FROM %I.checkins c WHERE c.patient_id = $1',
    v_schema
  )
  INTO v_result USING p_patient_id;
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ── 3. New RPC: create_checkin_draft ─────────────────────────
-- Creates an in-progress draft checkin row with the voice transcript.
-- Returns the new checkin id.
CREATE OR REPLACE FUNCTION public.create_checkin_draft(
  p_org_slug   TEXT,
  p_patient_id TEXT,
  p_day_number INT,
  p_transcript TEXT
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema     TEXT := 'org_' || p_org_slug;
  v_checkin_id TEXT := 'ci-' || extract(epoch from now())::bigint::text;
BEGIN
  EXECUTE format(
    $q$
    INSERT INTO %I.checkins (
      id, patient_id, day_number, checkin_date,
      status, adherence_today, transcript, checkin_status
    ) VALUES (
      $1, $2, $3, now(),
      'green', true, $4, 'in_progress'
    )
    $q$,
    v_schema
  ) USING v_checkin_id, p_patient_id, p_day_number, p_transcript;

  RETURN v_checkin_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_checkin_draft(TEXT, TEXT, INT, TEXT) TO anon, authenticated;

-- ── 4. New RPC: update_checkin_photo ──────────────────────────
-- Stamps the photo URL on an existing draft row (after camera step).
CREATE OR REPLACE FUNCTION public.update_checkin_photo(
  p_org_slug   TEXT,
  p_checkin_id TEXT,
  p_photo_url  TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema TEXT := 'org_' || p_org_slug;
BEGIN
  EXECUTE format(
    'UPDATE %I.checkins SET photo_url = $1 WHERE id = $2',
    v_schema
  ) USING p_photo_url, p_checkin_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_checkin_photo(TEXT, TEXT, TEXT) TO anon, authenticated;
