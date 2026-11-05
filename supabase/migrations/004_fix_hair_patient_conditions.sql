-- Fix hair patient conditions in demo org
-- Ritika, Arjun, and Meera were seeded with laser_recovery but should be hair conditions.

UPDATE org_care_demo.patients
SET
  condition          = 'androgenic_alopecia',
  treatment_name     = 'Female Pattern Hair Loss — Minoxidil Protocol',
  treatment_description = 'Androgenic alopecia (Ludwig Grade II) — topical minoxidil 5% once daily + biotin supplementation. Goal: stabilize crown thinning and stimulate regrowth.',
  current_day        = 45,
  treatment_start_date = (CURRENT_DATE - INTERVAL '44 days')::TEXT
WHERE email = 'ritika@careai.demo';

UPDATE org_care_demo.patients
SET
  condition          = 'androgenic_alopecia',
  treatment_name     = 'Male Pattern Baldness — Combination Protocol',
  treatment_description = 'Androgenic alopecia (Norwood III vertex) — minoxidil 5% + oral finasteride 1mg daily. Target zones: crown and temporal recession.',
  current_day        = 75,
  treatment_start_date = (CURRENT_DATE - INTERVAL '74 days')::TEXT
WHERE email = 'arjun@careai.demo';

UPDATE org_care_demo.patients
SET
  condition          = 'telogen_effluvium',
  treatment_name     = 'Telogen Effluvium Recovery — Nutritional Protocol',
  treatment_description = 'Post-stress diffuse shedding — iron/ferritin correction + vitamin D + minoxidil 2%. Goal: identify trigger, correct deficiency, stabilize shedding.',
  current_day        = 21,
  treatment_start_date = (CURRENT_DATE - INTERVAL '20 days')::TEXT
WHERE email = 'meera@careai.demo';
