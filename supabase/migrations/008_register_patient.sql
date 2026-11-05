-- ============================================================
-- Migration 008: register_patient RPC
-- Called by the doctor PWA to add a new patient from the
-- OCR prescription form.
-- ============================================================

CREATE OR REPLACE FUNCTION public.register_patient(
  p_org_slug  TEXT,
  p_doctor_id TEXT,
  p_data      JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema       TEXT := 'org_' || p_org_slug;
  v_patient_id   TEXT;
  v_name         TEXT;
  v_condition    TEXT;
  v_treatment    TEXT;
  v_follow_up    TEXT;
BEGIN
  -- ── Generate a unique patient ID ──────────────────────────
  v_patient_id := 'pt-' || p_org_slug || '-' || extract(epoch from now())::bigint::text;

  v_name      := trim(p_data->>'name');
  v_condition := COALESCE(NULLIF(trim(p_data->>'condition'),     ''), 'acne');
  v_treatment := COALESCE(NULLIF(trim(p_data->>'treatment_name'),''), 'As prescribed');
  v_follow_up := p_data->>'follow_up_date';

  -- ── Validate required fields ──────────────────────────────
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Patient name is required';
  END IF;

  IF p_doctor_id IS NULL OR trim(p_doctor_id) = '' THEN
    RAISE EXCEPTION 'Doctor ID is required';
  END IF;

  -- ── Insert patient row ────────────────────────────────────
  EXECUTE format(
    $q$
    INSERT INTO %I.patients (
      id,
      doctor_id,
      name,
      age,
      gender,
      phone,
      condition,
      treatment_name,
      treatment_start_date,
      current_day,
      status,
      adherence_percent,
      avatar_url
    ) VALUES (
      $1,                               -- id
      $2,                               -- doctor_id
      $3,                               -- name
      COALESCE(NULLIF($4,'')::integer, 0),  -- age (0 if blank)
      COALESCE(NULLIF($5,''), 'Unknown'),   -- gender
      NULLIF($6,''),                    -- phone
      $7,                               -- condition
      $8,                               -- treatment_name
      to_char(CURRENT_DATE,'YYYY-MM-DD'), -- treatment_start_date
      1,                                -- current_day
      'green',                          -- status
      100.0,                            -- adherence_percent
      NULLIF($9,'')                     -- avatar_url
    )
    $q$,
    v_schema
  ) USING
    v_patient_id,
    p_doctor_id,
    v_name,
    COALESCE(p_data->>'age',    ''),
    COALESCE(p_data->>'gender', ''),
    COALESCE(p_data->>'phone',  ''),
    v_condition,
    v_treatment,
    COALESCE(p_data->>'photo_url','');

  -- ── Welcome message for the patient app ───────────────────
  EXECUTE format(
    $q$
    INSERT INTO %I.messages (patient_id, sender, content, message_type)
    VALUES ($1, 'aisha', $2, 'text')
    $q$,
    v_schema
  ) USING
    v_patient_id,
    format(
      E'Welcome to your recovery journey, %s! 🌟\n\n'
      '📋 Treatment: %s\n'
      '💊 Medications:\n%s\n\n'
      '✅ What to do:\n%s\n\n'
      '🚫 What to avoid:\n%s\n\n'
      'Your doctor is monitoring your progress. Complete your daily check-ins for personalised AI feedback.',
      v_name,
      v_treatment,
      COALESCE(NULLIF(p_data->>'medications',''), 'See prescription'),
      COALESCE(NULLIF(p_data->>'dos',''),         'Follow your care plan'),
      COALESCE(NULLIF(p_data->>'donts',''),        'Follow your doctor''s advice')
    );

  -- ── Initial adherence log entry ───────────────────────────
  EXECUTE format(
    $q$
    INSERT INTO %I.adherence_log (patient_id, day_number, product_name, applied)
    VALUES ($1, 1, 'Registration', true)
    $q$,
    v_schema
  ) USING v_patient_id;

  -- ── Return summary ────────────────────────────────────────
  RETURN json_build_object(
    'patient_id',     v_patient_id,
    'name',           v_name,
    'condition',      v_condition,
    'treatment_name', v_treatment,
    'follow_up_date', COALESCE(v_follow_up, '')
  );

EXCEPTION
  WHEN others THEN
    RAISE EXCEPTION 'register_patient failed: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_patient(TEXT, TEXT, JSONB) TO anon, authenticated;
