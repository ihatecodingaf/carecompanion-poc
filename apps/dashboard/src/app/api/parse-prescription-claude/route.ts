import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT = `You are a medical data extraction assistant. Extract structured data from this Indian hospital prescription image.

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "patient_name": "string or null",
  "age": "number as string or null",
  "gender": "Male or Female or null",
  "date": "DD/MM/YYYY or null",
  "hospital": "clinic/hospital name or null",
  "doctor_name": "doctor name with Dr. prefix or null",
  "diagnosis": "chief complaint or known condition or null",
  "follow_up": "follow-up instruction or null",
  "medications": [
    {
      "drug": "drug name",
      "form": "Tablet/Capsule/Injection/Syrup or empty string",
      "dose": "dose with unit e.g. 5 mg or empty string",
      "frequency": "OD/BD/TDS/QID or written frequency or empty string",
      "duration": "e.g. 30 days or empty string"
    }
  ]
}

Rules:
- Extract ALL medications listed, even if handwritten
- Age: number only, strip "years/yrs/yr"
- Gender: normalise M/Male → "Male", F/Female → "Female"
- Drug abbreviations: Tab=Tablet, Cap=Capsule, Inj=Injection
- Frequency: OD=once daily, BD=twice daily, TDS=thrice daily, QID=four times daily
- If a field is not present or unreadable, use null for top-level fields and empty string for medication fields
- Do not guess or hallucinate values`;

async function extractFromImage(file: File): Promise<Record<string, unknown>> {
  const buf = await file.arrayBuffer();
  const b64 = Buffer.from(buf).toString('base64');
  const raw = file.name.split('.').pop()?.toLowerCase() ?? 'jpeg';
  const mediaType = raw === 'png' ? 'image/png' : raw === 'gif' ? 'image/gif' : raw === 'webp' ? 'image/webp' : 'image/jpeg';

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
        { type: 'text', text: PROMPT },
      ],
    }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
  // Strip markdown code fences if Claude wraps in ```json
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(clean) as Record<string, unknown>;
}

function mergeTwoPages(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
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

    const data = results.length === 2 ? mergeTwoPages(results[0], results[1]) : results[0];

    return NextResponse.json({ data, pages: results.length });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
