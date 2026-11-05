/**
 * analyze-checkin — Supabase Edge Function
 *
 * Uses SUPABASE_DB_URL (auto-injected) for direct Postgres access so the
 * org_care_demo schema doesn't need to be PostgREST-exposed.
 * Uses Supabase client only for Storage (photo upload).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import postgres from 'https://deno.land/x/postgresjs/mod.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CheckinPayload {
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

let _sql: ReturnType<typeof postgres> | null = null;
function getSql() {
  if (!_sql) {
    _sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, {
      ssl: 'require',
      max: 1,
    });
  }
  return _sql;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload: CheckinPayload = await req.json();
    const {
      patientId, orgSlug, dayNumber, imageBase64, imageMimeType,
      symptomsText, adherenceToday, qualityScore, appMode = 'demo',
      checkinType = 'face', checkinId,
    } = payload;

    const sql = getSql();
    const schema = `org_${orgSlug}`;

    // ── 1. Load patient from DB ──────────────────────────────
    const patientRows = await sql`
      SELECT p.*, d.name AS doctor_name, d.specialty AS doctor_specialty
      FROM ${sql(schema)}.patients p
      LEFT JOIN ${sql(schema)}.doctors d ON d.id = p.doctor_id
      WHERE p.id = ${patientId}
      LIMIT 1
    `;
    if (!patientRows.length) return jsonError('Patient not found', 404);
    const patientData = patientRows[0];
    const condition = patientData.condition ?? 'acne';

    // ── 2. Load disease protocol ─────────────────────────────
    const protocols = await sql`
      SELECT * FROM ${sql(schema)}.disease_protocols
      WHERE condition = ${condition}
    `;
    const protocol = protocols.find((p: Record<string,unknown>) => {
      const [lo, hi] = String(p.day_range).split('-').map(Number);
      return dayNumber >= lo && dayNumber <= (hi || lo);
    }) ?? protocols[0];

    // ── 3. Load recent checkin history (last 3) ──────────────
    const recentCheckins = await sql`
      SELECT day_number, status, ai_headline, symptoms_reported, ai_zone_analysis
      FROM ${sql(schema)}.checkins
      WHERE patient_id = ${patientId}
      ORDER BY day_number DESC
      LIMIT 3
    `;
    const historyText = recentCheckins.length
      ? recentCheckins.map((c: Record<string,unknown>) =>
          `Day ${c.day_number}: ${String(c.status ?? '').toUpperCase()} — ${c.ai_headline ?? 'no note'}` +
          (c.symptoms_reported ? ` | Symptoms: ${c.symptoms_reported}` : '')
        ).join('\n')
      : 'No prior check-ins.';

    const recentSummary = historyText;

    // ── 4. Fetch voice transcript from draft row ─────────────
    let voiceTranscript = '';
    if (checkinId) {
      const draftRows = await sql`
        SELECT transcript FROM ${sql(schema)}.checkins WHERE id = ${checkinId} LIMIT 1
      `;
      voiceTranscript = draftRows[0]?.transcript ?? '';
    }

    // ── 5. AI Analysis ───────────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    let analysis: Record<string, unknown>;

    if (!anthropicKey || appMode === 'demo') {
      analysis = makeMockAnalysis(condition, checkinType, dayNumber, symptomsText, adherenceToday);
    } else {
      analysis = checkinType === 'hair'
        ? await analyseHair(anthropicKey, imageBase64, imageMimeType, patientData, protocol, recentSummary, dayNumber, symptomsText, adherenceToday, condition, voiceTranscript)
        : await analyseFace(anthropicKey, imageBase64, imageMimeType, patientData, protocol, historyText, dayNumber, symptomsText, adherenceToday, condition, voiceTranscript);
    }

    const conditionLabel = ({
      acne: 'Acne Vulgaris',
      laser_recovery: 'Post-Laser Skin Recovery',
      androgenic_alopecia: 'Androgenic Alopecia (Pattern Hair Loss)',
      alopecia_areata: 'Alopecia Areata',
      telogen_effluvium: 'Telogen Effluvium',
    } as Record<string,string>)[condition] ?? condition;

    // ── 6. Upload photo to Supabase Storage ──────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    let storedPhotoUrl: string | undefined;
    try {
      // Ensure the bucket exists and is public before uploading
      const { error: createErr } = await supabase.storage.createBucket('checkin-photos', { public: true });
      if (createErr && (createErr.message?.includes('already exists') || createErr.message?.includes('Duplicate'))) {
        await supabase.storage.updateBucket('checkin-photos', { public: true });
      }

      const bytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
      const fileName = `${orgSlug}/${patientId}/day${dayNumber}_${Date.now()}.jpg`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('checkin-photos')
        .upload(fileName, bytes, { contentType: imageMimeType, upsert: false });
      if (uploadErr) console.warn('Photo upload error:', uploadErr.message);
      if (uploadData?.path) {
        const { data: urlData } = supabase.storage.from('checkin-photos').getPublicUrl(uploadData.path);
        storedPhotoUrl = urlData?.publicUrl;
        console.log('Photo stored:', storedPhotoUrl);
      }
    } catch (uploadErr) {
      console.warn('Photo upload failed (non-fatal):', uploadErr);
    }

    // ── 7. Persist check-in to DB ────────────────────────────
    const alertLevel = (analysis.alert_level as number) ?? 1;
    const statusMap: Record<number, string> = { 1: 'green', 2: 'yellow', 3: 'red' };
    const status = statusMap[alertLevel] ?? 'green';
    const zoneJson = JSON.stringify(
      checkinType === 'hair' ? analysis.hair_zone_analysis : analysis.zone_analysis
    );

    let checkInId: string;
    if (checkinId) {
      checkInId = checkinId;
      await sql`
        UPDATE ${sql(schema)}.checkins SET
          checkin_date = ${new Date().toISOString()},
          status = ${status},
          symptoms_reported = ${symptomsText},
          adherence_today = ${adherenceToday},
          photo_url = ${storedPhotoUrl ?? null},
          photo_label = ${`Day ${dayNumber} ${checkinType === 'hair' ? 'Hair' : ''} Check-in`},
          ai_headline = ${analysis.headline as string},
          ai_summary = ${analysis.summary as string},
          ai_zone_analysis = ${zoneJson},
          ai_suggested_actions = ${analysis.recommendation as string},
          quality_score = ${qualityScore},
          checkin_status = 'pending_review'
        WHERE id = ${checkinId}
      `;
    } else {
      checkInId = `ci-${patientId.slice(-6)}-d${dayNumber}-${Date.now()}`;
      await sql`
        INSERT INTO ${sql(schema)}.checkins
          (id, patient_id, day_number, checkin_date, status, symptoms_reported,
           adherence_today, photo_url, photo_label, ai_headline, ai_summary,
           ai_zone_analysis, ai_suggested_actions, quality_score, checkin_status)
        VALUES (
          ${checkInId}, ${patientId}, ${dayNumber}, ${new Date().toISOString()},
          ${status}, ${symptomsText}, ${adherenceToday}, ${storedPhotoUrl ?? null},
          ${`Day ${dayNumber} ${checkinType === 'hair' ? 'Hair' : ''} Check-in`},
          ${analysis.headline as string}, ${analysis.summary as string},
          ${zoneJson}, ${analysis.recommendation as string},
          ${qualityScore}, 'pending_review'
        )
      `;
    }

    // Update patient status + advance to next day
    const nextDay = dayNumber + 1;
    if (status === 'red' || status === 'yellow') {
      await sql`UPDATE ${sql(schema)}.patients SET status = ${status}, current_day = ${nextDay} WHERE id = ${patientId}`;
    } else {
      await sql`UPDATE ${sql(schema)}.patients SET current_day = ${nextDay} WHERE id = ${patientId}`;
    }

    // Create alert for yellow/red
    if (alertLevel >= 2) {
      await sql`
        INSERT INTO ${sql(schema)}.alerts
          (id, patient_id, severity, title, ai_analysis, suggested_actions,
           patient_context, photo_url, created_at, resolved)
        VALUES (
          ${`alert-${checkInId}`}, ${patientId}, ${status},
          ${`Day ${dayNumber}: ${analysis.headline}`},
          ${analysis.summary as string}, ${analysis.doctor_note as string},
          ${`Day ${dayNumber}, ${conditionLabel}. ${symptomsText}`},
          ${storedPhotoUrl ?? null}, ${new Date().toISOString()}, false
        )
        ON CONFLICT (id) DO NOTHING
      `;
    }

    // Add AI message to chat
    await sql`
      INSERT INTO ${sql(schema)}.messages
        (patient_id, sender, content, message_type, timestamp, is_read, photo_url)
      VALUES (
        ${patientId}, 'aisha',
        ${`✦ AI Analysis — Day ${dayNumber}\n\n${analysis.headline}\n\n${analysis.doctor_note}`},
        'ai_analysis', ${new Date().toISOString()}, false,
        ${storedPhotoUrl ?? null}
      )
    `;

    // ── 9. Retention: keep only last 5 check-ins per patient ─────────────────
    try {
      const older = await sql<{ id: string; photo_url: string | null }[]>`
        SELECT id, photo_url FROM ${sql(schema)}.checkins
        WHERE patient_id = ${patientId}
        ORDER BY day_number DESC
        OFFSET 5
      `;
      if (older.length > 0) {
        const paths = older
          .filter(c => c.photo_url)
          .map(c => {
            const parts = (c.photo_url as string).split('/checkin-photos/');
            return parts.length > 1 ? parts[1] : null;
          })
          .filter((p): p is string => Boolean(p));
        if (paths.length > 0) {
          await supabase.storage.from('checkin-photos').remove(paths);
        }
        const oldIds = older.map(c => c.id);
        await sql`DELETE FROM ${sql(schema)}.checkins WHERE id = ANY(${oldIds}::text[])`;
        console.log(`Cleaned up ${older.length} old check-in(s) for patient ${patientId}`);
      }
    } catch (cleanupErr) {
      console.warn('Retention cleanup failed (non-fatal):', cleanupErr);
    }

    return new Response(
      JSON.stringify({ checkInId, analysis, storedPhotoUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Edge function error:', err);
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
});

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Face analysis ────────────────────────────────────────────────────────────

async function analyseFace(
  apiKey: string, imageBase64: string, imageMimeType: string,
  patient: Record<string, unknown>, protocol: Record<string, unknown> | undefined,
  historyText: string, dayNumber: number, symptomsText: string,
  adherenceToday: boolean, condition: string, voiceTranscript = '',
): Promise<Record<string, unknown>> {
  const conditionLabel = condition === 'laser_recovery'
    ? 'Post-Laser Skin Recovery (CO2 Fractional)' : 'Acne Vulgaris';

  const systemPrompt = `You are Aisha, an expert AI clinical nurse specialising in dermatology.
You analyse patient photos with the precision of a board-certified dermatologist.
You respond ONLY with valid JSON — no markdown, no prose, no backticks.`;

  const userPrompt = `PATIENT CONTEXT
===============
Name: ${patient.name}, Age: ${patient.age}, Gender: ${patient.gender}
Condition: ${conditionLabel}
Treatment: ${patient.treatment_name}
Day ${dayNumber} of treatment
Prescribed products: ${patient.prescribed_products ?? 'see treatment plan'}
Treatment adherence today: ${adherenceToday ? 'YES — applied as prescribed' : 'NO — missed dose'}
Symptoms reported today: ${symptomsText || 'None'}

RECENT HISTORY
==============
${historyText}
${voiceTranscript ? `\nPATIENT VOICE CHECK-IN TRANSCRIPT (TODAY)\n==========================================\n${voiceTranscript}\n` : ''}
DISEASE PROTOCOL FOR THIS PHASE (Day ${dayNumber})
===================================================
Phase: ${protocol?.phase_name ?? 'Active Treatment'}
What is NORMAL to see now:
${protocol?.expectations ?? 'Standard treatment response expected.'}

Clinical hotspot rules for THIS phase:
${protocol?.hotspot_rules ?? 'Flag any grade 3 finding or combined redness+swelling ≥2.'}

Patient instructions for this phase:
${protocol?.instructions ?? 'Continue as prescribed.'}

ANALYSIS TASK
=============
Carefully examine the photo. Assess each facial zone independently with clinical precision.
For each zone, grade 0-3: 0=none/clear, 1=mild, 2=moderate, 3=severe.
Apply the HOTSPOT RULES above for this specific phase — do not apply generic rules.
Post-laser day 1-3: redness=3 and swelling=3 is EXPECTED and NOT a hotspot.
Acne purge phase: moderate breakout is EXPECTED.

Respond ONLY with this exact JSON:
{
  "headline": "10-15 word clinical summary",
  "summary": "2-3 sentence clinical assessment for the patient",
  "alert_level": 1,
  "checkin_type": "face",
  "zone_analysis": {
    "forehead":    {"redness": 0, "swelling": 0, "texture_concern": 0, "hotspot": false, "notes": ""},
    "left_cheek":  {"redness": 0, "swelling": 0, "texture_concern": 0, "hotspot": false, "notes": ""},
    "right_cheek": {"redness": 0, "swelling": 0, "texture_concern": 0, "hotspot": false, "notes": ""},
    "nose_tzone":  {"redness": 0, "swelling": 0, "texture_concern": 0, "hotspot": false, "notes": ""},
    "perioral":    {"redness": 0, "swelling": 0, "texture_concern": 0, "hotspot": false, "notes": ""},
    "chin":        {"redness": 0, "swelling": 0, "texture_concern": 0, "hotspot": false, "notes": ""}
  },
  "hair_zone_analysis": null,
  "recommendation": "Clear patient-facing instructions for next 24 hours",
  "doctor_note": "Clinical note for the treating physician",
  "adherence_assessment": "Brief note on treatment adherence impact"
}
alert_level: 1=routine (green), 2=watch (yellow), 3=urgent (red).`;

  return callClaude(apiKey, imageBase64, imageMimeType, systemPrompt, userPrompt,
    () => makeMockAnalysis(condition, 'face', dayNumber, symptomsText, adherenceToday));
}

// ─── Hair analysis ────────────────────────────────────────────────────────────

async function analyseHair(
  apiKey: string, imageBase64: string, imageMimeType: string,
  patient: Record<string, unknown>, protocol: Record<string, unknown> | undefined,
  recentSummary: string, dayNumber: number, symptomsText: string,
  adherenceToday: boolean, condition: string, voiceTranscript = '',
): Promise<Record<string, unknown>> {
  const systemPrompt = `You are a trichologist (hair and scalp specialist) with the precision of a board-certified dermatologist.
You analyse cropped scalp photographs — no face, no identifying features.
You respond ONLY with valid JSON — no markdown, no prose, no backticks.`;

  const userPrompt = `You are a trichologist analyzing a cropped photograph of a patient's scalp.
The image shows ONLY the scalp/hair region — no face or identifying features are present.

Patient context:
- Condition: ${condition}
- Treatment day: ${dayNumber}
- Phase: ${protocol?.phase_name ?? 'Active Treatment'}
- What to expect at this stage: ${protocol?.expectations ?? 'Standard treatment response expected.'}
- Alert triggers: ${protocol?.hotspot_rules ?? 'Flag any new bald patches or rapid progression.'}
${recentSummary ? `- Recent trend: ${recentSummary}` : ''}
- Treatment adherence today: ${adherenceToday ? 'YES' : 'NO — missed dose'}
- Symptoms reported: ${symptomsText || 'None'}
${voiceTranscript ? `\nPATIENT VOICE CHECK-IN TRANSCRIPT (TODAY)\n==========================================\n${voiceTranscript}\n` : ''}
Analyze these 6 scalp zones as visible in the image:
crown, hairline, left_temple, right_temple, parting_line, sides

Return ONLY valid JSON in this exact structure:
{
  "headline": "one sentence clinical summary",
  "summary": "2-3 sentence detailed assessment including trends",
  "alert_level": 1,
  "checkin_type": "hair",
  "zone_analysis": null,
  "hair_zone_analysis": {
    "crown":        {"density": 2, "scalp_visibility": 30, "hotspot": false, "notes": ""},
    "hairline":     {"density": 2, "scalp_visibility": 25, "hotspot": false, "notes": ""},
    "left_temple":  {"density": 1, "scalp_visibility": 50, "hotspot": true,  "notes": ""},
    "right_temple": {"density": 1, "scalp_visibility": 50, "hotspot": true,  "notes": ""},
    "parting_line": {"density": 2, "scalp_visibility": 35, "hotspot": false, "notes": ""},
    "sides":        {"density": 3, "scalp_visibility": 10, "hotspot": false, "notes": ""}
  },
  "recommendation": "specific patient instruction",
  "doctor_note": "clinical note for the treating doctor",
  "adherence_assessment": "comment on treatment adherence"
}
Alert level: 1=stable, 2=mild progression (monitoring needed), 3=significant thinning/new bald patch.`;

  return callClaude(apiKey, imageBase64, imageMimeType, systemPrompt, userPrompt,
    () => makeMockAnalysis(condition, 'hair', dayNumber, symptomsText, adherenceToday));
}

// ─── Shared Claude caller ─────────────────────────────────────────────────────

async function callClaude(
  apiKey: string, imageBase64: string, imageMimeType: string,
  systemPrompt: string, userPrompt: string,
  fallback: () => Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1400,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: imageMimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: imageBase64 } },
          { type: 'text', text: userPrompt },
        ],
      }],
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!claudeResp.ok) {
    console.error('Claude API error:', await claudeResp.text());
    return fallback();
  }

  const claudeData = await claudeResp.json();
  const raw = claudeData?.content?.[0]?.text ?? '{}';
  try { return JSON.parse(raw); } catch { return fallback(); }
}

// ─── Mock analysis ────────────────────────────────────────────────────────────

function makeMockAnalysis(
  condition: string, checkinType: string, day: number, symptoms: string, adherence: boolean
): Record<string, unknown> {
  if (checkinType === 'hair') return makeMockHairAnalysis(condition, day, symptoms, adherence);

  const isLaser = condition === 'laser_recovery';

  if (isLaser && day <= 3) {
    return {
      headline: `Post-Laser Day ${day} — Acute Healing Response Within Expected Range`,
      summary: `Day ${day} post-CO2 laser shows expected erythema and edema across treated zones. Healing trajectory appears normal. No signs of infection detected.`,
      alert_level: day <= 2 ? 2 : 1, checkin_type: 'face',
      zone_analysis: {
        forehead:    { redness: 3, swelling: 3, texture_concern: 1, hotspot: false, notes: 'Expected acute response' },
        left_cheek:  { redness: 3, swelling: 3, texture_concern: 1, hotspot: false, notes: 'Expected acute response' },
        right_cheek: { redness: 3, swelling: 3, texture_concern: 1, hotspot: false, notes: 'Expected acute response' },
        nose_tzone:  { redness: 2, swelling: 2, texture_concern: 1, hotspot: false, notes: 'Moderate response' },
        perioral:    { redness: 2, swelling: 2, texture_concern: 0, hotspot: false, notes: '' },
        chin:        { redness: 2, swelling: 1, texture_concern: 0, hotspot: false, notes: '' },
      },
      hair_zone_analysis: null,
      recommendation: `Keep the skin moist with prescribed ointment every 2-3 hours. Do NOT pick or touch the treated area. Sleep with head elevated.`,
      doctor_note: `Day ${day} post-CO2: bilateral erythema and edema within expected acute phase parameters. No signs of infection. Monitor day 4-5 for crusting symmetry.`,
      adherence_assessment: adherence ? 'Patient adhering to post-procedure protocol.' : '⚠ Patient reports missed application.',
    };
  }

  if (isLaser && day <= 7) {
    return {
      headline: `Day ${day} — Crusting and Re-epithelialization Progressing`,
      summary: `Crusts are forming and beginning to lift as expected for this phase. New pink skin visible beneath. Itching is normal and indicates healing.`,
      alert_level: symptoms.includes('purulent') ? 3 : 1, checkin_type: 'face',
      zone_analysis: {
        forehead:    { redness: 2, swelling: 1, texture_concern: 2, hotspot: false, notes: '' },
        left_cheek:  { redness: 2, swelling: 1, texture_concern: 3, hotspot: false, notes: 'Crusting' },
        right_cheek: { redness: 2, swelling: 1, texture_concern: 3, hotspot: false, notes: 'Crusting' },
        nose_tzone:  { redness: 1, swelling: 0, texture_concern: 2, hotspot: false, notes: '' },
        perioral:    { redness: 1, swelling: 0, texture_concern: 1, hotspot: false, notes: '' },
        chin:        { redness: 1, swelling: 1, texture_concern: 2, hotspot: false, notes: '' },
      },
      hair_zone_analysis: null,
      recommendation: `Let crusts fall off on their own — never force them. Continue moist healing. Begin gentle cool-water cleansing 2x daily.`,
      doctor_note: `Day ${day}: Crusting/peeling phase progressing as expected. Bilateral symmetry maintained. No signs of infection.`,
      adherence_assessment: adherence ? 'Maintaining protocol correctly.' : '⚠ Moisture continuity critical — missed application reported.',
    };
  }

  const purging = day < 21 && condition === 'acne';
  return {
    headline: purging
      ? `Day ${day} — Purge Phase Active, Treatment Working as Expected`
      : `Day ${day} — Continued Improvement, ${adherence ? 'Strong' : 'Watch'} Adherence`,
    summary: purging
      ? `Tretinoin purge response is visible with some new surfacing blemishes. This is a positive sign that the active ingredient is accelerating cell turnover. Stay the course.`
      : `Skin is showing measurable improvement from baseline. Residual post-inflammatory marks are fading. Texture is improving.`,
    alert_level: (!adherence && day > 7) ? 2 : 1, checkin_type: 'face',
    zone_analysis: {
      forehead:    { redness: purging ? 2 : 1, swelling: 0, texture_concern: purging ? 2 : 1, hotspot: false, notes: '' },
      left_cheek:  { redness: purging ? 2 : 1, swelling: purging ? 1 : 0, texture_concern: 2, hotspot: false, notes: '' },
      right_cheek: { redness: purging ? 2 : 1, swelling: purging ? 1 : 0, texture_concern: 2, hotspot: false, notes: '' },
      nose_tzone:  { redness: 1, swelling: 0, texture_concern: purging ? 2 : 1, hotspot: false, notes: '' },
      perioral:    { redness: 0, swelling: 0, texture_concern: 0, hotspot: false, notes: '' },
      chin:        { redness: purging ? 1 : 0, swelling: 0, texture_concern: 1, hotspot: false, notes: '' },
    },
    hair_zone_analysis: null,
    recommendation: purging
      ? `Continue your prescribed regimen without changes. Increase moisturizer frequency if dryness is significant.`
      : `Maintain your current regimen. Consider adding a vitamin C serum in the AM. Keep SPF consistent.`,
    doctor_note: purging
      ? `Day ${day}: Purge response within expected parameters. No intervention needed.`
      : `Day ${day}: Treatment response on track. ${adherence ? 'Excellent adherence.' : 'Missed dose noted.'}`,
    adherence_assessment: adherence
      ? 'Consistent adherence maintained — key driver of treatment success.'
      : `⚠ Missed treatment dose on day ${day}. Consistent daily application is critical.`,
  };
}

function makeMockHairAnalysis(
  condition: string, day: number, symptoms: string, adherence: boolean
): Record<string, unknown> {
  const isAA = condition === 'alopecia_areata';
  const isTE = condition === 'telogen_effluvium';
  const alertLevel = symptoms.includes('bald') || symptoms.includes('New bald patch') ? 3
    : symptoms.includes('Increased shedding') || !adherence ? 2 : 1;

  return {
    headline: isTE
      ? `Day ${day} — Diffuse Shedding, Iron Supplementation Response Pending`
      : isAA
      ? `Day ${day} — Patch Monitoring Active, No New Lesions Detected`
      : `Day ${day} — Crown Thinning Stable, Temples Require Attention`,
    summary: isTE
      ? `Telogen effluvium presentation shows diffuse thinning across the scalp. The parting line and crown show increased scalp visibility consistent with active shedding phase.`
      : isAA
      ? `Existing alopecia areata patches remain stable in size. No new patches detected in this assessment.`
      : `Androgenic alopecia shows stable crown thinning with more significant recession at both temples. Parting line scalp visibility has not worsened since last check-in.`,
    alert_level: alertLevel, checkin_type: 'hair', zone_analysis: null,
    hair_zone_analysis: {
      crown:        { density: isTE ? 1 : 2, scalp_visibility: isTE ? 55 : 30, hotspot: isTE && symptoms.includes('Thinning at crown'), notes: isTE ? 'Diffuse thinning visible' : 'Mild thinning, stable' },
      hairline:     { density: 2, scalp_visibility: 25, hotspot: false, notes: 'Hairline stable, no recession' },
      left_temple:  { density: 1, scalp_visibility: 55, hotspot: true, notes: 'Significant thinning — primary concern zone' },
      right_temple: { density: 1, scalp_visibility: 50, hotspot: true, notes: 'Significant thinning — primary concern zone' },
      parting_line: { density: isTE ? 1 : 2, scalp_visibility: isTE ? 60 : 35, hotspot: false, notes: isTE ? 'Parting widened vs baseline' : 'Moderate visibility, consistent with previous' },
      sides:        { density: 3, scalp_visibility: 8, hotspot: false, notes: 'Good density, well-maintained' },
    },
    recommendation: adherence
      ? `Continue applying minoxidil to the crown and temple zones as prescribed. Temples are the priority focus area.`
      : `Consistent daily application of minoxidil is critical — missed doses reduce efficacy significantly.`,
    doctor_note: `Day ${day} hair assessment: bilateral temple thinning (density 1) with scalp visibility ~50-55%. Crown stable at density 2. Adherence: ${adherence ? 'confirmed' : 'MISSED — counsel required'}.`,
    adherence_assessment: adherence
      ? 'Patient maintaining daily minoxidil application — essential for efficacy.'
      : `⚠ Missed treatment dose on day ${day}. Minoxidil requires daily application.`,
  };
}
