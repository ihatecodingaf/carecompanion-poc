import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const BASE  = 'https://app.docupipe.ai';
const KEY   = process.env.DOCUPIPE_API_KEY!;

const GUIDELINES = `Indian hospital prescription. Extract:
- Patient name (Indian names, strip Mr/Ms/Dr prefix)
- Age (number only) and gender (Male/Female)
- Date in DD/MM/YY or DD/MM/YYYY format
- ALL medications as separate items: drug name, dose, frequency, duration
- Drug abbreviations: Tab=Tablet, Cap=Capsule, Inj=Injection; OD=once daily, BD=twice daily, TDS=thrice daily
- Doctor name (starts with Dr.)
- Follow-up date or duration (e.g. 2 weeks)`;

const INLINE_SCHEMA = {
  type: 'object',
  properties: {
    patient_name: { type: 'string',  description: 'Full patient name' },
    age:          { type: 'string',  description: 'Age as number' },
    gender:       { type: 'string',  description: 'Male or Female' },
    date:         { type: 'string',  description: 'Prescription date' },
    diagnosis:    { type: 'string' },
    doctor_name:  { type: 'string' },
    hospital:     { type: 'string' },
    follow_up:    { type: 'string' },
    medications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          drug:      { type: 'string' },
          dose:      { type: 'string' },
          frequency: { type: 'string' },
          duration:  { type: 'string' },
        },
      },
    },
  },
};

function extractId(body: Record<string, unknown>): string | null {
  return (
    (body.id          as string) ||
    (body.documentId  as string) ||
    (body._id         as string) ||
    ((body.document as Record<string, unknown> | undefined)?.id as string) ||
    null
  );
}

function isDone(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'completed' || s === 'done' || s === 'parsed' ||
         s === 'success'   || s === 'processed' || s === 'finished' ||
         s.startsWith('complet') || s.startsWith('success');
}

function isFailed(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'failed' || s === 'error' || s === 'cancelled';
}

async function uploadDoc(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const b64 = Buffer.from(buf).toString('base64');
  const raw = file.name.split('.').pop()?.toLowerCase() ?? 'png';
  const ext = raw === 'jpg' ? 'jpeg' : raw;

  const res = await fetch(`${BASE}/document`, {
    method:  'POST',
    headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ document: { file: { contents: b64 }, filename: 'prescription', fileExtension: ext } }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DocuPipe upload failed (${res.status}): ${text}`);
  }

  const body = await res.json() as Record<string, unknown>;
  const id = extractId(body);
  if (!id) throw new Error(`DocuPipe upload: no ID in response — ${JSON.stringify(body).slice(0, 300)}`);
  return id;
}

async function pollUntilDone(docId: string, maxMs = 55_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  let lastStatus = 'unknown';
  let polls = 0;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    polls++;
    try {
      const r = await fetch(`${BASE}/document/${docId}`, { headers: { 'X-API-Key': KEY } });
      if (!r.ok) { lastStatus = `http_${r.status}`; continue; }
      const d = await r.json() as Record<string, unknown>;
      lastStatus = String(d.status ?? d.state ?? d.processingStatus ?? 'unknown');
      if (isDone(lastStatus))   return;
      if (isFailed(lastStatus)) throw new Error(`DocuPipe processing failed (status: ${lastStatus})`);
    } catch (e) {
      if (e instanceof Error && e.message.includes('processing failed')) throw e;
    }
  }
  throw new Error(`DocuPipe timed out after ${polls} polls. Last status: "${lastStatus}"`);
}

async function standardise(docId: string): Promise<{ data: Record<string, unknown>; raw: unknown }> {
  const res = await fetch(`${BASE}/standardize`, {
    method:  'POST',
    headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ documentId: docId, effortLevel: 'high', guidelines: GUIDELINES, schema: INLINE_SCHEMA }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`DocuPipe standardize failed (${res.status}): ${txt}`);
  }

  const j = await res.json() as Record<string, unknown>;

  // DocuPipe "Medical Prescription" schema — actual field names verified against live API
  const raw     = (j.data ?? j) as Record<string, unknown>;
  const patient = (raw.patient  ?? raw.patientInformation ?? {}) as Record<string, unknown>;
  const clinic  = (raw.clinic   ?? raw.clinicInformation  ?? {}) as Record<string, unknown>;
  const doctors = Array.isArray(raw.doctors) ? raw.doctors as Record<string, unknown>[] : [];

  // age is a nested { value, unit } object
  const ageRaw = patient.age as Record<string, unknown> | string | number | undefined;
  const age = (ageRaw && typeof ageRaw === 'object')
    ? String((ageRaw as Record<string, unknown>).value ?? '')
    : String(ageRaw ?? '');

  const chiefComplaints = Array.isArray(raw.chiefComplaints)
    ? (raw.chiefComplaints as string[]).join(', ') : null;
  const knownConditions = Array.isArray(raw.knownMedicalConditions)
    ? (raw.knownMedicalConditions as string[]).join(', ') : null;

  const rawMeds = Array.isArray(raw.medications) ? raw.medications as Record<string, unknown>[] : [];
  const medications = rawMeds.map(m => {
    const doseObj = m.dose as Record<string, unknown> | undefined;
    const durObj  = m.duration as Record<string, unknown> | undefined;
    return {
      drug:      String(m.name     ?? m.drugName  ?? ''),
      form:      String(m.form     ?? m.drugType  ?? ''),
      dose:      doseObj ? `${doseObj.value ?? ''}${doseObj.unit ? ' ' + doseObj.unit : ''}`.trim() : String(m.dose ?? ''),
      frequency: String(m.frequency ?? m.timings  ?? ''),
      duration:  durObj  ? `${durObj.value ?? ''}${durObj.unit ? ' ' + durObj.unit : ''}`.trim() : String(m.duration ?? ''),
    };
  });

  const data: Record<string, unknown> = {
    patient_name: patient.name ?? raw.patientName ?? raw.patient_name,
    age,
    gender:      patient.gender  ?? raw.gender,
    date:        raw.prescriptionDate ?? raw.date,
    hospital:    clinic.name    ?? raw.clinicName  ?? raw.hospital,
    doctor_name: doctors.length ? String(doctors[0].name ?? '') : String(raw.doctorName ?? raw.doctor_name ?? ''),
    diagnosis:   raw.diagnosis  ?? chiefComplaints ?? knownConditions,
    follow_up:   raw.followUp   ?? raw.follow_up,
    medications,
  };

  return { data, raw: j };
}

function mergeResults(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const pick = (k: string) => (a[k] != null && a[k] !== '' ? a[k] : b[k]);
  const medsA = Array.isArray(a.medications) ? a.medications as unknown[] : [];
  const medsB = Array.isArray(b.medications) ? b.medications as unknown[] : [];
  return {
    patient_name: pick('patient_name'),
    age:          pick('age'),
    gender:       pick('gender'),
    diagnosis:    pick('diagnosis'),
    hospital:     pick('hospital'),
    doctor_name:  pick('doctor_name'),
    follow_up:    pick('follow_up'),
    date:         pick('date'),
    medications:  [...medsA, ...medsB],
  };
}

export async function POST(req: NextRequest) {
  try {
    const form  = await req.formData();
    const file1 = form.get('image')  as File | null;
    const file2 = form.get('image2') as File | null;

    if (!file1) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    const files       = [file1, ...(file2 ? [file2] : [])];
    const docIds      = await Promise.all(files.map(f => uploadDoc(f)));
    await Promise.all(docIds.map(id => pollUntilDone(id)));
    const standardised = await Promise.all(docIds.map(id => standardise(id)));
    const datas       = standardised.map(s => s.data);
    const merged      = datas.length === 2 ? mergeResults(datas[0], datas[1]) : datas[0];

    return NextResponse.json({ data: merged, pages: docIds.length, _raw: standardised.map(s => s.raw) });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
