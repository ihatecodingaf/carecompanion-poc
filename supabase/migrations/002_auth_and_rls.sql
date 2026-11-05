-- ============================================================
-- Care.ai — Auth Users + RLS
-- Run this in the Supabase SQL Editor (dashboard → SQL Editor)
--
-- What this does:
--   1. Creates auth accounts for all 6 demo patients + doctor
--   2. Links auth_user_id in patients/doctors tables
--   3. Enables RLS so each patient only sees their own data
--
-- Password for ALL demo accounts: CareDemo2024!
-- ============================================================

-- ─── Step 1: Create auth.users entries ─────────────────────
-- Uses a DO block so it's safe to re-run (ON CONFLICT DO NOTHING)

DO $$
DECLARE
  v_uid      UUID;
  v_email    TEXT;
  v_name     TEXT;
  v_password TEXT := 'CareDemo2024!';

  -- [email, full_name]
  v_users TEXT[][] := ARRAY[
    ARRAY['priya@careai.demo',        'Priya Sharma'],
    ARRAY['marcus@careai.demo',       'Marcus Johnson'],
    ARRAY['sarah@careai.demo',        'Sarah Chen'],
    ARRAY['ritika@careai.demo',       'Ritika Sharma'],
    ARRAY['arjun@careai.demo',        'Arjun Patel'],
    ARRAY['meera@careai.demo',        'Meera Kapoor'],
    ARRAY['dr.martinez@careai.demo',  'Dr. Sofia Martinez']
  ];
  i INTEGER;
BEGIN
  FOR i IN 1 .. array_length(v_users, 1) LOOP
    v_email := v_users[i][1];
    v_name  := v_users[i][2];

    -- Insert into auth.users (skip if email already exists)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
      INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,   -- pre-confirm so no email needed
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change
      )
      VALUES (
        gen_random_uuid(),
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        v_email,
        crypt(v_password, gen_salt('bf')),
        NOW(),                -- email pre-confirmed
        '{"provider":"email","providers":["email"]}',
        json_build_object('full_name', v_name)::jsonb,
        NOW(),
        NOW(),
        '', '', '', ''
      );
    END IF;

    -- Get the UUID we just created (or the existing one)
    SELECT id INTO v_uid FROM auth.users WHERE email = v_email;

    -- Insert identity record (required for email/password login)
    -- provider_id = email for the email provider
    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_uid AND provider = 'email') THEN
      INSERT INTO auth.identities (
        id,
        user_id,
        provider_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      )
      VALUES (
        gen_random_uuid(),
        v_uid,
        v_email,              -- provider_id = email for email provider
        json_build_object('sub', v_uid::text, 'email', v_email)::jsonb,
        'email',
        NOW(),
        NOW(),
        NOW()
      );
    END IF;

  END LOOP;
END $$;

-- ─── Step 2: Link auth_user_id back into patients ──────────

UPDATE org_care_demo.patients p
SET    auth_user_id = au.id
FROM   auth.users au
WHERE  au.email = p.email
AND    p.auth_user_id IS NULL;

-- Link doctor too (for dashboard login)
UPDATE org_care_demo.doctors d
SET    auth_user_id = au.id
FROM   auth.users au
WHERE  au.email = d.email
AND    d.auth_user_id IS NULL;

-- ─── Step 3: Enable RLS on all org_care_demo tables ────────

ALTER TABLE org_care_demo.patients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_care_demo.checkins         ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_care_demo.messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_care_demo.alerts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_care_demo.doctors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_care_demo.disease_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_care_demo.adherence_log    ENABLE ROW LEVEL SECURITY;

-- ─── Step 4: RLS Policies ───────────────────────────────────
-- Note: all app queries go through SECURITY DEFINER RPCs which
-- bypass RLS. These policies protect against direct REST API access.

-- Drop first so this file is safe to re-run
DROP POLICY IF EXISTS "patient_own_row"         ON org_care_demo.patients;
DROP POLICY IF EXISTS "doctor_read_all_patients" ON org_care_demo.patients;
DROP POLICY IF EXISTS "patient_own_checkins"    ON org_care_demo.checkins;
DROP POLICY IF EXISTS "patient_own_messages"    ON org_care_demo.messages;
DROP POLICY IF EXISTS "patient_own_alerts"      ON org_care_demo.alerts;
DROP POLICY IF EXISTS "authenticated_read_doctors"   ON org_care_demo.doctors;
DROP POLICY IF EXISTS "authenticated_read_protocols" ON org_care_demo.disease_protocols;
DROP POLICY IF EXISTS "patient_own_adherence"   ON org_care_demo.adherence_log;

-- Patients: each patient sees only their own row
CREATE POLICY "patient_own_row" ON org_care_demo.patients
  FOR ALL TO authenticated
  USING (auth_user_id = auth.uid());

-- Doctors: can read all patient rows in their org
CREATE POLICY "doctor_read_all_patients" ON org_care_demo.patients
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_care_demo.doctors
      WHERE auth_user_id = auth.uid()
    )
  );

-- Checkins: patient sees only their own
CREATE POLICY "patient_own_checkins" ON org_care_demo.checkins
  FOR ALL TO authenticated
  USING (
    patient_id IN (
      SELECT id FROM org_care_demo.patients
      WHERE auth_user_id = auth.uid()
    )
  );

-- Messages: patient sees only their own
CREATE POLICY "patient_own_messages" ON org_care_demo.messages
  FOR ALL TO authenticated
  USING (
    patient_id IN (
      SELECT id FROM org_care_demo.patients
      WHERE auth_user_id = auth.uid()
    )
  );

-- Alerts: patient sees only their own (read-only for patients)
CREATE POLICY "patient_own_alerts" ON org_care_demo.alerts
  FOR SELECT TO authenticated
  USING (
    patient_id IN (
      SELECT id FROM org_care_demo.patients
      WHERE auth_user_id = auth.uid()
    )
  );

-- Adherence log: patient sees only their own
CREATE POLICY "patient_own_adherence" ON org_care_demo.adherence_log
  FOR ALL TO authenticated
  USING (
    patient_id IN (
      SELECT id FROM org_care_demo.patients
      WHERE auth_user_id = auth.uid()
    )
  );

-- Doctors table: any authenticated user can read (patient detail shows doctor name)
CREATE POLICY "authenticated_read_doctors" ON org_care_demo.doctors
  FOR SELECT TO authenticated
  USING (true);

-- Disease protocols: any authenticated user can read
CREATE POLICY "authenticated_read_protocols" ON org_care_demo.disease_protocols
  FOR SELECT TO authenticated
  USING (true);

-- ─── Step 5: Verify ────────────────────────────────────────
-- Run this after to confirm everything looks right:
--
-- SELECT email, email_confirmed_at IS NOT NULL AS confirmed
-- FROM auth.users
-- WHERE email LIKE '%@careai.demo'
-- ORDER BY email;
--
-- SELECT p.name, p.email, p.auth_user_id IS NOT NULL AS linked
-- FROM org_care_demo.patients p
-- ORDER BY p.name;
