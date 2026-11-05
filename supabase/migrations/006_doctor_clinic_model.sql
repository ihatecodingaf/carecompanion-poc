-- ============================================================
-- Migration 006: Doctor-Clinic Model
-- Adds multi-clinic doctor support, admin users, audit log
-- ============================================================

-- ── Expand public.orgs with clinic details ─────────────────
ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS address   TEXT,
  ADD COLUMN IF NOT EXISTS city      TEXT,
  ADD COLUMN IF NOT EXISTS state     TEXT,
  ADD COLUMN IF NOT EXISTS phone     TEXT,
  ADD COLUMN IF NOT EXISTS logo_url  TEXT,
  ADD COLUMN IF NOT EXISTS specialty TEXT DEFAULT 'multi';

-- ── Admin users ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_users (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Doctor ↔ Clinic mapping ────────────────────────────────
-- One doctor (auth account) can belong to many clinics (orgs).
-- doctor_row_id is the id in org_{slug}.doctors for that clinic.
CREATE TABLE IF NOT EXISTS public.doctor_clinic_map (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_slug      TEXT        NOT NULL REFERENCES public.orgs(slug) ON DELETE CASCADE,
  doctor_row_id TEXT        NOT NULL,
  is_primary    BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(auth_user_id, org_slug)
);

CREATE INDEX IF NOT EXISTS idx_doctor_clinic_map_auth ON public.doctor_clinic_map(auth_user_id);

-- ── DPDP audit log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.data_access_log (
  id           BIGSERIAL   PRIMARY KEY,
  auth_user_id UUID        NOT NULL,
  org_slug     TEXT        NOT NULL,
  resource     TEXT        NOT NULL,  -- 'patient' | 'checkin' | 'alert' | 'message'
  resource_id  TEXT        NOT NULL,
  action       TEXT        NOT NULL,  -- 'view' | 'send_message' | 'update_rx' | 'update_ai'
  ip_address   TEXT,
  accessed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_log_user ON public.data_access_log(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_access_log_time ON public.data_access_log(accessed_at DESC);

-- ── Expand org schema provisioning to include new clinic fields ──
-- Re-create provision_org to accept optional clinic details
CREATE OR REPLACE FUNCTION public.provision_org(
  p_org_name   TEXT,
  p_slug       TEXT,
  p_specialty  TEXT DEFAULT 'multi',
  p_city       TEXT DEFAULT NULL,
  p_phone      TEXT DEFAULT NULL
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema TEXT := 'org_' || p_slug;
BEGIN
  INSERT INTO public.orgs (name, slug, schema_name, specialty, city, phone)
  VALUES (p_org_name, p_slug, v_schema, p_specialty, p_city, p_phone)
  ON CONFLICT (slug) DO UPDATE SET
    specialty = COALESCE(EXCLUDED.specialty, orgs.specialty),
    city      = COALESCE(EXCLUDED.city, orgs.city),
    phone     = COALESCE(EXCLUDED.phone, orgs.phone);

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.doctors (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      specialty        TEXT NOT NULL,
      clinic_name      TEXT NOT NULL,
      clinic_location  TEXT NOT NULL,
      avatar_url       TEXT,
      phone            TEXT,
      email            TEXT UNIQUE,
      auth_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )', v_schema);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.patients (
      id                      TEXT PRIMARY KEY,
      name                    TEXT NOT NULL,
      age                     INTEGER NOT NULL,
      gender                  TEXT NOT NULL,
      phone                   TEXT,
      email                   TEXT UNIQUE,
      avatar_url              TEXT,
      auth_user_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      doctor_id               TEXT NOT NULL REFERENCES %I.doctors(id),
      treatment_name          TEXT NOT NULL,
      treatment_description   TEXT,
      treatment_start_date    TEXT NOT NULL,
      current_day             INTEGER NOT NULL DEFAULT 1,
      status                  TEXT NOT NULL DEFAULT ''green'',
      adherence_percent       REAL NOT NULL DEFAULT 100.0,
      prescribed_products     TEXT,
      condition               TEXT NOT NULL DEFAULT ''acne'',
      notes                   TEXT,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
    )', v_schema, v_schema);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.checkins (
      id                  TEXT PRIMARY KEY,
      patient_id          TEXT NOT NULL REFERENCES %I.patients(id) ON DELETE CASCADE,
      day_number          INTEGER NOT NULL,
      checkin_date        TIMESTAMPTZ NOT NULL DEFAULT now(),
      status              TEXT NOT NULL DEFAULT ''green'',
      symptoms_reported   TEXT,
      adherence_today     BOOLEAN NOT NULL DEFAULT true,
      photo_url           TEXT,
      photo_label         TEXT,
      ai_headline         TEXT,
      ai_summary          TEXT,
      ai_zone_analysis    TEXT,
      ai_suggested_actions TEXT,
      doctor_response     TEXT,
      doctor_action_taken TEXT,
      notes               TEXT,
      quality_score       INTEGER,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )', v_schema, v_schema);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.messages (
      id           BIGSERIAL PRIMARY KEY,
      patient_id   TEXT NOT NULL REFERENCES %I.patients(id) ON DELETE CASCADE,
      sender       TEXT NOT NULL,
      content      TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT ''text'',
      timestamp    TIMESTAMPTZ NOT NULL DEFAULT now(),
      is_read      BOOLEAN NOT NULL DEFAULT false,
      photo_url    TEXT,
      metadata     TEXT
    )', v_schema, v_schema);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.alerts (
      id                            TEXT PRIMARY KEY,
      patient_id                    TEXT NOT NULL REFERENCES %I.patients(id) ON DELETE CASCADE,
      severity                      TEXT NOT NULL,
      title                         TEXT NOT NULL,
      ai_analysis                   TEXT NOT NULL,
      suggested_actions             TEXT NOT NULL,
      patient_context               TEXT,
      photo_url                     TEXT,
      created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved                      BOOLEAN NOT NULL DEFAULT false,
      doctor_action                 TEXT,
      instructions_given_to_patient TEXT
    )', v_schema, v_schema);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.disease_protocols (
      id           BIGSERIAL PRIMARY KEY,
      condition    TEXT NOT NULL,
      day_range    TEXT NOT NULL,
      phase_name   TEXT NOT NULL,
      expectations TEXT NOT NULL,
      hotspot_rules TEXT NOT NULL,
      instructions TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )', v_schema);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.adherence_log (
      id           BIGSERIAL PRIMARY KEY,
      patient_id   TEXT NOT NULL REFERENCES %I.patients(id) ON DELETE CASCADE,
      day_number   INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      applied      BOOLEAN NOT NULL DEFAULT false,
      logged_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )', v_schema, v_schema);

  RETURN v_schema;
END;
$$;

-- ── RPC: get all clinics for a doctor ──────────────────────
CREATE OR REPLACE FUNCTION public.get_doctor_clinics(
  p_auth_user_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT json_agg(
    json_build_object(
      'org_slug',      dcm.org_slug,
      'doctor_row_id', dcm.doctor_row_id,
      'is_primary',    dcm.is_primary,
      'org_name',      o.name,
      'specialty',     o.specialty,
      'city',          o.city
    ) ORDER BY dcm.is_primary DESC, dcm.created_at ASC
  )::jsonb
  INTO v_result
  FROM public.doctor_clinic_map dcm
  JOIN public.orgs o ON o.slug = dcm.org_slug
  WHERE dcm.auth_user_id = p_auth_user_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ── RPC: get doctor profile (from primary clinic) ──────────
CREATE OR REPLACE FUNCTION public.get_doctor_profile(
  p_auth_user_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic RECORD;
  v_profile JSONB;
BEGIN
  SELECT dcm.org_slug, dcm.doctor_row_id INTO v_clinic
  FROM public.doctor_clinic_map dcm
  WHERE dcm.auth_user_id = p_auth_user_id
  ORDER BY dcm.is_primary DESC, dcm.created_at ASC
  LIMIT 1;

  IF v_clinic IS NULL THEN RETURN NULL; END IF;

  EXECUTE format(
    'SELECT row_to_json(d)::jsonb FROM %I.doctors d WHERE d.id = %L',
    'org_' || v_clinic.org_slug, v_clinic.doctor_row_id
  ) INTO v_profile;

  RETURN v_profile;
END;
$$;

-- ── RPC: get doctor dashboard (all clinics, own patients only) ──
CREATE OR REPLACE FUNCTION public.get_doctor_dashboard(
  p_auth_user_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic         RECORD;
  v_all_patients   JSONB := '[]'::jsonb;
  v_all_alerts     JSONB := '[]'::jsonb;
  v_clinic_patients JSONB;
  v_clinic_alerts   JSONB;
  v_stats          JSONB;
  v_schema         TEXT;
BEGIN
  FOR v_clinic IN
    SELECT dcm.org_slug, dcm.doctor_row_id, o.name AS org_name
    FROM public.doctor_clinic_map dcm
    JOIN public.orgs o ON o.slug = dcm.org_slug
    WHERE dcm.auth_user_id = p_auth_user_id
  LOOP
    v_schema := 'org_' || v_clinic.org_slug;

    -- Only this doctor's patients
    EXECUTE format(
      $q$SELECT json_agg(
        json_build_object(
          'id',                p.id,
          'name',              p.name,
          'age',               p.age,
          'gender',            p.gender,
          'condition',         p.condition,
          'treatment_name',    p.treatment_name,
          'current_day',       p.current_day,
          'status',            p.status,
          'adherence_percent', p.adherence_percent,
          'avatar_url',        p.avatar_url,
          'phone',             p.phone,
          'org_slug',          %L,
          'org_name',          %L
        ) ORDER BY CASE p.status WHEN 'red' THEN 0 WHEN 'yellow' THEN 1 ELSE 2 END
      ) FROM %I.patients p WHERE p.doctor_id = %L$q$,
      v_clinic.org_slug, v_clinic.org_name, v_schema, v_clinic.doctor_row_id
    ) INTO v_clinic_patients;

    -- Unresolved alerts for this doctor's patients only
    EXECUTE format(
      $q$SELECT json_agg(
        json_build_object(
          'id',          a.id,
          'patient_id',  a.patient_id,
          'severity',    a.severity,
          'title',       a.title,
          'ai_analysis', a.ai_analysis,
          'created_at',  a.created_at,
          'org_slug',    %L,
          'org_name',    %L
        ) ORDER BY a.created_at DESC
      ) FROM %I.alerts a
      WHERE a.resolved = false
        AND a.patient_id IN (
          SELECT id FROM %I.patients WHERE doctor_id = %L
        )$q$,
      v_clinic.org_slug, v_clinic.org_name, v_schema, v_schema, v_clinic.doctor_row_id
    ) INTO v_clinic_alerts;

    IF v_clinic_patients IS NOT NULL THEN
      v_all_patients := v_all_patients || v_clinic_patients;
    END IF;
    IF v_clinic_alerts IS NOT NULL THEN
      v_all_alerts := v_all_alerts || v_clinic_alerts;
    END IF;
  END LOOP;

  SELECT json_build_object(
    'total_patients',  jsonb_array_length(v_all_patients),
    'alerts_open',     jsonb_array_length(v_all_alerts),
    'red_count',       (SELECT count(*) FROM jsonb_array_elements(v_all_patients) p WHERE p->>'status' = 'red'),
    'yellow_count',    (SELECT count(*) FROM jsonb_array_elements(v_all_patients) p WHERE p->>'status' = 'yellow'),
    'green_count',     (SELECT count(*) FROM jsonb_array_elements(v_all_patients) p WHERE p->>'status' = 'green'),
    'avg_adherence',   (SELECT ROUND(avg((p->>'adherence_percent')::numeric), 1) FROM jsonb_array_elements(v_all_patients) p)
  ) INTO v_stats;

  RETURN json_build_object(
    'patients', v_all_patients,
    'alerts',   v_all_alerts,
    'stats',    COALESCE(v_stats, '{}'::jsonb)
  );
END;
$$;

-- ── RPC: send doctor message to patient ────────────────────
CREATE OR REPLACE FUNCTION public.send_doctor_message(
  p_patient_id TEXT,
  p_org_slug   TEXT,
  p_content    TEXT,
  p_doctor_id  TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema TEXT := 'org_' || p_org_slug;
BEGIN
  EXECUTE format(
    'INSERT INTO %I.messages (patient_id, sender, content, message_type)
     VALUES ($1, $2, $3, $4)',
    v_schema
  ) USING p_patient_id, 'doctor', p_content, 'text';
END;
$$;

-- ── Update care_demo org with clinic details ────────────────
UPDATE public.orgs
SET
  specialty = 'dermatology',
  city      = 'Mumbai',
  state     = 'Maharashtra',
  phone     = '+91 98100 00000'
WHERE slug = 'care_demo';
