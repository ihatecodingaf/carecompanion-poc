import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const BASE        = 'https://api.cloud.llamaindex.ai/api/v1/parsing';
const OCR_MODEL   = 'anthropic-sonnet-4.5'; // best handwriting OCR

const JSON_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    patient_name: { type: 'string',  description: 'Full patient name, strip Mr/Mrs/Ms prefix' },
    age:          { type: 'string',  description: 'Age as number only e.g. "48"' },
    gender:       { type: 'string',  description: 'Male or Female' },
    date:         { type: 'string',  description: 'Prescription date DD/MM/YYYY' },
    hospital:     { type: 'string',  description: 'Clinic or hospital name from letterhead' },
    doctor_name:  { type: 'string',  description: 'Prescribing doctor name' },
    diagnosis:    { type: 'string',  description: 'Chief complaint or diagnosis' },
    follow_up:    { type: 'string',  description: 'Follow-up date or duration e.g. 2 weeks' },
    medications: {
      type:  'array',
      description: 'Every medication listed including handwritten ones',
      items: {
        type: 'object',
        properties: {
          drug:      { type: 'string', description: 'Drug or brand name. Tab=Tablet Cap=Capsule Inj=Injection' },
          form:      { type: 'string', description: 'Tablet/Capsule/Injection/Syrup/Cream or empty string' },
          dose:      { type: 'string', description: 'Dose with unit e.g. 15mg or empty string' },
          frequency: { type: 'string', description: 'OD/BD/TDS or 1-0-1 or empty string' },
          duration:  { type: 'string', description: 'e.g. 30 days or empty string' },
        },
      },
    },
  },
});

function getKey(): string {
  const k = process.env.LLAMAPARSE_API_KEY;
  if (!k) throw new Error('LLAMAPARSE_API_KEY env var is not set');
  return k;
}

// ── Step 1: Image → OCR text via Claude Sonnet 4.5 ────────────────────────

async function uploadImage(file: File): Promise<string> {
  const key  = getKey();
  const buf  = await file.arrayBuffer();
  const blob = new Blob([buf], { type: file.type || 'image/jpeg' });

  const fd = new FormData();
  fd.append('file', blob, file.name || 'prescription.jpg');
  fd.append('use_vendor_multimodal_model', 'true');
  fd.append('vendor_multimodal_model_name', OCR_MODEL);
  fd.append('parsing_instruction', 'Extract every piece of text from this Indian hospital prescription image accurately, including all handwritten text. Preserve patient name, age, gender, date, all medications with doses and frequencies, doctor name, and clinic name.');
  fd.append('result_type', 'markdown');

  const res = await fetch(`${BASE}/upload`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd,
  });
  if (!res.ok) throw new Error(`LlamaParse OCR upload failed (${res.status}): ${(await res.text()).slice(0, 300)}`);

  const json = await res.json() as Record<string, unknown>;
  const id   = (json.id ?? json.job_id) as string | undefined;
  if (!id) throw new Error(`LlamaParse OCR: no job ID — ${JSON.stringify(json).slice(0, 200)}`);
  return id;
}

async function pollJob(jobId: string, maxMs = 40_000): Promise<void> {
  const key      = getKey();
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    const res    = await fetch(`${BASE}/job/${jobId}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) continue;
    const status = String((await res.json() as Record<string, unknown>).status ?? '').toUpperCase();
    if (status === 'SUCCESS' || status === 'COMPLETED') return;
    if (status === 'ERROR'   || status === 'FAILED')    throw new Error(`LlamaParse job failed (${status})`);
  }
  throw new Error('LlamaParse timed out');
}

async function getOcrText(jobId: string): Promise<string> {
  const key = getKey();
  const res = await fetch(`${BASE}/job/${jobId}/result/markdown`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`LlamaParse markdown fetch failed (${res.status})`);

  const outer = await res.json() as Record<string, unknown>;
  const pages = outer.pages as Array<Record<string, unknown>> | undefined;
  const text  =
    (pages?.[0]?.md   as string) ??
    (pages?.[0]?.text as string) ??
    (outer.markdown   as string) ?? '';

  if (!text.trim()) throw new Error('LlamaParse returned empty OCR text');
  return text.trim();
}

// ── Step 2: OCR text → JSON via LlamaParse own AI + json_schema ───────────

async function uploadText(ocrText: string): Promise<string> {
  const key  = getKey();
  const blob = new Blob([ocrText], { type: 'text/plain' });

  const fd = new FormData();
  fd.append('file', blob, 'prescription.txt');
  fd.append('result_type', 'json');
  fd.append('json_schema', JSON_SCHEMA);
  fd.append('parsing_instruction', 'This is OCR text from an Indian hospital prescription. Extract all structured fields including every medication listed. For missing values use empty string. Identify brand names: HiperDSR=Rabeprazole+Domperidone, Calwect=Calcium+VitD3, Meditra/MTX=Methotrexate.');

  const res = await fetch(`${BASE}/upload`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd,
  });
  if (!res.ok) throw new Error(`LlamaParse structure upload failed (${res.status}): ${(await res.text()).slice(0, 300)}`);

  const json = await res.json() as Record<string, unknown>;
  const id   = (json.id ?? json.job_id) as string | undefined;
  if (!id) throw new Error(`LlamaParse structure: no job ID — ${JSON.stringify(json).slice(0, 200)}`);
  return id;
}

async function getJsonResult(jobId: string): Promise<Record<string, unknown>> {
  const key = getKey();
  const res = await fetch(`${BASE}/job/${jobId}/result/json`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`LlamaParse JSON fetch failed (${res.status})`);

  const outer = await res.json() as Record<string, unknown>;

  // Try common response shapes
  const candidate =
    outer.data ??
    outer.json_result ??
    outer.result ??
    (outer.pages as Array<Record<string, unknown>> | undefined)?.[0]?.json ??
    (outer.pages as Array<Record<string, unknown>> | undefined)?.[0]?.structured ??
    null;

  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    return candidate as Record<string, unknown>;
  }

  // Last resort: look for our schema shape anywhere in the response
  const str = JSON.stringify(outer);
  const m   = str.match(/\{"patient_name"[\s\S]*?"medications"[\s\S]*?\][\s\S]*?\}/);
  if (m) { try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { /* fall through */ } }

  throw new Error(`Unexpected LlamaParse JSON shape: ${str.slice(0, 400)}`);
}

// ── Main handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const form  = await req.formData();
    const file1 = form.get('image')  as File | null;
    const file2 = form.get('image2') as File | null;
    if (!file1) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    const files = [file1, ...(file2 ? [file2] : [])];

    // Step 1: OCR — upload images in parallel, poll, get text
    const ocrJobIds = await Promise.all(files.map(f => uploadImage(f)));
    await Promise.all(ocrJobIds.map(id => pollJob(id, 40_000)));
    const ocrTexts  = await Promise.all(ocrJobIds.map(id => getOcrText(id)));
    const combined  = ocrTexts.join('\n\n--- PAGE 2 ---\n\n');

    // Step 2: Structure — upload combined OCR text, poll, get JSON
    const structJobId = await uploadText(combined);
    await pollJob(structJobId, 15_000);
    const data = await getJsonResult(structJobId);

    return NextResponse.json({ data, pages: files.length });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
