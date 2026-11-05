import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════════════
// PROVIDER 1: Gemini (fast, ~3-5s, direct image-to-JSON)
// ═══════════════════════════════════════════════════════════════════

const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite'];

const GEMINI_PROMPT = `Extract structured data from this Indian hospital/clinic prescription image.

Return ONLY a valid JSON object, no markdown, no explanation:
{
  "patient_name": "full name or null",
  "age": "number as string or null",
  "gender": "Male or Female or null",
  "phone": "phone number or null",
  "blood_group": "e.g. B+ or A- or null",
  "date": "DD/MM/YYYY or null",
  "hospital": "clinic or hospital name or null",
  "doctor_name": "doctor name or null",
  "diagnosis": "diagnosis or chief complaint or condition or null",
  "symptoms": "presenting symptoms or complaints as plain text or null",
  "vitals": [
    { "label": "vital name e.g. BP, Pulse, Weight, SPO2, Temp", "value": "value with unit e.g. 120/80 mmHg" }
  ],
  "precautions": "any precautions or advice written on the prescription or null",
  "tests": "investigations or lab tests ordered as plain text or null",
  "dos": "instructions on what to do or null",
  "donts": "instructions on what to avoid or null",
  "follow_up": "follow-up date or duration or null",
  "medications": [
    {
      "drug": "drug or brand name",
      "form": "Tablet/Capsule/Injection/Syrup/Cream or empty string",
      "dose": "dose with unit e.g. 5mg or empty string",
      "frequency": "e.g. OD/BD/TDS or 1-0-1 or empty string",
      "duration": "e.g. 30 days or empty string"
    }
  ]
}

Rules:
- Extract ALL medications listed, even if handwritten
- Age: number only, strip years/yrs/yr
- Gender: normalise M/Male to Male, F/Female to Female
- Drug abbreviations: Tab=Tablet, Cap=Capsule, Inj=Injection
- Blood group: normalise e.g. B positive → B+, A negative → A-
- Vitals: extract any numeric measurements (BP, pulse rate, weight, height, SPO2, temperature, RR)
- vitals array should be empty [] if no vitals found, never null
- Symptoms: look for "C/O", "Complaints:", "Chief complaints", "Presenting with" sections
- Tests: look for "Investigations:", "Lab tests:", "Ix:", "Advised:" sections
- Dos/Donts: look for "Advice:", "Instructions:", "Do:", "Avoid:" sections
- If a field is not present, use null for top-level fields and empty string for medication sub-fields
- Do not guess or hallucinate values`;

async function geminiOneFile(file: File): Promise<Record<string, unknown>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const buf  = await file.arrayBuffer();
  const b64  = Buffer.from(buf).toString('base64');
  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpeg';
  const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

  const body = JSON.stringify({
    contents: [{ parts: [
      { inline_data: { mime_type: mime, data: b64 } },
      { text: GEMINI_PROMPT },
    ]}],
    generationConfig: { temperature: 0 },
  });

  for (const model of GEMINI_MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body },
    );
    if (res.status === 429) throw new Error('Gemini rate limit (429)');
    if (res.status === 404) { continue; } // model unavailable, try next
    if (res.status === 503) { await new Promise(r => setTimeout(r, 1500)); continue; }
    if (!res.ok) throw new Error(`Gemini ${model} error (${res.status})`);

    const j     = await res.json() as Record<string, unknown>;
    const parts = ((j.candidates as Record<string, unknown>[])[0].content as Record<string, unknown>).parts as Record<string, unknown>[];
    const text  = (parts[0].text as string).trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(text) as Record<string, unknown>;
  }
  throw new Error('All Gemini models unavailable');
}

function mergeGemini(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const pick = (k: string) => (a[k] != null && a[k] !== '' ? a[k] : b[k]);
  return {
    patient_name: pick('patient_name'),
    age:          pick('age'),
    gender:       pick('gender'),
    phone:        pick('phone'),
    blood_group:  pick('blood_group'),
    date:         pick('date'),
    hospital:     pick('hospital'),
    doctor_name:  pick('doctor_name'),
    diagnosis:    pick('diagnosis'),
    symptoms:     pick('symptoms'),
    precautions:  pick('precautions'),
    tests:        pick('tests'),
    dos:          pick('dos'),
    donts:        pick('donts'),
    follow_up:    pick('follow_up'),
    vitals: [
      ...((Array.isArray(a.vitals) ? a.vitals : []) as unknown[]),
      ...((Array.isArray(b.vitals) ? b.vitals : []) as unknown[]),
    ],
    medications: [
      ...((Array.isArray(a.medications) ? a.medications : []) as unknown[]),
      ...((Array.isArray(b.medications) ? b.medications : []) as unknown[]),
    ],
  };
}

async function tryGemini(files: File[]): Promise<{ data: Record<string, unknown>; pages: number }> {
  const results = await Promise.all(files.map(f => geminiOneFile(f)));
  const data    = results.length === 2 ? mergeGemini(results[0], results[1]) : results[0];
  return { data, pages: files.length };
}

// ═══════════════════════════════════════════════════════════════════
// PROVIDER 2: DocuPipe (reliable fallback, ~30-50s)
// ═══════════════════════════════════════════════════════════════════

const DP_BASE = 'https://app.docupipe.ai';

const DP_GUIDELINES = `Indian hospital or clinic prescription. Extract ALL of the following if present:
- Patient name (Indian names, strip Mr/Ms/Dr/Mrs prefix)
- Age (number only, strip years/yrs) and gender (Male/Female)
- Phone number if present
- Blood group (normalise to A+/A-/B+/B-/O+/O-/AB+/AB-)
- Date in DD/MM/YYYY format
- ALL medications: drug/brand name, form (Tab/Cap/Inj/Cream), dose, frequency, duration
  Drug abbreviations: Tab=Tablet, Cap=Capsule, Inj=Injection; OD=once daily, BD=twice daily, TDS=thrice daily
- Doctor name (starts with Dr.) and hospital/clinic name
- Diagnosis, chief complaint, or presenting condition
- Symptoms or complaints (look for C/O, Complaints:, Chief Complaints sections)
- Vitals if listed: BP, Pulse, Weight, Height, SPO2, Temperature (as label-value pairs)
- Investigations or lab tests ordered (look for Ix:, Investigations:, Tests: sections)
- Precautions or advice given
- Dos: things the patient should do
- Donts: things the patient should avoid
- Follow-up date or duration`;

const DP_SCHEMA = {
  type: 'object',
  properties: {
    patient_name: { type: 'string' },
    age:          { type: 'string' },
    gender:       { type: 'string' },
    phone:        { type: 'string' },
    blood_group:  { type: 'string' },
    date:         { type: 'string' },
    diagnosis:    { type: 'string' },
    symptoms:     { type: 'string' },
    precautions:  { type: 'string' },
    tests:        { type: 'string' },
    dos:          { type: 'string' },
    donts:        { type: 'string' },
    doctor_name:  { type: 'string' },
    hospital:     { type: 'string' },
    follow_up:    { type: 'string' },
    vitals: {
      type:  'array',
      items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } } },
    },
    medications: {
      type:  'array',
      items: { type: 'object', properties: { drug: { type: 'string' }, form: { type: 'string' }, dose: { type: 'string' }, frequency: { type: 'string' }, duration: { type: 'string' } } },
    },
  },
};

function dpExtractId(body: Record<string, unknown>): string | null {
  return (
    (body.id         as string) ||
    (body.documentId as string) ||
    (body._id        as string) ||
    ((body.document as Record<string, unknown> | undefined)?.id as string) ||
    null
  );
}

async function dpUpload(file: File): Promise<string> {
  const key = process.env.DOCUPIPE_API_KEY;
  if (!key) throw new Error('DOCUPIPE_API_KEY not set');

  const buf = await file.arrayBuffer();
  const b64 = Buffer.from(buf).toString('base64');
  const raw = file.name.split('.').pop()?.toLowerCase() ?? 'png';
  const ext = raw === 'jpg' ? 'jpeg' : raw;

  const res = await fetch(`${DP_BASE}/document`, {
    method:  'POST',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ document: { file: { contents: b64 }, filename: 'prescription', fileExtension: ext } }),
  });
  if (!res.ok) throw new Error(`DocuPipe upload (${res.status}): ${(await res.text()).slice(0, 200)}`);

  const body = await res.json() as Record<string, unknown>;
  const id   = dpExtractId(body);
  if (!id) throw new Error(`DocuPipe upload: no ID — ${JSON.stringify(body).slice(0, 200)}`);
  return id;
}

async function dpPoll(docId: string, maxMs = 50_000): Promise<void> {
  const key      = process.env.DOCUPIPE_API_KEY!;
  const deadline = Date.now() + maxMs;
  let lastStatus = 'unknown';

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    const r = await fetch(`${DP_BASE}/document/${docId}`, { headers: { 'X-API-Key': key } });
    if (!r.ok) continue;
    const d      = await r.json() as Record<string, unknown>;
    lastStatus   = String(d.status ?? d.state ?? d.processingStatus ?? 'unknown').toLowerCase();
    if (['completed','done','parsed','success','processed','finished'].some(s => lastStatus.startsWith(s))) return;
    if (['failed','error','cancelled'].includes(lastStatus)) throw new Error(`DocuPipe failed (${lastStatus})`);
  }
  throw new Error(`DocuPipe timed out. Last status: "${lastStatus}"`);
}

async function dpStandardise(docId: string): Promise<Record<string, unknown>> {
  const key = process.env.DOCUPIPE_API_KEY!;
  const res = await fetch(`${DP_BASE}/standardize`, {
    method:  'POST',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ documentId: docId, effortLevel: 'high', guidelines: DP_GUIDELINES, schema: DP_SCHEMA }),
  });
  if (!res.ok) throw new Error(`DocuPipe standardize (${res.status}): ${(await res.text()).slice(0, 200)}`);

  const j   = await res.json() as Record<string, unknown>;
  const raw = (j.data ?? j) as Record<string, unknown>;

  const patient = (raw.patient ?? raw.patientInformation ?? {}) as Record<string, unknown>;
  const doctors = Array.isArray(raw.doctors) ? raw.doctors as Record<string, unknown>[] : [];

  // Age — DocuPipe returns plain number OR nested {value, unit}
  const ageRaw = patient.age as Record<string, unknown> | string | number | undefined;
  const age    = (ageRaw && typeof ageRaw === 'object')
    ? String((ageRaw as Record<string, unknown>).value ?? '')
    : String(ageRaw ?? '');

  // Arrays or strings → joined string
  const arrToStr = (v: unknown): string | null => {
    if (v == null) return null;
    if (Array.isArray(v)) return (v as string[]).filter(Boolean).join(', ') || null;
    const s = String(v).trim();
    return s || null;
  };

  // Medications — dose/duration can be nested {value,unit} or plain string
  const rawMeds = Array.isArray(raw.medications) ? raw.medications as Record<string, unknown>[] : [];
  const medications = rawMeds.map(m => {
    const doseRaw = m.dose as Record<string, unknown> | string | undefined;
    const durRaw  = m.duration as Record<string, unknown> | string | undefined;
    const doseStr = (doseRaw && typeof doseRaw === 'object')
      ? `${(doseRaw as Record<string, unknown>).value ?? ''}${(doseRaw as Record<string, unknown>).unit ? ' ' + (doseRaw as Record<string, unknown>).unit : ''}`.trim()
      : String(doseRaw ?? '');
    const durStr = (durRaw && typeof durRaw === 'object')
      ? `${(durRaw as Record<string, unknown>).value ?? ''}${(durRaw as Record<string, unknown>).unit ? ' ' + (durRaw as Record<string, unknown>).unit : ''}`.trim()
      : String(durRaw ?? '');
    return {
      drug:      String(m.drugName ?? m.name ?? m.drug ?? ''),
      form:      String(m.form ?? m.drugType ?? ''),
      dose:      doseStr,
      frequency: String(m.frequency ?? m.timings ?? ''),
      duration:  durStr,
    };
  });

  // Vitals — DocuPipe uses {type, value, unit} not {label, value}
  const rawVitals = Array.isArray(raw.vitals) ? raw.vitals as Record<string, unknown>[] : [];
  const vitals = rawVitals
    .map(v => ({
      label: String(v.type ?? v.label ?? v.name ?? ''),
      value: [String(v.value ?? ''), String(v.unit ?? '')].filter(Boolean).join(' '),
    }))
    .filter(v => v.label && v.value);

  return {
    patient_name: patient.name   ?? raw.patientName,
    age,
    gender:       patient.gender ?? raw.gender,
    phone:        arrToStr(patient.phone ?? patient.contact ?? patient.mobile),
    blood_group:  arrToStr(patient.bloodGroup ?? patient.blood_group),
    // DocuPipe puts date at top level, also sometimes as patient.dateOfVisit
    date:         raw.date ?? raw.prescriptionDate ?? patient.dateOfVisit,
    // clinicName is top-level in DocuPipe, not nested
    hospital:     raw.clinicName ?? raw.hospital,
    doctor_name:  doctors.length ? String(doctors[0].name ?? '') : String(raw.doctorName ?? ''),
    // diagnosis and symptoms are arrays in DocuPipe
    diagnosis:    arrToStr(raw.diagnosis ?? raw.chiefComplaints ?? raw.knownMedicalConditions),
    symptoms:     arrToStr(raw.symptoms  ?? raw.chiefComplaints),
    precautions:  arrToStr(raw.precautions ?? raw.advice ?? raw.instructions),
    // investigations is an array in DocuPipe
    tests:        arrToStr(raw.investigations ?? raw.investigationsAdvised ?? raw.tests),
    dos:          arrToStr(raw.dos   ?? raw.do),
    donts:        arrToStr(raw.donts ?? raw.avoid ?? raw.restrictions),
    follow_up:    arrToStr(raw.followUp ?? raw.follow_up ?? raw.nextVisit ?? raw.reviewDate),
    vitals,
    medications,
  };
}

function mergeDocuPipe(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const pick = (k: string) => (a[k] != null && a[k] !== '' ? a[k] : b[k]);
  return {
    patient_name: pick('patient_name'),
    age:          pick('age'),
    gender:       pick('gender'),
    phone:        pick('phone'),
    blood_group:  pick('blood_group'),
    date:         pick('date'),
    hospital:     pick('hospital'),
    doctor_name:  pick('doctor_name'),
    diagnosis:    pick('diagnosis'),
    symptoms:     pick('symptoms'),
    precautions:  pick('precautions'),
    tests:        pick('tests'),
    dos:          pick('dos'),
    donts:        pick('donts'),
    follow_up:    pick('follow_up'),
    vitals: [
      ...((Array.isArray(a.vitals) ? a.vitals : []) as unknown[]),
      ...((Array.isArray(b.vitals) ? b.vitals : []) as unknown[]),
    ],
    medications: [
      ...((Array.isArray(a.medications) ? a.medications : []) as unknown[]),
      ...((Array.isArray(b.medications) ? b.medications : []) as unknown[]),
    ],
  };
}

async function tryDocuPipe(files: File[]): Promise<{ data: Record<string, unknown>; pages: number }> {
  const ids      = await Promise.all(files.map(f => dpUpload(f)));
  await Promise.all(ids.map(id => dpPoll(id)));
  const datas    = await Promise.all(ids.map(id => dpStandardise(id)));
  const data     = datas.length === 2 ? mergeDocuPipe(datas[0], datas[1]) : datas[0];
  return { data, pages: files.length };
}

// ═══════════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    const form  = await req.formData();
    const file1 = form.get('image')  as File | null;
    const file2 = form.get('image2') as File | null;
    if (!file1) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    const files = [file1, ...(file2 ? [file2] : [])];

    // Try Gemini first (fast)
    try {
      const result = await tryGemini(files);
      return NextResponse.json({ ...result, provider: 'gemini' });
    } catch {
      // Gemini failed — fall through to DocuPipe
    }

    // DocuPipe fallback (reliable)
    const result = await tryDocuPipe(files);
    return NextResponse.json({ ...result, provider: 'docupipe' });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
