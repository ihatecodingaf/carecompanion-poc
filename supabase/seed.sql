-- ============================================================
-- Care.ai — Demo Seed Data
-- Run after 001_initial.sql has been applied.
-- Creates: 1 doctor + 6 demo patients
--   Acne:          Priya Sharma (D32, yellow) · Marcus Johnson (D8, green)
--   Laser/CO2:     Sarah Chen (D5, red) · Ritika Sharma (D14, green) · Meera Kapoor (D3, red)
--   Laser/Q-switch: Arjun Patel (D7, yellow)
-- ============================================================

-- ─── Disease Protocols (MCP context for AI) ────────────────

INSERT INTO org_care_demo.disease_protocols (condition, day_range, phase_name, expectations, hotspot_rules, instructions, checkin_type) VALUES

-- ACNE VULGARIS
('acne', '1-14', 'Purge Phase',
  'Initial breakout may worsen. Skin adjusting to actives. Mild redness, dryness and peeling are expected and normal.',
  'hotspot=true if: pustules spreading beyond target zones, severe swelling (grade 3), nodular cysts appearing, or skin barrier compromise signs.',
  'Apply treatment once daily at night. Do not over-wash. Use gentle non-comedogenic moisturizer AM+PM. SPF 30+ every morning. Do NOT pick or squeeze.',
  'face'),

('acne', '15-45', 'Active Treatment Phase',
  'Reduction in active breakouts expected. Some residual redness and PIH (post-inflammatory hyperpigmentation) is normal. Purging should be subsiding.',
  'hotspot=true if: new cystic lesions, spreading infection signs, allergic reaction (diffuse urticaria), or worsening vs day 14 baseline.',
  'Continue nightly application. Can start light exfoliant 1x/week if tolerated. Maintain SPF. Hydration is critical.',
  'face'),

('acne', '46-90', 'Maintenance Phase',
  'Significant clearance expected. Remaining concerns: PIH fading, texture improvement, pore minimization. Skin should be stable.',
  'hotspot=true if: significant relapse with >5 new inflammatory lesions, any cystic involvement, or suspected antibiotic resistance.',
  'Taper to every-other-night if sensitive. Introduce niacinamide for PIH. Can add AHA/BHA weekly for texture.',
  'face'),

-- POST-LASER RECOVERY (CO2 / Fractional)
('laser_recovery', '1-3', 'Acute Healing Phase',
  'Expected: significant erythema (red 2-3), swelling (swelling 2-3), weeping/oozing, crusting beginning. This is normal post-ablative response. May appear alarming but is expected.',
  'hotspot=true if: blistering beyond pinpoint, purulent discharge, spreading erythema beyond treated area, fever/systemic symptoms, or asymmetric swelling suggesting infection.',
  'Keep moist with Vaseline or prescribed ointment every 2-3 hours. Do NOT pick crusts. No makeup. Sleep elevated. Call clinic if temp >38C or severe pain unresponsive to OTC analgesia.',
  'face'),

('laser_recovery', '4-7', 'Crusting/Peeling Phase',
  'Crusts forming and beginning to lift. Significant peeling expected — do not force. Underlying skin may be pink/red. Swelling reducing. Texture concern (1-2) is normal.',
  'hotspot=true if: green/yellow purulent crust, expanding lesions, blistering, or erythema extending beyond treatment zone.',
  'Continue moist healing. Let crusts fall off naturally. Begin gentle cleansing 2x daily with cool water. No actives, no retinol, no acids.',
  'face'),

('laser_recovery', '8-14', 'Re-epithelialization Phase',
  'New skin forming — expect bright pink/red tone (redness 1-2), occasional itching (normal), texture improving. Swelling should be minimal.',
  'hotspot=true if: redness grade 3 persisting at day 10+, new breakouts over treated area, milia forming extensively, or contact dermatitis signs.',
  'Skin is fragile — no sun without SPF 50+. Begin gentle hyaluronic acid serum. Can reintroduce mineral makeup if fully epithelialized.',
  'face'),

('laser_recovery', '15-28', 'Remodeling Phase',
  'Pink/red tone fading to normal. Texture smoothing, pores refining. Some patients experience delayed hyperpigmentation — address promptly.',
  'hotspot=true if: PIH spreading rapidly, milia requiring extraction, persistent redness grade 2+ after day 21, or new scarring.',
  'Introduce niacinamide for PIH. Begin SPF 50+ religiously. Can reintroduce gentle actives at week 4. Schedule follow-up appointment.',
  'face'),

-- ANDROGENIC ALOPECIA
('androgenic_alopecia', '1-30', 'Baseline Establishment',
  'No visible improvement yet — hair loss may continue at pre-treatment rate. Scalp may show mild sensitivity to topical treatments. Photograph documentation establishes density baseline.',
  'hotspot=true if: sudden accelerated shedding (>150 hairs/day reported), new bald patches, scalp inflammation, folliculitis, or severe sensitivity reaction to topical minoxidil.',
  'Apply minoxidil 5% once daily to dry scalp. Photograph crown and temples at same time daily. Do not wash hair within 4 hours of application. Gentle handling — no tight hairstyles.',
  'hair'),

('androgenic_alopecia', '31-90', 'Initial Response Phase',
  'Shedding may temporarily increase (minoxidil shed) — this is normal and indicates follicle activation. Some patients see early vellus regrowth (fine baby hairs) at hairline and crown by week 8-10.',
  'hotspot=true if: complete cessation of shedding with no regrowth signs, significant new bald patch formation, scalp inflammation or contact dermatitis, or patient reports sudden marked worsening.',
  'Continue minoxidil daily. Finasteride (if prescribed) once daily with food. Supplement with biotin + iron if deficient. Avoid heat styling. Regular check-in photos from above — crown focus.',
  'hair'),

('androgenic_alopecia', '91-180', 'Early Regrowth Phase',
  'Visible regrowth of vellus/terminal hairs expected in crown and temporal regions. Density improvements may be subtle initially. Existing hair shedding should stabilize below baseline.',
  'hotspot=true if: regression of newly grown hairs, new bald patch in previously stable zone, or scalp condition (seborrheic dermatitis) interfering with treatment.',
  'Maintain full protocol. Add low-level laser therapy (LLLT) cap if available. Assess DHT-blocking efficacy at 6-month mark. Document progress with standardized overhead photographs.',
  'hair'),

('androgenic_alopecia', '181-365', 'Consolidation Phase',
  'Continued density improvement. Terminal hair thickness increasing. Most patients see peak benefit around month 9-12. Maintenance is lifelong — stopping treatment reverses gains within 6-12 months.',
  'hotspot=true if: plateau with no improvement by month 9, significant new recession in previously stable zones, or sexual side effects from finasteride requiring dose adjustment.',
  'Continue all treatments. Introduce PRP session if density plateau reached. Annual baseline photograph update for comparative tracking. Discuss long-term maintenance plan.',
  'hair'),

-- ALOPECIA AREATA
('alopecia_areata', '1-14', 'Active Patch Phase',
  'Patchy hair loss visible. Patch edges may show exclamation-mark hairs (tapered at base). New patches may develop during active flare. Scalp looks normal — no inflammation visible.',
  'hotspot=true if: rapidly expanding patch (>2cm growth in 1 week), coalescence of multiple patches, ophiasis pattern (band loss), or extension to eyebrows/eyelashes/body.',
  'Apply prescribed corticosteroid lotion/foam to patches twice daily. Avoid trauma to patches — no scratching. Photograph each patch individually. Report any new patches immediately.',
  'hair'),

('alopecia_areata', '15-60', 'Monitoring and Treatment Response',
  'Regrowth may begin as fine white/depigmented hairs at patch centers — this is positive. Some patches may expand while others show regrowth. Course is unpredictable — patience required.',
  'hotspot=true if: no regrowth signs after 8 weeks of treatment, new patches forming faster than existing ones resolve, ophiasis pattern, or patient distress requiring psychological support.',
  'Continue topical treatment. Physician may introduce intralesional corticosteroid injections. DPCP immunotherapy may be added for extensive disease. Document each patch size weekly.',
  'hair'),

('alopecia_areata', '61-180', 'Regrowth Assessment Phase',
  'Responders will show terminal hair regrowth — initially white/fine, then pigmented. Non-responders may need treatment escalation (JAK inhibitors, PUVA). Spontaneous remission possible.',
  'hotspot=true if: hair loss > 50% scalp (AT/AU territory), eyebrow loss, nail changes (pitting, trachyonychia), or psychological impact requiring referral.',
  'If responding: continue current protocol. If not responding: escalate to systemic therapy discussion. Dermatology review at 3-month mark. Psychological support offered.',
  'hair'),

-- TELOGEN EFFLUVIUM
('telogen_effluvium', '1-30', 'Active Shedding Phase',
  'Heavy diffuse shedding — patient may report handfuls of hair. This is the hallmark of TE. Hair density appears reduced overall but evenly distributed (not patchy). Trigger event typically 2-4 months prior.',
  'hotspot=true if: shedding >300 hairs/day, patchy loss suggesting superimposed AA, scalp inflammation, or signs of severe nutritional deficiency (nails, skin).',
  'Identify and address trigger: iron, ferritin, thyroid, vitamin D, zinc levels. Gentle hair handling — no tight styles, minimize heat. Minoxidil 2% can reduce shed duration. Reassure patient — TE is self-limiting.',
  'hair'),

('telogen_effluvium', '31-90', 'Shedding Stabilization',
  'Shedding rate decreasing. Scalp density stable. New anagen hairs (short, fine hairs) visible at hairline and parting. Overall volume begins recovering. Full regrowth takes 6-12 months.',
  'hotspot=true if: shedding is not reducing, new patchy areas appearing (suspect concurrent AA), iron/ferritin remains critically low (<30 ng/mL), or thyroid abnormality identified.',
  'Continue supplementation per lab results. If iron deficient: continue supplementation for 3-6 months post-normalization. Scalp massage 5 minutes daily to stimulate circulation. Follow up labs at 3 months.',
  'hair'),

('telogen_effluvium', '91-270', 'Regrowth Phase',
  'Active regrowth of telogen-shed follicles. Hair volume progressively improving. Texture may temporarily change — new hairs often wavier/different. Full density restoration expected by month 9-12.',
  'hotspot=true if: density not improving by month 5, chronic TE suspected (ongoing trigger), or patient developing anxiety/depression around hair loss requiring referral.',
  'Maintain nutritional optimization. Minoxidil can be tapered at month 6 if shedding resolved. Celebrate progress — TE prognosis is excellent. Final photograph comparison at month 9.',
  'hair');

-- ─── Doctor ────────────────────────────────────────────────

INSERT INTO org_care_demo.doctors (id, name, specialty, clinic_name, clinic_location, email, phone)
VALUES (
  'dr-martinez-001',
  'Dr. Sofia Martinez',
  'Dermatology',
  'ClearSkin Medical',
  'San Francisco, CA',
  'dr.martinez@careai.demo',
  '+1 (415) 555-0101'
);

-- ─── Demo Patients ─────────────────────────────────────────
-- Patient 1: Acne — Day 32 (active treatment phase, yellow status)

INSERT INTO org_care_demo.patients (
  id, name, age, gender, email, doctor_id,
  treatment_name, treatment_description, treatment_start_date,
  current_day, status, adherence_percent, prescribed_products, condition
) VALUES (
  'demo-patient-acne-1',
  'Priya Sharma',
  24, 'Female',
  'priya@careai.demo',
  'dr-martinez-001',
  'Acne Vulgaris Protocol',
  'Moderate inflammatory acne — tretinoin 0.05% + clindamycin gel combination therapy',
  (CURRENT_DATE - INTERVAL '31 days')::TEXT,
  32, 'yellow', 88.0,
  '["Tretinoin 0.05% (PM)", "Clindamycin Gel 1% (AM)", "CeraVe Moisturizer (AM+PM)", "EltaMD UV Clear SPF 46 (AM)"]',
  'acne'
);

-- Patient 2: Acne — Day 8 (purge phase, green)

INSERT INTO org_care_demo.patients (
  id, name, age, gender, email, doctor_id,
  treatment_name, treatment_description, treatment_start_date,
  current_day, status, adherence_percent, prescribed_products, condition
) VALUES (
  'demo-patient-acne-2',
  'Marcus Johnson',
  19, 'Male',
  'marcus@careai.demo',
  'dr-martinez-001',
  'Acne Vulgaris Protocol',
  'Mild-moderate comedonal and inflammatory acne — adapalene 0.3% + benzoyl peroxide',
  (CURRENT_DATE - INTERVAL '7 days')::TEXT,
  8, 'green', 100.0,
  '["Epiduo Forte Gel (PM)", "La Roche-Posay Moisturizer (AM+PM)", "Neutrogena Hydro Boost SPF 30 (AM)"]',
  'acne'
);

-- Patient 3: Post-Laser — Day 5 (crusting phase, red status — monitoring closely)

INSERT INTO org_care_demo.patients (
  id, name, age, gender, email, doctor_id,
  treatment_name, treatment_description, treatment_start_date,
  current_day, status, adherence_percent, prescribed_products, condition
) VALUES (
  'demo-patient-laser-1',
  'Sarah Chen',
  38, 'Female',
  'sarah@careai.demo',
  'dr-martinez-001',
  'Post-CO2 Laser Recovery',
  'Full-face fractional CO2 resurfacing for photoaging and acne scarring — intense protocol',
  (CURRENT_DATE - INTERVAL '4 days')::TEXT,
  5, 'red', 95.0,
  '["Vaseline Petroleum Jelly (q3h)", "Cetaphil Gentle Cleanser (2x daily)", "Prescribed antibiotic ointment (PM)"]',
  'laser_recovery'
);

-- ─── Seed checkins for Priya (days 1, 15, 30, 31) ─────────

INSERT INTO org_care_demo.checkins
  (id, patient_id, day_number, checkin_date, status, symptoms_reported, adherence_today,
   ai_headline, ai_summary, ai_zone_analysis, ai_suggested_actions, quality_score)
VALUES
(
  'ci-priya-d1',
  'demo-patient-acne-1', 1,
  (CURRENT_DATE - INTERVAL '31 days')::TIMESTAMPTZ,
  'green', NULL, true,
  'Treatment Day 1 — Baseline recorded',
  'Skin is at baseline. Mild comedonal acne distributed across forehead and both cheeks. No active pustules. Starting tretinoin tonight.',
  '{"forehead":{"redness":1,"swelling":0,"texture_concern":1,"hotspot":false},"left_cheek":{"redness":1,"swelling":0,"texture_concern":2,"hotspot":false},"right_cheek":{"redness":1,"swelling":0,"texture_concern":2,"hotspot":false},"nose_tzone":{"redness":1,"swelling":0,"texture_concern":1,"hotspot":false},"perioral":{"redness":0,"swelling":0,"texture_concern":0,"hotspot":false},"chin":{"redness":1,"swelling":0,"texture_concern":1,"hotspot":false}}',
  'Continue as prescribed. Apply tretinoin pea-size to dry skin 20 mins after cleansing.',
  82
),
(
  'ci-priya-d15',
  'demo-patient-acne-1', 15,
  (CURRENT_DATE - INTERVAL '17 days')::TIMESTAMPTZ,
  'yellow', 'Dryness / flaking, Redness / erythema', true,
  'Purge Response — Within Normal Range',
  'Moderate purge reaction visible with 4-5 new inflammatory papules on left cheek and forehead. Peeling around nose and chin. This is expected and indicates tretinoin is working.',
  '{"forehead":{"redness":2,"swelling":1,"texture_concern":2,"hotspot":false},"left_cheek":{"redness":2,"swelling":2,"texture_concern":2,"hotspot":true},"right_cheek":{"redness":1,"swelling":1,"texture_concern":1,"hotspot":false},"nose_tzone":{"redness":2,"swelling":0,"texture_concern":3,"hotspot":false},"perioral":{"redness":1,"swelling":0,"texture_concern":1,"hotspot":false},"chin":{"redness":1,"swelling":0,"texture_concern":2,"hotspot":false}}',
  'The purge is expected. Increase moisturizer frequency. Do NOT increase tretinoin strength. Avoid physical exfoliation. If burning becomes severe, skip 1 night.',
  79
),
(
  'ci-priya-d31',
  'demo-patient-acne-1', 32,
  (CURRENT_DATE - INTERVAL '1 day')::TIMESTAMPTZ,
  'yellow', 'Redness / erythema', true,
  'Good Progress — Residual PIH Visible',
  'Active breakout count has reduced significantly from peak. 2 active papules remain on left cheek. Post-inflammatory hyperpigmentation visible on both cheeks — this is expected and will fade.',
  '{"forehead":{"redness":1,"swelling":0,"texture_concern":1,"hotspot":false},"left_cheek":{"redness":2,"swelling":1,"texture_concern":2,"hotspot":false},"right_cheek":{"redness":1,"swelling":0,"texture_concern":2,"hotspot":false},"nose_tzone":{"redness":1,"swelling":0,"texture_concern":1,"hotspot":false},"perioral":{"redness":0,"swelling":0,"texture_concern":0,"hotspot":false},"chin":{"redness":1,"swelling":0,"texture_concern":1,"hotspot":false}}',
  'Excellent progress at day 32. Maintain regimen. Consider adding vitamin C serum in AM for PIH. Stay consistent — full clearance typically at 6-8 weeks.',
  91
);

-- ─── Seed checkins for Sarah (laser, days 1-4) ─────────────

INSERT INTO org_care_demo.checkins
  (id, patient_id, day_number, checkin_date, status, symptoms_reported, adherence_today,
   ai_headline, ai_summary, ai_zone_analysis, ai_suggested_actions, quality_score)
VALUES
(
  'ci-sarah-d1',
  'demo-patient-laser-1', 1,
  (CURRENT_DATE - INTERVAL '4 days')::TIMESTAMPTZ,
  'yellow', 'Swelling / edema, Burning sensation', true,
  'Post-Laser Day 1 — Expected Acute Response',
  'Significant erythema and edema across all treated zones, consistent with expected post-ablative CO2 response. No signs of infection. Patient reporting manageable discomfort.',
  '{"forehead":{"redness":3,"swelling":3,"texture_concern":1,"hotspot":false},"left_cheek":{"redness":3,"swelling":3,"texture_concern":1,"hotspot":false},"right_cheek":{"redness":3,"swelling":3,"texture_concern":1,"hotspot":false},"nose_tzone":{"redness":2,"swelling":2,"texture_concern":1,"hotspot":false},"perioral":{"redness":2,"swelling":2,"texture_concern":0,"hotspot":false},"chin":{"redness":2,"swelling":2,"texture_concern":0,"hotspot":false}}',
  'This is within expected range for day 1 post-CO2. Maintain ointment q3h. Sleep elevated (30°). Cold compresses as needed. Call clinic immediately if fever >38C or any purulent discharge.',
  74
),
(
  'ci-sarah-d4',
  'demo-patient-laser-1', 4,
  (CURRENT_DATE - INTERVAL '1 day')::TIMESTAMPTZ,
  'red', 'Swelling / edema, Crusting, Burning sensation, Itching', true,
  '⚠ Day 4 — Crusting Heavy, Watch Right Cheek',
  'Dense crusting forming across all zones — normal for day 4 post-CO2. However, right cheek shows denser, darker crusting with slight asymmetry compared to left. Swelling reducing as expected. Itching suggests re-epithelialization starting.',
  '{"forehead":{"redness":2,"swelling":2,"texture_concern":2,"hotspot":false},"left_cheek":{"redness":2,"swelling":2,"texture_concern":3,"hotspot":false},"right_cheek":{"redness":3,"swelling":2,"texture_concern":3,"hotspot":true},"nose_tzone":{"redness":2,"swelling":1,"texture_concern":2,"hotspot":false},"perioral":{"redness":1,"swelling":1,"texture_concern":1,"hotspot":false},"chin":{"redness":2,"swelling":1,"texture_concern":2,"hotspot":false}}',
  'Right cheek hotspot flagged for doctor review — heavier crusting than left side. Do NOT pick any crusts. Continue ointment q3h. Itching is normal and means healing is progressing. Use cool mist spray for relief.',
  88
);

-- ─── Alert for Sarah ───────────────────────────────────────

INSERT INTO org_care_demo.alerts (
  id, patient_id, severity, title, ai_analysis, suggested_actions,
  patient_context, created_at, resolved
) VALUES (
  'alert-sarah-d4',
  'demo-patient-laser-1',
  'red',
  'Day 4: Asymmetric Crusting — Right Cheek',
  'AI assessment flagged asymmetric crusting on right cheek (heavier, darker than left side). Swelling is reducing normally. No signs of purulent infection currently, but asymmetry warrants clinical review to rule out localized complication.',
  'Review check-in photo. Compare bilateral cheek healing. Consider scheduling telemedicine call or in-person review if asymmetry persists to day 6. Patient is adhering 100%.',
  'Day 5 post full-face CO2. Intense protocol. First-time laser patient.',
  (CURRENT_DATE - INTERVAL '1 day')::TIMESTAMPTZ,
  false
);

-- ─── Messages for Priya ────────────────────────────────────

INSERT INTO org_care_demo.messages (patient_id, sender, content, message_type, timestamp, is_read)
VALUES
('demo-patient-acne-1', 'aisha', 'Hi Priya! Welcome to Care.ai. I''m Aisha, your AI care nurse. I''ll be checking in with you daily throughout your treatment. How are you feeling about starting your regimen?', 'text', (CURRENT_DATE - INTERVAL '31 days')::TIMESTAMPTZ, true),
('demo-patient-acne-1', 'patient', 'A bit nervous about the purge phase I''ve read about. Is it really going to get worse before it gets better?', 'text', (CURRENT_DATE - INTERVAL '31 days')::TIMESTAMPTZ + INTERVAL '2 hours', true),
('demo-patient-acne-1', 'aisha', 'Completely normal to feel that way! Yes — a purge phase is common with tretinoin, usually weeks 2-6. It happens because the medication accelerates cell turnover, bringing congestion to the surface faster. It''s actually a sign the treatment is working. I''ll monitor your photos closely and alert Dr. Martinez if anything looks outside the expected range. You''ve got this! 💪', 'text', (CURRENT_DATE - INTERVAL '31 days')::TIMESTAMPTZ + INTERVAL '2 hours 5 min', true),
('demo-patient-acne-1', 'doctor', 'Hi Priya — Dr. Martinez here. Reviewed your day 15 check-in. The purge response you''re seeing is textbook — well within normal range for week 2 of tretinoin. Keep going! The discomfort now is worth it. See you at your 8-week follow-up.', 'text', (CURRENT_DATE - INTERVAL '17 days')::TIMESTAMPTZ, true);


-- ============================================================
-- Additional demo patients — mirrored from CareCompanion demo
-- Same patients, same stories, now in the Care.ai Supabase stack.
-- Emails: ritika@careai.demo | arjun@careai.demo | meera@careai.demo
-- ============================================================

-- ─── Patient 4: Ritika Sharma — Androgenic Alopecia, Day 45 (green, early response) ──

INSERT INTO org_care_demo.patients (
  id, name, age, gender, email, doctor_id,
  treatment_name, treatment_description, treatment_start_date,
  current_day, status, adherence_percent, prescribed_products, condition
) VALUES (
  'demo-patient-laser-ritika',
  'Ritika Sharma',
  28, 'Female',
  'ritika@careai.demo',
  'dr-martinez-001',
  'Female Pattern Hair Loss — Minoxidil Protocol',
  'Androgenic alopecia (Ludwig Grade II) — topical minoxidil 5% once daily + biotin supplementation. Goal: stabilize crown thinning and stimulate regrowth.',
  (CURRENT_DATE - INTERVAL '44 days')::TEXT,
  45, 'green', 94.0,
  '["Minoxidil 5% Solution (once daily, scalp)", "Biotin 5000mcg (daily, oral)", "Iron + Vitamin C (daily, oral — if ferritin <50)", "Gentle sulfate-free shampoo (2-3x/week)"]',
  'androgenic_alopecia'
);

-- Ritika's check-ins (days 1, 3, 7, 14)

INSERT INTO org_care_demo.checkins
  (id, patient_id, day_number, checkin_date, status, symptoms_reported, adherence_today,
   ai_headline, ai_summary, ai_zone_analysis, ai_suggested_actions, quality_score)
VALUES
(
  'ci-ritika-d1', 'demo-patient-laser-ritika', 1,
  (CURRENT_DATE - INTERVAL '13 days')::TIMESTAMPTZ,
  'green', 'Mild redness, slight tingling sensation. No blistering.', true,
  'Day 1 Post-Fractional CO2 — Within Normal Parameters',
  'Uniform mild erythema across both cheeks. Grid pattern from fractional laser visible. No vesicles or adverse signs. Presentation is fully expected for day 1 post-ablative treatment.',
  '{"forehead":{"redness":1,"swelling":1,"texture_concern":0,"hotspot":false},"left_cheek":{"redness":2,"swelling":2,"texture_concern":1,"hotspot":false},"right_cheek":{"redness":2,"swelling":2,"texture_concern":1,"hotspot":false},"nose_tzone":{"redness":1,"swelling":1,"texture_concern":0,"hotspot":false},"perioral":{"redness":0,"swelling":0,"texture_concern":0,"hotspot":false},"chin":{"redness":1,"swelling":1,"texture_concern":0,"hotspot":false}}',
  'No action required. Continue prescribed regimen. Maintain ointment every 2-3 hours. Next check-in: Day 3.',
  80
),
(
  'ci-ritika-d3', 'demo-patient-laser-ritika', 3,
  (CURRENT_DATE - INTERVAL '11 days')::TIMESTAMPTZ,
  'green', 'Redness reducing. Mild tightness. No pain.', true,
  'Day 3 — Redness Subsiding, Early Peeling Beginning',
  'Erythema reducing from day 1. Early desquamation beginning at treatment margins — normal healing progression. Patient fully adherent to prescribed products.',
  '{"forehead":{"redness":1,"swelling":1,"texture_concern":1,"hotspot":false},"left_cheek":{"redness":2,"swelling":1,"texture_concern":2,"hotspot":false},"right_cheek":{"redness":2,"swelling":1,"texture_concern":2,"hotspot":false},"nose_tzone":{"redness":1,"swelling":0,"texture_concern":1,"hotspot":false},"perioral":{"redness":0,"swelling":0,"texture_concern":0,"hotspot":false},"chin":{"redness":1,"swelling":0,"texture_concern":1,"hotspot":false}}',
  'No action required. Advise patient not to pick at peeling skin. Continue cool water cleansing 2x daily. Next check-in: Day 7.',
  85
),
(
  'ci-ritika-d7', 'demo-patient-laser-ritika', 7,
  (CURRENT_DATE - INTERVAL '7 days')::TIMESTAMPTZ,
  'green', 'Active peeling. Skin feels tight but no pain. New pink skin visible.', true,
  'Day 7 — Active Peeling Phase, Excellent Healing Trajectory',
  'Active desquamation phase with old epidermis shedding. New pink epithelium visible underneath. Acne scar texture already visibly smoother than baseline. 96% adherence this week.',
  '{"forehead":{"redness":1,"swelling":0,"texture_concern":1,"hotspot":false},"left_cheek":{"redness":1,"swelling":0,"texture_concern":2,"hotspot":false},"right_cheek":{"redness":1,"swelling":0,"texture_concern":2,"hotspot":false},"nose_tzone":{"redness":1,"swelling":0,"texture_concern":1,"hotspot":false},"perioral":{"redness":0,"swelling":0,"texture_concern":0,"hotspot":false},"chin":{"redness":1,"swelling":0,"texture_concern":1,"hotspot":false}}',
  'No action required. Reinforce: do not pick at peeling skin. Ensure sunscreen every 3 hours. Next check-in: Day 14.',
  90
),
(
  'ci-ritika-d14', 'demo-patient-laser-ritika', 14,
  (CURRENT_DATE)::TIMESTAMPTZ,
  'green', 'Peeling complete. Skin smooth and even. Very happy with results.', true,
  'Day 14 — Peeling Complete, Significant Scar Improvement',
  'Peeling phase complete. New epithelium fully formed. Visible reduction in acne scar depth and texture irregularity. Skin tone evening out. Excellent result for first session — 94% adherence throughout.',
  '{"forehead":{"redness":0,"swelling":0,"texture_concern":0,"hotspot":false},"left_cheek":{"redness":1,"swelling":0,"texture_concern":1,"hotspot":false},"right_cheek":{"redness":1,"swelling":0,"texture_concern":1,"hotspot":false},"nose_tzone":{"redness":0,"swelling":0,"texture_concern":0,"hotspot":false},"perioral":{"redness":0,"swelling":0,"texture_concern":0,"hotspot":false},"chin":{"redness":0,"swelling":0,"texture_concern":0,"hotspot":false}}',
  'Transition to gentle daily skincare. Continue SPF 50+ indefinitely. Schedule follow-up for second session planning at week 6. Excellent recovery.',
  95
);

-- Ritika's messages

INSERT INTO org_care_demo.messages (patient_id, sender, content, message_type, timestamp, is_read)
VALUES
('demo-patient-laser-ritika', 'aisha', 'Hi Ritika! I''m Aisha, your Care.ai recovery companion. Dr. Martinez has enrolled you for post-treatment monitoring after your fractional CO2 laser session today. I''ll check in regularly to make sure everything heals perfectly. 💙', 'text', (CURRENT_DATE - INTERVAL '14 days')::TIMESTAMPTZ, true),
('demo-patient-laser-ritika', 'aisha', 'Good morning! Day 1 check-in — how is your skin feeling? Any burning or tingling?', 'text', (CURRENT_DATE - INTERVAL '13 days')::TIMESTAMPTZ, true),
('demo-patient-laser-ritika', 'patient', 'Some mild redness and a bit of tingling but nothing too bad', 'text', (CURRENT_DATE - INTERVAL '13 days')::TIMESTAMPTZ + INTERVAL '30 min', true),
('demo-patient-laser-ritika', 'aisha', 'That''s completely normal for Day 1! Mild redness and tingling are expected and will start subsiding over the next couple of days. Have you applied the fusidic acid cream that Dr. Martinez prescribed?', 'text', (CURRENT_DATE - INTERVAL '13 days')::TIMESTAMPTZ + INTERVAL '35 min', true),
('demo-patient-laser-ritika', 'patient', 'Yes applied it this morning and using the moisturizer regularly', 'text', (CURRENT_DATE - INTERVAL '13 days')::TIMESTAMPTZ + INTERVAL '40 min', true),
('demo-patient-laser-ritika', 'aisha', 'Perfect! You''re doing everything right. Remember sunscreen every 3 hours while outdoors — your skin is very photosensitive right now. 💙', 'text', (CURRENT_DATE - INTERVAL '13 days')::TIMESTAMPTZ + INTERVAL '42 min', true),
('demo-patient-laser-ritika', 'aisha', 'Day 7 milestone! How''s the peeling going?', 'text', (CURRENT_DATE - INTERVAL '7 days')::TIMESTAMPTZ, true),
('demo-patient-laser-ritika', 'patient', 'A lot of peeling but I can see new pink skin underneath. It looks so much better already!', 'text', (CURRENT_DATE - INTERVAL '7 days')::TIMESTAMPTZ + INTERVAL '1 hour', true),
('demo-patient-laser-ritika', 'aisha', 'Amazing progress, Ritika! That''s exactly what we want to see — old skin shedding, fresh new skin emerging. Your 96% adherence this week is showing results. No picking at the peeling skin, no matter how tempting! 💪 See you at Day 14. 💙', 'text', (CURRENT_DATE - INTERVAL '7 days')::TIMESTAMPTZ + INTERVAL '1 hour 10 min', true),
('demo-patient-laser-ritika', 'aisha', '🎉 Day 14 — two weeks post-treatment! This is a milestone. How are you feeling?', 'text', (CURRENT_DATE)::TIMESTAMPTZ, false),
('demo-patient-laser-ritika', 'patient', 'So happy! The peeling is completely done and the acne scars are way less visible. My skin looks amazing!', 'text', (CURRENT_DATE)::TIMESTAMPTZ + INTERVAL '2 hours', false),
('demo-patient-laser-ritika', 'doctor', 'Ritika — Dr. Martinez here. Reviewed your Day 14 photos — remarkable improvement! Your healing has been textbook perfect with 94% adherence. We can schedule your second session in about 4 weeks. Very pleased with your results.', 'text', (CURRENT_DATE)::TIMESTAMPTZ + INTERVAL '3 hours', false);


-- ─── Patient 5: Arjun Patel — Androgenic Alopecia, Day 75 (yellow, plateau concern) ──

INSERT INTO org_care_demo.patients (
  id, name, age, gender, email, doctor_id,
  treatment_name, treatment_description, treatment_start_date,
  current_day, status, adherence_percent, prescribed_products, condition
) VALUES (
  'demo-patient-laser-arjun',
  'Arjun Patel',
  34, 'Male',
  'arjun@careai.demo',
  'dr-martinez-001',
  'Male Pattern Baldness — Combination Protocol',
  'Androgenic alopecia (Norwood III vertex) — minoxidil 5% + oral finasteride 1mg daily. Target zones: crown and temporal recession.',
  (CURRENT_DATE - INTERVAL '74 days')::TEXT,
  75, 'yellow', 71.0,
  '["Minoxidil 5% Foam (once daily, crown + temples)", "Finasteride 1mg (once daily, oral, with food)", "Ketoconazole 2% Shampoo (2x/week)", "Biotin 2500mcg (daily, oral)"]',
  'androgenic_alopecia'
);

-- Arjun's check-ins

INSERT INTO org_care_demo.checkins
  (id, patient_id, day_number, checkin_date, status, symptoms_reported, adherence_today,
   ai_headline, ai_summary, ai_zone_analysis, ai_suggested_actions, quality_score)
VALUES
(
  'ci-arjun-d1', 'demo-patient-laser-arjun', 1,
  (CURRENT_DATE - INTERVAL '6 days')::TIMESTAMPTZ,
  'green', 'Mild redness and warmth. Treated spots appear darker — expected.', true,
  'Day 1 Post-Q-Switch — Normal Post-Treatment Presentation',
  'Post-Q-switch presentation is normal. Target lesions appear darker due to micro-crusting — this indicates successful melanin targeting. Surrounding skin shows mild erythema. No adverse signs.',
  '{"forehead":{"redness":2,"swelling":1,"texture_concern":1,"hotspot":false},"left_cheek":{"redness":2,"swelling":1,"texture_concern":1,"hotspot":false},"right_cheek":{"redness":2,"swelling":1,"texture_concern":1,"hotspot":false},"nose_tzone":{"redness":1,"swelling":0,"texture_concern":0,"hotspot":false},"perioral":{"redness":0,"swelling":0,"texture_concern":0,"hotspot":false},"chin":{"redness":1,"swelling":0,"texture_concern":0,"hotspot":false}}',
  'No action required. The darkening spots are expected and will flake off in a few days. Continue prescribed regimen. Sunscreen critical — every 3 hours. Next check-in: Day 3.',
  82
),
(
  'ci-arjun-d3', 'demo-patient-laser-arjun', 3,
  (CURRENT_DATE - INTERVAL '4 days')::TIMESTAMPTZ,
  'green', 'Dark spots starting to flake. Mild itching. No pain.', true,
  'Day 3 — Micro-Crusts Shedding, On Schedule',
  'Micro-crusts from Q-switch beginning to shed on schedule. Underlying skin shows early lightening response. Mild itching is expected and indicates healing. Patient compliant with regimen.',
  '{"forehead":{"redness":1,"swelling":0,"texture_concern":1,"hotspot":false},"left_cheek":{"redness":1,"swelling":0,"texture_concern":2,"hotspot":false},"right_cheek":{"redness":1,"swelling":0,"texture_concern":2,"hotspot":false},"nose_tzone":{"redness":1,"swelling":0,"texture_concern":0,"hotspot":false},"perioral":{"redness":0,"swelling":0,"texture_concern":0,"hotspot":false},"chin":{"redness":0,"swelling":0,"texture_concern":0,"hotspot":false}}',
  'Do not scratch itching areas — use gentle patting or cool compress. Next check-in: Day 7.',
  80
),
(
  'ci-arjun-d5', 'demo-patient-laser-arjun', 5,
  (CURRENT_DATE - INTERVAL '2 days')::TIMESTAMPTZ,
  'yellow', 'Applied non-prescribed fairness cream. Some new unevenness.', false,
  '⚠ Day 5 — Non-Prescribed Product Applied, Monitoring for PIH',
  'Patient applied non-prescribed fairness cream on Q-switch lasered skin at Day 5. Post-laser skin is photosensitive and barrier-compromised. Risk of post-inflammatory hyperpigmentation (PIH) and chemical irritation. Uneven tone already visible.',
  '{"forehead":{"redness":2,"swelling":0,"texture_concern":2,"hotspot":true},"left_cheek":{"redness":2,"swelling":1,"texture_concern":2,"hotspot":true},"right_cheek":{"redness":2,"swelling":1,"texture_concern":2,"hotspot":false},"nose_tzone":{"redness":1,"swelling":0,"texture_concern":1,"hotspot":false},"perioral":{"redness":0,"swelling":0,"texture_concern":0,"hotspot":false},"chin":{"redness":1,"swelling":0,"texture_concern":1,"hotspot":false}}',
  'STOP all non-prescribed products immediately. Use only prescribed regimen from this point. Monitor for PIH at Day 14. Alert sent to Dr. Martinez.',
  78
),
(
  'ci-arjun-d7', 'demo-patient-laser-arjun', 7,
  (CURRENT_DATE)::TIMESTAMPTZ,
  'yellow', 'Slight uneven tone visible. Recovering after stopping non-prescribed cream.', true,
  'Day 7 — Uneven Tone Persisting, Compliant Since Day 5 Intervention',
  'Some uneven pigmentation consistent with early PIH from Day 5 chemical irritation. Patient has discontinued non-prescribed product and returned to full compliance. Monitoring required at Day 14 to assess PIH progression.',
  '{"forehead":{"redness":1,"swelling":0,"texture_concern":2,"hotspot":false},"left_cheek":{"redness":2,"swelling":0,"texture_concern":2,"hotspot":true},"right_cheek":{"redness":1,"swelling":0,"texture_concern":2,"hotspot":false},"nose_tzone":{"redness":1,"swelling":0,"texture_concern":1,"hotspot":false},"perioral":{"redness":0,"swelling":0,"texture_concern":0,"hotspot":false},"chin":{"redness":0,"swelling":0,"texture_concern":1,"hotspot":false}}',
  'Continue monitoring. If PIH worsens, consider hydroquinone-free brightening serum and enhanced SPF protocol. Review at Day 14.',
  85
);

-- Alert for Arjun

INSERT INTO org_care_demo.alerts (
  id, patient_id, severity, title, ai_analysis, suggested_actions,
  patient_context, created_at, resolved
) VALUES (
  'alert-arjun-d5',
  'demo-patient-laser-arjun',
  'yellow',
  'Day 5: Non-Prescribed Product Used on Treated Skin',
  'Patient applied non-prescribed fairness cream (likely contains hydroquinone/mercury compounds) on Q-switch lasered skin at Day 5. Post-laser skin is photosensitive and barrier-compromised. Risk: post-inflammatory hyperpigmentation (PIH), chemical irritation, delayed healing.',
  'Send message reinforcing prescribed-only topical use. Monitor for PIH development at Day 14 check-in. Advise immediate discontinuation of non-prescribed product.',
  'Arjun Patel, 34M. Q-Switch Laser for pigmentation, Day 5. 71% adherence. Patient mentioned using fairness cream casually in chat.',
  (CURRENT_DATE - INTERVAL '2 days')::TIMESTAMPTZ,
  true
);

-- Arjun's messages

INSERT INTO org_care_demo.messages (patient_id, sender, content, message_type, timestamp, is_read)
VALUES
('demo-patient-laser-arjun', 'aisha', 'Hi Arjun! I''m Aisha from Care.ai. Dr. Martinez has set up post-treatment monitoring for your Q-switch laser session. I''ll check in regularly to track your progress. 💙', 'text', (CURRENT_DATE - INTERVAL '7 days')::TIMESTAMPTZ, true),
('demo-patient-laser-arjun', 'aisha', 'Day 1 check-in — how''s your skin feeling after the laser session?', 'text', (CURRENT_DATE - INTERVAL '6 days')::TIMESTAMPTZ, true),
('demo-patient-laser-arjun', 'patient', 'Some redness and the spots look darker actually. Is that normal?', 'text', (CURRENT_DATE - INTERVAL '6 days')::TIMESTAMPTZ + INTERVAL '1 hour', true),
('demo-patient-laser-arjun', 'aisha', 'Yes, completely normal! After Q-switch laser, the treated pigment spots darken temporarily — this is called micro-crusting and means the laser targeted the melanin correctly. They''ll start to flake off in a few days. Are you applying sunscreen every 3 hours? This is critical for Q-switch recovery.', 'text', (CURRENT_DATE - INTERVAL '6 days')::TIMESTAMPTZ + INTERVAL '1 hour 5 min', true),
('demo-patient-laser-arjun', 'patient', 'Yes I applied it this morning. And used the tretinoin last night', 'text', (CURRENT_DATE - INTERVAL '6 days')::TIMESTAMPTZ + INTERVAL '2 hours', true),
('demo-patient-laser-arjun', 'patient', 'Hey Aisha, I used some fairness cream today. Should be fine right? Just want to speed up the lightening', 'text', (CURRENT_DATE - INTERVAL '2 days')::TIMESTAMPTZ + INTERVAL '6 hours', true),
('demo-patient-laser-arjun', 'aisha', '⚠️ Arjun, please use ONLY the products prescribed by Dr. Martinez right now. Fairness creams can contain chemicals like hydroquinone or mercury that can cause post-inflammatory hyperpigmentation (PIH) on laser-treated skin that is still healing. Please stop using it immediately — I''m letting Dr. Martinez know.', 'text', (CURRENT_DATE - INTERVAL '2 days')::TIMESTAMPTZ + INTERVAL '6 hours 2 min', true),
('demo-patient-laser-arjun', 'patient', 'Oh okay sorry I didn''t know. I''ll stop using it right away', 'text', (CURRENT_DATE - INTERVAL '2 days')::TIMESTAMPTZ + INTERVAL '6 hours 10 min', true),
('demo-patient-laser-arjun', 'doctor', 'Arjun — Dr. Martinez here. Please only use what I prescribed. Fairness creams contain chemicals that can cause dark patches on lasered skin. Stop immediately and continue with only your prescribed routine. We''ll monitor closely at Day 14.', 'text', (CURRENT_DATE - INTERVAL '2 days')::TIMESTAMPTZ + INTERVAL '8 hours', true),
('demo-patient-laser-arjun', 'patient', 'Understood doctor. Won''t use anything else. Sorry about that', 'text', (CURRENT_DATE - INTERVAL '2 days')::TIMESTAMPTZ + INTERVAL '8 hours 30 min', true);


-- ─── Patient 6: Meera Kapoor — Telogen Effluvium, Day 21 (red, heavy shedding) ──

INSERT INTO org_care_demo.patients (
  id, name, age, gender, email, doctor_id,
  treatment_name, treatment_description, treatment_start_date,
  current_day, status, adherence_percent, prescribed_products, condition
) VALUES (
  'demo-patient-laser-meera',
  'Meera Kapoor',
  42, 'Female',
  'meera@careai.demo',
  'dr-martinez-001',
  'Post-Stress Telogen Effluvium Recovery',
  'Diffuse hair shedding triggered by hormonal stress (perimenopause onset). Ferritin 18 ng/mL (low). Treatment: iron supplementation + minoxidil 2% to shorten shedding phase.',
  (CURRENT_DATE - INTERVAL '20 days')::TEXT,
  21, 'red', 100.0,
  '["Iron Bisglycinate 36mg (daily, oral — take with Vitamin C)", "Vitamin C 500mg (with iron, oral)", "Minoxidil 2% Solution (once daily, crown + parting)", "Vitamin D3 2000IU (daily, oral — level was deficient)"]',
  'telogen_effluvium'
);

-- Meera's check-ins

INSERT INTO org_care_demo.checkins
  (id, patient_id, day_number, checkin_date, status, symptoms_reported, adherence_today,
   ai_headline, ai_summary, ai_zone_analysis, ai_suggested_actions, quality_score)
VALUES
(
  'ci-meera-d1', 'demo-patient-laser-meera', 1,
  (CURRENT_DATE - INTERVAL '2 days')::TIMESTAMPTZ,
  'green', 'Mild redness and tingling. Some warmth in treated area. Normal.', true,
  'Day 1 Post-Fractional CO2 — Expected Response, Melasma Patient',
  'Mild erythema on bilateral cheeks. Melasma patches show expected post-laser darkening — this is transient. Conservative parameters appear well-tolerated. No adverse signs.',
  '{"forehead":{"redness":1,"swelling":1,"texture_concern":0,"hotspot":false},"left_cheek":{"redness":2,"swelling":2,"texture_concern":1,"hotspot":false},"right_cheek":{"redness":2,"swelling":2,"texture_concern":1,"hotspot":false},"nose_tzone":{"redness":1,"swelling":1,"texture_concern":0,"hotspot":false},"perioral":{"redness":0,"swelling":0,"texture_concern":0,"hotspot":false},"chin":{"redness":1,"swelling":1,"texture_concern":0,"hotspot":false}}',
  'Normal Day 1 presentation. Continue prescribed regimen. Note: melasma-prone skin requires extra vigilance for rebound hyperpigmentation. Sunscreen every 2 hours. Next check-in: Day 3.',
  78
),
(
  'ci-meera-d3', 'demo-patient-laser-meera', 3,
  (CURRENT_DATE)::TIMESTAMPTZ,
  'red', 'Blistering on left cheek. Severe burning sensation. Patient very distressed.', true,
  '🔴 Day 3 — BLISTERING on Left Cheek — Urgent Clinical Review Required',
  'Vesicle formation on left cheek (approx 1.5cm diameter) with acute burning. Right cheek healing normally. Asymmetric presentation suggests localized thermal injury or contact dermatitis. Blistering at Day 3 is not expected in normal healing for conservative CO2 parameters. Immediate escalation required.',
  '{"forehead":{"redness":1,"swelling":1,"texture_concern":0,"hotspot":false},"left_cheek":{"redness":3,"swelling":3,"texture_concern":3,"hotspot":true},"right_cheek":{"redness":2,"swelling":1,"texture_concern":1,"hotspot":false},"nose_tzone":{"redness":1,"swelling":1,"texture_concern":0,"hotspot":false},"perioral":{"redness":0,"swelling":0,"texture_concern":0,"hotspot":false},"chin":{"redness":1,"swelling":0,"texture_concern":0,"hotspot":false}}',
  'HOLD all topical applications on blistered area. Do not touch or press blister. Keep area clean and dry. Stay indoors. Dr. Martinez notified for urgent review — expect callback within 30 minutes.',
  82
);

-- RED alert for Meera

INSERT INTO org_care_demo.alerts (
  id, patient_id, severity, title, ai_analysis, suggested_actions,
  patient_context, created_at, resolved
) VALUES (
  'alert-meera-d3',
  'demo-patient-laser-meera',
  'red',
  '⚠ Day 3: Blistering on Left Cheek — Possible Thermal Injury',
  'Day 3 post-fractional CO2 for melasma. Patient presents vesicle formation on left cheek with acute burning. Likely thermal injury — could indicate over-aggressive treatment parameters on melasma-prone skin, or contact dermatitis from topical application. Melasma skin is more reactive; blistering at Day 3 is not expected in normal healing. Asymmetric presentation (left cheek only) may suggest localized over-treatment or focal contact reaction.',
  'Immediate patient callback. In-person review within 24 hours. Hold ALL topical applications until examined. Consider topical steroid (mometasone 0.1%) for inflammation + antibiotic prophylaxis if vesicles are open. Document for potential parameter adjustment in future sessions.',
  'Meera Kapoor, 42F. Fractional CO2 Laser for melasma, Day 3. 100% adherence. First-time laser patient. Melasma-prone skin.',
  (CURRENT_DATE)::TIMESTAMPTZ,
  false
);

-- Meera's messages

INSERT INTO org_care_demo.messages (patient_id, sender, content, message_type, timestamp, is_read)
VALUES
('demo-patient-laser-meera', 'aisha', 'Hi Meera! I''m Aisha from Care.ai. Dr. Martinez has enrolled you for post-treatment monitoring after your fractional CO2 laser session for melasma. I''ll be checking in regularly to track your recovery. 💙', 'text', (CURRENT_DATE - INTERVAL '3 days')::TIMESTAMPTZ, true),
('demo-patient-laser-meera', 'aisha', 'Good morning Meera! Day 1 check-in — how is your skin feeling after yesterday''s treatment?', 'text', (CURRENT_DATE - INTERVAL '2 days')::TIMESTAMPTZ, true),
('demo-patient-laser-meera', 'patient', 'There''s redness and some tingling. The melasma area looks darker', 'text', (CURRENT_DATE - INTERVAL '2 days')::TIMESTAMPTZ + INTERVAL '1 hour', true),
('demo-patient-laser-meera', 'aisha', 'That''s completely normal! Melasma patches often look darker immediately after laser — this is expected and temporary. The tingling should ease over the next 24 hours. Remember, sunscreen every 2 hours is especially important for melasma — sun exposure can trigger rebound darkening. 💙', 'text', (CURRENT_DATE - INTERVAL '2 days')::TIMESTAMPTZ + INTERVAL '1 hour 5 min', true),
('demo-patient-laser-meera', 'aisha', 'Hi Meera! Day 3 check-in. How are you feeling today?', 'text', (CURRENT_DATE)::TIMESTAMPTZ, false),
('demo-patient-laser-meera', 'patient', 'Aisha, I''m very worried. There''s a blister on my left cheek and it''s burning a lot. I''m scared', 'text', (CURRENT_DATE)::TIMESTAMPTZ + INTERVAL '15 min', false),
('demo-patient-laser-meera', 'aisha', '🔴 Meera, I''m sending your photos and report to Dr. Martinez right now as high priority. She will call you shortly. In the meantime: do NOT apply any cream on the blistered area, do NOT touch or press the blister, keep the area clean and dry, stay indoors away from sunlight. You did exactly the right thing by telling us immediately. Dr. Martinez will take excellent care of you. 💙', 'text', (CURRENT_DATE)::TIMESTAMPTZ + INTERVAL '16 min', false),
('demo-patient-laser-meera', 'patient', 'Okay I won''t touch it. Please tell doctor to call me soon', 'text', (CURRENT_DATE)::TIMESTAMPTZ + INTERVAL '18 min', false),
('demo-patient-laser-meera', 'aisha', 'Dr. Martinez has been notified with high priority and will call you within 30 minutes. She has also asked you to come in for an in-person review tomorrow. Stay calm — you''re in good hands. 💙', 'text', (CURRENT_DATE)::TIMESTAMPTZ + INTERVAL '20 min', false);

-- ============================================================
-- Second demo doctor (used by the doctor PWA demo login)
-- ============================================================

-- ── Dr. Priya Nair (Mumbai) owns the three hair-loss patients ──────────────
INSERT INTO org_care_demo.doctors (id, name, specialty, clinic_name, clinic_location, email, phone)
VALUES ('dr-priya-001', 'Dr. Priya Nair', 'Dermatology', 'ClearSkin Medical', 'Mumbai, MH',
        'dr.priya@careai.demo', '+91 98200 00001')
ON CONFLICT (id) DO NOTHING;

UPDATE org_care_demo.patients
SET doctor_id = 'dr-priya-001'
WHERE id IN ('demo-patient-laser-ritika', 'demo-patient-laser-arjun', 'demo-patient-laser-meera');
