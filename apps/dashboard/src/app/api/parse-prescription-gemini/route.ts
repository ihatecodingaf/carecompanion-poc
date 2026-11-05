import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

// 2.0 models only — 1.5-flash and 1.5-pro are deprecated on v1beta
const MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

function geminiUrl(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}
function geminiHeaders(key: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-goog-api-key': key };
}

const PROMPT = `Extract structured data from this Indian hospital prescription image.

Return ONLY a valid JSON object, no markdown, no explanation:
{
  "patient_name": "string or null",
  "age": "number as string or null",
  "gender": "Male or Female or null",
  "date": "DD/MM/YYYY or null",
  "hospital": "clinic/hospital name or null",
  "doctor_name": "doctor name or null",
  "diagnosis": "chief complaint or known condition or null",
  "follow_up": "follow-up instruction or null",
  "medications": [
    {
      "drug": "drug name",
      "form": "Tablet/Capsule/Injection/Syrup or empty string",
      "dose": "dose with unit e.g. 5mg or empty string",
      "frequency": "frequency e.g. OD/BD/TDS or 1-0-1 or empty string",
      "duration": "e.g. 30 days or empty string"
    }
  ]
}

Rules:
- Extract ALL medications listed, even if handwritten
- Age: number only, strip years/yrs/yr
- Gender: normalise M/Male to Male, F/Female to Female
- Drug abbreviations: Tab=Tablet, Cap=Capsule, Inj=Injection
- If a field is not present, use null for top-level fields and empty string for medication fields
- Do not guess or hallucinate values`;

async function extractFromImage(file: File): Promise<Record<string, unknown>> {
  const buf  = await file.arrayBuffer();
  const b64  = Buffer.from(buf).toString('base64');
  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpeg';
  const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY env var is not set');

  const body = JSON.stringify({
    contents: [{ parts: [
      { inline_data: { mime_type: mime, data: b64 } },
      { text: PROMPT },
    ]}],
    generationConfig: { temperature: 0 },
  });

  let lastError = 'All Gemini models unavailable';
  for (const model of MODELS) {
    const res = await fetch(geminiUrl(model), {
      method: 'POST', headers: geminiHeaders(key), body,
    });
    if (res.status === 503 || res.status === 404) {
      lastError = `${model} unavailable (${res.status})`;
      if (res.status === 503) await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    if (res.status === 429) {
      // Rate limit is per API key — switching models won't help
      throw new Error('Gemini rate limit hit (429). Try again in a minute, or upgrade to a paid API key.');
    }
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Gemini error (${res.status}): ${txt}`);
    }
    const j     = await res.json() as Record<string, unknown>;
    const parts = ((j.candidates as Record<string, unknown>[])[0].content as Record<string, unknown>)
                    .parts as Record<string, unknown>[];
    const text  = (parts[0].text as string).trim()
                    .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(text) as Record<string, unknown>;
  }
  throw new Error(lastError);
}

function mergePages(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const pick = (k: string) => (a[k] != null && a[k] !== '' ? a[k] : b[k]);
  const medsA = Array.isArray(a.medications) ? a.medications as unknown[] : [];
  const medsB = Array.isArray(b.medications) ? b.medications as unknown[] : [];
  return {
    patient_name: pick('patient_name'),
    age:          pick('age'),
    gender:       pick('gender'),
    date:         pick('date'),
    hospital:     pick('hospital'),
    doctor_name:  pick('doctor_name'),
    diagnosis:    pick('diagnosis'),
    follow_up:    pick('follow_up'),
    medications:  [...medsA, ...medsB],
  };
}

export async function POST(req: NextRequest) {
  try {
    const form  = await req.formData();
    const file1 = form.get('image')  as File | null;
    const file2 = form.get('image2') as File | null;

    if (!file1) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    const results = await Promise.all([
      extractFromImage(file1),
      ...(file2 ? [extractFromImage(file2)] : []),
    ]);

    const data = results.length === 2 ? mergePages(results[0], results[1]) : results[0];
    return NextResponse.json({ data, pages: results.length });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
