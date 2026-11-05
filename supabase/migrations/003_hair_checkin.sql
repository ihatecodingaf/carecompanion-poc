-- ============================================================
-- Care.ai — Hair Check-in Support
-- Phase 1: DB schema + protocols + seed patient updates
-- ============================================================

-- ─── 1. Add checkin_type to disease_protocols ───────────────
-- The provision_org function creates disease_protocols without checkin_type.
-- We alter the existing demo schema table and update the function template.

ALTER TABLE org_care_demo.disease_protocols
  ADD COLUMN IF NOT EXISTS checkin_type TEXT NOT NULL DEFAULT 'face';

-- ─── 2. Update provision_org to include checkin_type ────────
-- Future orgs provisioned after this migration will have the column.

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
      prescribed_products     TEXT,
      condition               TEXT NOT NULL DEFAULT ''acne'',
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
      ai_zone_analysis    TEXT,
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
      sender       TEXT NOT NULL,
      content      TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT ''text'',
      timestamp    TIMESTAMPTZ NOT NULL DEFAULT now(),
      is_read      BOOLEAN NOT NULL DEFAULT false,
      photo_url    TEXT,
      metadata     TEXT
    )', v_schema, v_schema);

  -- ── alerts ─────────────────────────────────────────────────
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.alerts (
      id                          TEXT PRIMARY KEY,
      patient_id                  TEXT NOT NULL REFERENCES %I.patients(id) ON DELETE CASCADE,
      severity                    TEXT NOT NULL,
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
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.disease_protocols (
      id           BIGSERIAL PRIMARY KEY,
      condition    TEXT NOT NULL,
      day_range    TEXT NOT NULL,
      phase_name   TEXT NOT NULL,
      expectations TEXT NOT NULL,
      hotspot_rules TEXT NOT NULL,
      instructions TEXT NOT NULL,
      checkin_type TEXT NOT NULL DEFAULT ''face'',
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

-- ─── 3. Hair disease protocols for org_care_demo ────────────

INSERT INTO org_care_demo.disease_protocols
  (condition, day_range, phase_name, expectations, hotspot_rules, instructions)
VALUES

-- ANDROGENIC ALOPECIA (male/female pattern hair loss)
('androgenic_alopecia', '1-30', 'Baseline Establishment',
  'No visible improvement yet — hair loss may continue at pre-treatment rate. Scalp may show mild sensitivity to topical treatments. Photograph documentation establishes density baseline.',
  'hotspot=true if: sudden accelerated shedding (>150 hairs/day reported), new bald patches, scalp inflammation, folliculitis, or severe sensitivity reaction to topical minoxidil.',
  'Apply minoxidil 5% once daily to dry scalp. Photograph crown and temples at same time daily. Do not wash hair within 4 hours of application. Gentle handling — no tight hairstyles.'),

('androgenic_alopecia', '31-90', 'Initial Response Phase',
  'Shedding may temporarily increase (minoxidil shed) — this is normal and indicates follicle activation. Some patients see early vellus regrowth (fine baby hairs) at hairline and crown by week 8-10.',
  'hotspot=true if: complete cessation of shedding with no regrowth signs, significant new bald patch formation, scalp inflammation or contact dermatitis, or patient reports sudden marked worsening.',
  'Continue minoxidil daily. Finasteride (if prescribed) once daily with food. Supplement with biotin + iron if deficient. Avoid heat styling. Regular check-in photos from above — crown focus.'),

('androgenic_alopecia', '91-180', 'Early Regrowth Phase',
  'Visible regrowth of vellus/terminal hairs expected in crown and temporal regions. Density improvements may be subtle initially. Existing hair shedding should stabilize below baseline.',
  'hotspot=true if: regression of newly grown hairs, new bald patch in previously stable zone, or scalp condition (seborrheic dermatitis) interfering with treatment.',
  'Maintain full protocol. Add low-level laser therapy (LLLT) cap if available. Assess DHT-blocking efficacy at 6-month mark. Document progress with standardized overhead photographs.'),

('androgenic_alopecia', '181-365', 'Consolidation Phase',
  'Continued density improvement. Terminal hair thickness increasing. Most patients see peak benefit around month 9-12. Maintenance is lifelong — stopping treatment reverses gains within 6-12 months.',
  'hotspot=true if: plateau with no improvement by month 9, significant new recession in previously stable zones, or sexual side effects from finasteride requiring dose adjustment.',
  'Continue all treatments. Introduce PRP session if density plateau reached. Annual baseline photograph update for comparative tracking. Discuss long-term maintenance plan.'),

-- ALOPECIA AREATA (autoimmune patchy hair loss)
('alopecia_areata', '1-14', 'Active Patch Phase',
  'Patchy hair loss visible. Patch edges may show exclamation-mark hairs (tapered at base). New patches may develop during active flare. Scalp looks normal — no inflammation visible.',
  'hotspot=true if: rapidly expanding patch (>2cm growth in 1 week), coalescence of multiple patches, ophiasis pattern (band loss), or extension to eyebrows/eyelashes/body.',
  'Apply prescribed corticosteroid lotion/foam to patches twice daily. Avoid trauma to patches — no scratching. Photograph each patch individually. Report any new patches immediately.'),

('alopecia_areata', '15-60', 'Monitoring and Treatment Response',
  'Regrowth may begin as fine white/depigmented hairs at patch centers — this is positive. Some patches may expand while others show regrowth. Course is unpredictable — patience required.',
  'hotspot=true if: no regrowth signs after 8 weeks of treatment, new patches forming faster than existing ones resolve, ophiasis pattern, or patient distress requiring psychological support.',
  'Continue topical treatment. Physician may introduce intralesional corticosteroid injections. DPCP (diphenylcyclopropenone) immunotherapy may be added for extensive disease. Document each patch size weekly.'),

('alopecia_areata', '61-180', 'Regrowth Assessment Phase',
  'Responders will show terminal hair regrowth — initially white/fine, then pigmented. Non-responders may need treatment escalation (JAK inhibitors, PUVA). Spontaneous remission possible.',
  'hotspot=true if: hair loss > 50% scalp (AT/AU territory), eyebrow loss, nail changes (pitting, trachyonychia), or psychological impact requiring referral.',
  'If responding: continue current protocol. If not responding: escalate to systemic therapy discussion. Dermatology review at 3-month mark. Psychological support offered — AA has significant quality-of-life impact.'),

-- TELOGEN EFFLUVIUM (stress/post-partum/nutritional shedding)
('telogen_effluvium', '1-30', 'Active Shedding Phase',
  'Heavy diffuse shedding — patient may report handfuls of hair. This is the hallmark of TE. Hair density appears reduced overall but evenly distributed (not patchy). Trigger event typically 2-4 months prior.',
  'hotspot=true if: shedding >300 hairs/day, patchy loss suggesting superimposed AA, scalp inflammation, or signs of severe nutritional deficiency (nails, skin).',
  'Identify and address trigger: iron, ferritin, thyroid, vitamin D, zinc levels. Gentle hair handling — no tight styles, minimize heat. Minoxidil 2% can reduce shed duration. Reassure patient — TE is self-limiting.'),

('telogen_effluvium', '31-90', 'Shedding Stabilization',
  'Shedding rate decreasing. Scalp density stable. New anagen hairs (short, fine hairs) visible at hairline and parting. Overall volume begins recovering. Full regrowth takes 6-12 months.',
  'hotspot=true if: shedding is not reducing, new patchy areas appearing (suspect concurrent AA), iron/ferritin remains critically low (<30 ng/mL), or thyroid abnormality identified.',
  'Continue supplementation per lab results. If iron deficient: continue supplementation for 3-6 months post-normalization. Scalp massage 5 minutes daily to stimulate circulation. Follow up labs at 3 months.'),

('telogen_effluvium', '91-270', 'Regrowth Phase',
  'Active regrowth of telogen-shed follicles. Hair volume progressively improving. Texture may temporarily change — new hairs often wavier/different. Full density restoration expected by month 9-12.',
  'hotspot=true if: density not improving by month 5, chronic TE suspected (ongoing trigger), or patient developing anxiety/depression around hair loss requiring referral.',
  'Maintain nutritional optimization. Minoxidil can be tapered at month 6 if shedding resolved. Celebrate progress — TE prognosis is excellent. Final photograph comparison at month 9.');

-- ─── 4. Update hair patients to appropriate conditions ───────
-- Ritika (28F) → androgenic_alopecia (female pattern)
-- Arjun (34M) → androgenic_alopecia (male pattern)
-- Meera (42F) → telogen_effluvium (stress/hormonal shedding)

UPDATE org_care_demo.patients
SET
  condition = 'androgenic_alopecia',
  treatment_name = 'Female Pattern Hair Loss — Minoxidil Protocol',
  treatment_description = 'Androgenic alopecia (Ludwig Grade II) — topical minoxidil 5% once daily + biotin supplementation. Goal: stabilize crown thinning and stimulate regrowth.',
  prescribed_products = '["Minoxidil 5% Solution (once daily, scalp)", "Biotin 5000mcg (daily, oral)", "Iron + Vitamin C (daily, oral — if ferritin <50)", "Gentle sulfate-free shampoo (2-3x/week)"]'
WHERE id = 'demo-patient-laser-ritika';

UPDATE org_care_demo.patients
SET
  condition = 'androgenic_alopecia',
  treatment_name = 'Male Pattern Baldness — Combination Protocol',
  treatment_description = 'Androgenic alopecia (Norwood III vertex) — minoxidil 5% + oral finasteride 1mg daily. Target zones: crown and temporal recession.',
  prescribed_products = '["Minoxidil 5% Foam (once daily, crown + temples)", "Finasteride 1mg (once daily, oral, with food)", "Ketoconazole 2% Shampoo (2x/week)", "Biotin 2500mcg (daily, oral)"]'
WHERE id = 'demo-patient-laser-arjun';

UPDATE org_care_demo.patients
SET
  condition = 'telogen_effluvium',
  treatment_name = 'Post-Stress Telogen Effluvium Recovery',
  treatment_description = 'Diffuse hair shedding triggered by hormonal stress (perimenopause onset). Ferritin 18 ng/mL (low). Treatment: iron supplementation + minoxidil 2% to shorten shedding phase.',
  prescribed_products = '["Iron Bisglycinate 36mg (daily, oral — take with Vitamin C)", "Vitamin C 500mg (with iron, oral)", "Minoxidil 2% Solution (once daily, crown + parting)", "Vitamin D3 2000IU (daily, oral — level was deficient)"]'
WHERE id = 'demo-patient-laser-meera';
