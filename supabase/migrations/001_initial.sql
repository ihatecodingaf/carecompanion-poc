-- ============================================================
-- Care.ai — Database Schema
-- Multi-tenant: per-org schemas (org_{slug})
-- Public schema: org registry + shared infra only
-- ============================================================

-- ─── Public schema: org registry ───────────────────────────

CREATE TABLE IF NOT EXISTS public.orgs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  schema_name  TEXT NOT NULL UNIQUE,        -- 'org_care_demo'
  plan         TEXT NOT NULL DEFAULT 'pilot',  -- pilot | growth | enterprise
  contact_email TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  active       BOOLEAN NOT NULL DEFAULT true
);

-- ─── Org schema provisioning function ─────────────────────
-- Call this once per new org: SELECT provision_org('Bloom Clinic', 'bloom');
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.provision_org(
  p_org_name   TEXT,
  p_slug       TEXT
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema TEXT := 'org_' || p_slug;
BEGIN
  -- Register org
  INSERT INTO public.orgs (name, slug, schema_name)
  VALUES (p_org_name, p_slug, v_schema)
  ON CONFLICT (slug) DO NOTHING;

  -- Create schema
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);

  -- ── doctors ────────────────────────────────────────────────
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

  -- ── patients ───────────────────────────────────────────────
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
      prescribed_products     TEXT,  -- JSON array of strings
      condition               TEXT NOT NULL DEFAULT ''acne'',  -- acne | laser_recovery
      notes                   TEXT,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
    )', v_schema, v_schema);

  -- ── checkins ───────────────────────────────────────────────
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
      ai_zone_analysis    TEXT,  -- JSON
      ai_suggested_actions TEXT,
      doctor_response     TEXT,
      doctor_action_taken TEXT,
      notes               TEXT,
      quality_score       INTEGER,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )', v_schema, v_schema);

  -- ── messages ───────────────────────────────────────────────
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.messages (
      id           BIGSERIAL PRIMARY KEY,
      patient_id   TEXT NOT NULL REFERENCES %I.patients(id) ON DELETE CASCADE,
      sender       TEXT NOT NULL,  -- patient | doctor | aisha
      content      TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT ''text'',  -- text | ai_analysis | image
      timestamp    TIMESTAMPTZ NOT NULL DEFAULT now(),
      is_read      BOOLEAN NOT NULL DEFAULT false,
      photo_url    TEXT,
      metadata     TEXT   -- JSON
    )', v_schema, v_schema);

  -- ── alerts ─────────────────────────────────────────────────
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.alerts (
      id                          TEXT PRIMARY KEY,
      patient_id                  TEXT NOT NULL REFERENCES %I.patients(id) ON DELETE CASCADE,
      severity                    TEXT NOT NULL,  -- green | yellow | red
      title                       TEXT NOT NULL,
      ai_analysis                 TEXT NOT NULL,
      suggested_actions           TEXT NOT NULL,
      patient_context             TEXT,
      photo_url                   TEXT,
      created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved                    BOOLEAN NOT NULL DEFAULT false,
      doctor_action               TEXT,
      instructions_given_to_patient TEXT
    )', v_schema, v_schema);

  -- ── disease_protocols ──────────────────────────────────────
  -- MCP server context: AI reads this when analyzing check-ins
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.disease_protocols (
      id           BIGSERIAL PRIMARY KEY,
      condition    TEXT NOT NULL,  -- acne | laser_recovery
      day_range    TEXT NOT NULL,  -- e.g. ''1-3'', ''4-7'', ''8-14''
      phase_name   TEXT NOT NULL,
      expectations TEXT NOT NULL,  -- what is normal to see
      hotspot_rules TEXT NOT NULL, -- when to alert
      instructions TEXT NOT NULL,  -- patient instructions for this phase
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )', v_schema);

  -- ── adherence_log ──────────────────────────────────────────
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

-- ─── RPC helpers (schema-aware patient queries) ────────────

CREATE OR REPLACE FUNCTION public.get_patient_by_email(
  p_email    TEXT,
  p_org_slug TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema TEXT := 'org_' || p_org_slug;
  v_result JSONB;
BEGIN
  EXECUTE format('SELECT row_to_json(p)::jsonb FROM %I.patients p WHERE p.email = $1', v_schema)
  INTO v_result USING p_email;
  RETURN COALESCE(v_result, 'null'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_patient_checkins(
  p_patient_id TEXT,
  p_org_slug   TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema TEXT := 'org_' || p_org_slug;
  v_result JSONB;
BEGIN
  EXECUTE format('SELECT json_agg(c ORDER BY c.day_number DESC)::jsonb FROM %I.checkins c WHERE c.patient_id = $1', v_schema)
  INTO v_result USING p_patient_id;
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_patient_messages(
  p_patient_id TEXT,
  p_org_slug   TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema TEXT := 'org_' || p_org_slug;
  v_result JSONB;
BEGIN
  EXECUTE format('SELECT json_agg(m ORDER BY m.timestamp ASC)::jsonb FROM %I.messages m WHERE m.patient_id = $1', v_schema)
  INTO v_result USING p_patient_id;
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_org_dashboard(p_org_slug TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema  TEXT := quote_ident('org_' || p_org_slug);
  v_patients JSONB;
  v_alerts   JSONB;
  v_stats    JSONB;
BEGIN
  EXECUTE 'SELECT json_agg(p ORDER BY CASE p.status WHEN ''red'' THEN 0 WHEN ''yellow'' THEN 1 ELSE 2 END, p.name) FROM ' || v_schema || '.patients p'
  INTO v_patients;

  EXECUTE 'SELECT json_agg(a ORDER BY a.created_at DESC) FROM ' || v_schema || '.alerts a WHERE a.resolved = false'
  INTO v_alerts;

  EXECUTE 'SELECT json_build_object(
    ''total'',         count(*),
    ''red'',           count(*) FILTER (WHERE status = ''red''),
    ''yellow'',        count(*) FILTER (WHERE status = ''yellow''),
    ''green'',         count(*) FILTER (WHERE status = ''green''),
    ''avg_adherence'', round(avg(adherence_percent)::numeric, 1),
    ''alerts_open'',   (SELECT count(*) FROM ' || v_schema || '.alerts WHERE resolved = false)
  ) FROM ' || v_schema || '.patients'
  INTO v_stats;

  RETURN json_build_object(
    'patients', COALESCE(v_patients, '[]'::jsonb),
    'unresolved_alerts', COALESCE(v_alerts, '[]'::jsonb),
    'stats', COALESCE(v_stats, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_patient_detail(
  p_patient_id TEXT,
  p_org_slug   TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema TEXT := 'org_' || p_org_slug;
  v_result JSONB;
BEGIN
  EXECUTE format($sql$
    SELECT json_build_object(
      'patient',   row_to_json(p),
      'doctor',    row_to_json(d),
      'checkins',  (SELECT json_agg(c ORDER BY c.day_number DESC) FROM %I.checkins c WHERE c.patient_id = p.id),
      'alerts',    (SELECT json_agg(a ORDER BY a.created_at DESC) FROM %I.alerts a WHERE a.patient_id = p.id),
      'messages',  (SELECT json_agg(m ORDER BY m.timestamp ASC)  FROM %I.messages m WHERE m.patient_id = p.id)
    )
    FROM %I.patients p
    JOIN %I.doctors  d ON d.id = p.doctor_id
    WHERE p.id = $1
  $sql$, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema)
  INTO v_result USING p_patient_id;
  RETURN COALESCE(v_result, 'null'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_alert(
  p_alert_id    TEXT,
  p_org_slug    TEXT,
  p_doctor_note TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema TEXT := 'org_' || p_org_slug;
BEGIN
  EXECUTE format('UPDATE %I.alerts SET resolved = true, doctor_action = $1 WHERE id = $2', v_schema)
  USING p_doctor_note, p_alert_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_doctor_response(
  p_checkin_id TEXT,
  p_org_slug   TEXT,
  p_response   TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema TEXT := 'org_' || p_org_slug;
BEGIN
  EXECUTE format('UPDATE %I.checkins SET doctor_response = $1 WHERE id = $2', v_schema)
  USING p_response, p_checkin_id;
END;
$$;

-- ─── Provision the demo org ────────────────────────────────
SELECT public.provision_org('Care Demo', 'care_demo');
