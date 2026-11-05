// Ported verbatim from supabase/functions/analyze-checkin/index.ts (demo mode),
// so the in-browser demo produces exactly what the edge function returns without an API key.
/* eslint-disable */
export function makeMockAnalysis(
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
