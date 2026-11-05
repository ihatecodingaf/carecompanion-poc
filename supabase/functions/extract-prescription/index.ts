/**
 * extract-prescription
 * ─────────────────────────────────────────────────────────────────────────
 * Receives raw OCR text extracted by the frontend (via OCR.space) and
 * uses Claude to parse it into structured patient JSON.
 *
 * Required secret (already set for analyze-checkin):
 *   ANTHROPIC_API_KEY
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildPrompt(today: string): string {
  return `You are a clinical data extraction specialist. You will receive raw text output from an OCR engine that scanned a handwritten or printed prescription from an Indian dermatology or dental clinic. OCR output is often noisy — characters may be misread (0/O, 1/l/I, rn/m), words may be joined or split, and the text may contain Hindi words transliterated into English. Your job is to interpret the intent, correct obvious OCR errors using medical knowledge, and extract structured patient data.

Today's date: ${today}. Use this to resolve relative dates ("next Monday", "after 4 weeks") and to convert DD/MM/YYYY → YYYY-MM-DD.

Return ONLY a valid JSON object — no markdown fences, no explanation:

{
  "name":           "Patient full name (correct OCR noise in names)",
  "phone":          "Phone with country code e.g. +91 98XXX XXXXX, or empty string",
  "age":            "Age as string e.g. '34', or empty string",
  "gender":         "Male | Female | Other",
  "blood_group":    "e.g. B+ or empty string",
  "condition":      "aga | acne | ht | implant | extract | rct — infer from context if not explicit",
  "treatment_name": "Main procedure or treatment, or empty string",
  "symptoms":       "Presenting complaints, plain text, or empty string",
  "diagnosis":      "Clinical diagnosis, plain text, or empty string",
  "medications":    "One per line: Drug Dose Frequency Duration — e.g. 'Minoxidil 5% 1ml once daily 6 months'",
  "precautions":    "One per line, or empty string",
  "tests":          "Lab or diagnostic tests ordered, comma-separated, or empty string",
  "follow_up_date": "YYYY-MM-DD or empty string",
  "dos":            "One per line, or empty string",
  "donts":          "One per line, or empty string",
  "current_day":    "0"
}

Condition mapping (infer from clinical context if the condition name is not written explicitly):
  aga     = hair loss, alopecia, baldness, androgenetic, Norwood, Ludwig, miniaturisation, PRP, FUE
  acne    = acne, pimples, comedones, retinoid, isotretinoin, CO2 laser, chemical peel, clindamycin
  ht      = hair transplant, FUE surgery, FUT, graft, donor area
  implant = dental implant, osseointegration, titanium post, crown
  extract = tooth extraction, socket, post-extraction, wisdom tooth
  rct     = root canal, endodontic, pulp, RCT, obturation

Drug abbreviation guide: Tab.=Tablet, Cap.=Capsule, Inj.=Injection, Syr.=Syrup, Oint.=Ointment, OD=once daily, BD=twice daily, TDS=thrice daily, HS=at bedtime, SOS=as needed.

If the text is largely unreadable, return all empty strings except current_day="0" and condition="acne".`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

    const { rawText } = (await req.json()) as { rawText: string };

    // ── No API key: return demo data ────────────────────────────────────────
    if (!ANTHROPIC_KEY) {
      console.warn('ANTHROPIC_API_KEY not set — returning demo result');
      return new Response(JSON.stringify(DEMO_RESULT), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Nothing to parse ────────────────────────────────────────────────────
    if (!rawText?.trim()) {
      return new Response(JSON.stringify(DEMO_RESULT), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Call Claude Haiku (fast + cheap for parsing) ────────────────────────
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role:    'user',
          content: `${buildPrompt(new Date().toISOString().slice(0, 10))}\n\nRaw OCR text:\n\`\`\`\n${rawText.slice(0, 8000)}\n\`\`\``,
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${err}`);
    }

    const json   = await res.json();
    const text   = (json.content?.[0]?.text ?? '{}') as string;
    const clean  = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(clean) as Record<string, string>;

    // Attach raw text so the form can show what OCR returned
    parsed.raw_text = rawText;

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('extract-prescription error:', err);
    return new Response(
      JSON.stringify({ ...DEMO_RESULT, raw_text: `[Error: ${(err as Error).message}]` }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});

// ── Demo fallback ─────────────────────────────────────────────────────────────
const DEMO_RESULT = {
  name:           'Arjun Sharma',
  phone:          '+91 98112 34567',
  age:            '34',
  gender:         'Male',
  blood_group:    'B+',
  condition:      'aga',
  treatment_name: 'PRP Therapy',
  symptoms:       'Diffuse hair thinning at crown and temporal regions. Increased hair fall last 6 months.',
  diagnosis:      'Androgenetic Alopecia — Norwood Stage III Vertex. Miniaturisation confirmed.',
  medications:    '• Minoxidil 5% topical daily\n• Finasteride 1mg oral daily\n• Biotin 10mg oral daily',
  precautions:    '• No sun 72hr\n• No hair wash 48hr\n• No swimming 2 weeks',
  tests:          'DHT, Testosterone, Ferritin, Vit D3, B12',
  follow_up_date: new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10),
  dos:            '• Apply Minoxidil nightly\n• Massage scalp 2 min\n• Protein-rich diet',
  donts:          '• Never skip Finasteride\n• No alcohol/smoking\n• No chemical treatments',
  raw_text:       '[DEMO — ANTHROPIC_API_KEY not configured]',
};
