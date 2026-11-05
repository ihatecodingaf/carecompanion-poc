import { supabase } from './supabase';
import type {
  DoctorClinic, DoctorProfile, DashboardData,
  OcrResult, NewPatientDraft, RegisteredPatientSummary,
} from '../store/useStore';

// ── Doctor / Dashboard ────────────────────────────────────────────────────────

export async function getDoctorClinics(authUserId: string): Promise<DoctorClinic[]> {
  const { data, error } = await supabase.rpc('get_doctor_clinics', {
    p_auth_user_id: authUserId,
  });
  if (error) throw error;
  return (data as DoctorClinic[]) ?? [];
}

export async function getDoctorProfile(authUserId: string): Promise<DoctorProfile | null> {
  const { data, error } = await supabase.rpc('get_doctor_profile', {
    p_auth_user_id: authUserId,
  });
  if (error) throw error;
  return data as DoctorProfile | null;
}

export async function getDoctorDashboard(authUserId: string): Promise<DashboardData> {
  const { data, error } = await supabase.rpc('get_doctor_dashboard', {
    p_auth_user_id: authUserId,
  });
  if (error) throw error;
  return (data as DashboardData) ?? { patients: [], alerts: [], stats: {} };
}

/** Bypass-auth version (demo / PWA) — no Supabase Auth needed */
export async function getDoctorDashboardById(
  doctorId: string,
  orgSlug: string,
): Promise<DashboardData> {
  const { data, error } = await supabase.rpc('get_doctor_dashboard_bypass', {
    p_doctor_id: doctorId,
    p_org_slug:  orgSlug,
  });
  if (error) throw error;
  return (data as DashboardData) ?? { patients: [], alerts: [], stats: {} };
}

export async function sendDoctorMessage(
  patientId: string,
  orgSlug: string,
  content: string,
  doctorId: string,
): Promise<void> {
  const { error } = await supabase.rpc('send_doctor_message', {
    p_patient_id: patientId,
    p_org_slug:   orgSlug,
    p_content:    content,
    p_doctor_id:  doctorId,
  });
  if (error) throw error;
}

// ── Patient Detail ────────────────────────────────────────────────────────────

export interface PatientDetail {
  patient:  Record<string, unknown>;
  checkins: Array<Record<string, unknown>>;
  alerts:   Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
}

export async function getPatientDetail(
  patientId: string,
  orgSlug: string,
): Promise<PatientDetail> {
  const { data, error } = await supabase.rpc('get_patient_detail', {
    patient_id: patientId,
    org_slug:   orgSlug,
  });
  if (error) throw error;
  return (data as PatientDetail) ?? { patient: {}, checkins: [], alerts: [], messages: [] };
}

// ── OCR / Patient Registration ────────────────────────────────────────────────

/**
 * Two-step prescription extraction:
 *  1. Call OCR.space from the browser (key is in VITE_ env, Engine 2 for handwriting).
 *  2. Send the raw text to the `extract-prescription` edge function, which calls
 *     Claude to parse it into structured patient JSON.
 */
export async function extractPrescription(images: string[]): Promise<OcrResult> {
  // ── Step 1: OCR in the browser ──────────────────────────────────────────
  let rawText = '';
  const ocrKey = import.meta.env.VITE_OCR_SPACE_API_KEY as string | undefined;

  if (ocrKey) {
    try {
      rawText = await runOcrSpace(images, ocrKey);
    } catch (e) {
      console.warn('OCR.space failed, continuing with empty text:', e);
    }
  } else {
    console.warn('VITE_OCR_SPACE_API_KEY not set — skipping OCR step');
  }

  // ── Step 2: Claude structures the raw text ─────────────────────────────
  // Dev shortcut: direct browser call when VITE_ANTHROPIC_API_KEY is set locally
  // (never set this in production — key must stay server-side)
  const devAnthropicKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
  if (devAnthropicKey && rawText.trim()) {
    try {
      return await claudeStructureDirect(rawText, devAnthropicKey);
    } catch (e) {
      console.warn('Direct Claude call failed, falling through:', e);
    }
  }

  // Primary production path: edge function (ANTHROPIC_API_KEY stays server-side)
  // Handles any hospital format — Ramaiah, Jupiter, Apollo, handwritten notes, etc.
  if (rawText.trim()) {
    try {
      const { data, error } = await supabase.functions.invoke('extract-prescription', {
        body: { rawText },
      });
      if (!error && data) return data as OcrResult;
      console.warn('Edge function failed, falling back to regex:', error?.message);
    } catch (e) {
      console.warn('Edge function unreachable, falling back to regex:', e);
    }
  }

  // Fallback: regex parser (free, works offline, but layout-dependent)
  if (rawText.trim()) {
    return regexExtract(rawText);
  }

  return { ...DEMO_OCR_RESULT, raw_text: rawText || DEMO_OCR_RESULT.raw_text };
}

// ── Regex-based prescription parser ──────────────────────────────────────────
function regexExtract(raw: string): OcrResult {
  const text = raw.replace(/\r\n/g, '\n');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // ── Step 1: build a normalised field map ────────────────────────────────
  // Scan every line. If it looks like a label, grab the value from the same
  // line OR the next non-empty line (up to 4 lines ahead), handling patterns:
  //   "Patient Name: Raj Kumar"          → same line
  //   "Patient Name\n: Raj Kumar"        → colon on next line
  //   "Patient Name\nRaj Kumar"          → bare value on next line
  //   "Patient Name\n\nRaj Kumar"        → blank gap then value
  const fieldMap: Record<string, string> = {};
  const labelOnlyRe  = /^([A-Za-z][A-Za-z\s./()]{1,35}?)\s*:?\s*$/;
  const labelValueRe = /^([A-Za-z][A-Za-z\s./()]{1,35}?)\s*:\s*(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const lv = lines[i].match(labelValueRe);
    if (lv) {
      fieldMap[lv[1].trim().toLowerCase()] = lv[2].trim();
      continue;
    }
    const lo = lines[i].match(labelOnlyRe);
    if (lo) {
      // look ahead up to 4 lines for the value
      for (let j = i + 1; j <= Math.min(i + 4, lines.length - 1); j++) {
        const raw      = lines[j];
        const explicit = /^[:\s]/.test(raw);  // line starts with ":" → definitely a value
        const candidate = raw.replace(/^[:\s]+/, '').trim();
        if (!candidate) continue;
        // only stop if next line looks like a label AND it wasn't an explicit ": value" line
        if (!explicit && (labelOnlyRe.test(candidate) || labelValueRe.test(candidate))) break;
        fieldMap[lo[1].trim().toLowerCase()] = candidate;
        break;
      }
    }
  }

  // ── Step 1.5: two-column table detection ────────────────────────────────
  // Handles OCR output that scans columns separately, producing all labels
  // before all values: "NAME\nAGE/SEX\nDATE\n...\nSHRISTI\n21 YRS/F\n..."
  {
    let i = 0;
    while (i < lines.length) {
      if (!labelOnlyRe.test(lines[i]) || labelValueRe.test(lines[i])) { i++; continue; }
      // count consecutive label-only lines
      let j = i;
      while (j < lines.length && labelOnlyRe.test(lines[j]) && !labelValueRe.test(lines[j])) j++;
      const count = j - i;
      if (count >= 2 && j + count <= lines.length) {
        // verify the next `count` lines are all non-labels (the value column)
        let allValues = true;
        for (let k = 0; k < count; k++) {
          if (labelOnlyRe.test(lines[j + k]) || labelValueRe.test(lines[j + k])) {
            allValues = false;
            break;
          }
        }
        if (allValues) {
          for (let k = 0; k < count; k++) {
            const lbl = lines[i + k].replace(/\s*:?\s*$/, '').trim().toLowerCase();
            const val = lines[j + k].replace(/^[:\s]+/, '').trim();
            if (val && !fieldMap[lbl]) fieldMap[lbl] = val;
          }
        }
      }
      i = count >= 2 ? j : i + 1;
    }
  }

  // ── Step 2: fuzzy lookup from field map ─────────────────────────────────
  // Tries each alias against every key in the map (substring both ways).
  const lookup = (aliases: string[]): string => {
    for (const alias of aliases) {
      const a = alias.toLowerCase().replace(/\\/g, '').replace(/[()]/g, '');
      for (const [k, v] of Object.entries(fieldMap)) {
        if (k.includes(a) || a.includes(k)) return v;
      }
    }
    return '';
  };

  // ── Step 3: multi-line block collector ──────────────────────────────────
  const STOP_KEYS = ['diagnosis', 'dx', 'treatment', 'rx', 'medication', 'medicine',
                     'precaution', 'test', 'investigation', 'follow', 'f/u', "do's", "don't", 'avoid'];
  const block = (startAliases: string[]): string => {
    const startRe = new RegExp(`^(?:${startAliases.join('|')})[:\\s]`, 'i');
    const stopRe  = new RegExp(`^(?:${STOP_KEYS.join('|')})[:\\s]`, 'i');
    let collecting = false;
    const collected: string[] = [];
    for (const line of lines) {
      if (startRe.test(line)) {
        collecting = true;
        const inline = line.replace(startRe, '').trim();
        if (inline) collected.push(inline);
        continue;
      }
      if (collecting) {
        if (stopRe.test(line)) break;
        collected.push(line);
      }
    }
    // fallback: pull from fieldMap
    if (!collected.length) {
      const v = lookup(startAliases);
      if (v) collected.push(v);
    }
    return collected.join('\n').trim();
  };

  // ── Step 4: extract each field ───────────────────────────────────────────

  // Name
  let name = lookup(['patient name', 'name of patient', 'full name', 'patient',
                     'pt name', 'pt.', 'p.name', 'name', 'mr.', 'mrs.', 'ms.']);
  // Strip honorific prefix (Ms., Mr., Mrs., Dr.)
  name = name.replace(/^(mr\.?|mrs\.?|ms\.?|dr\.?)\s+/i, '').trim();

  // Phone
  let phone = lookup(['phone no', 'phone number', 'mobile no', 'mobile number', 'mob no',
                      'mob.', 'contact no', 'contact number', 'ph no', 'cell no',
                      'tel no', 'whatsapp', 'no.', 'phone', 'mobile', 'contact']);
  if (!phone) {
    const m = text.match(/(?:\+91[\s-]?)?[6-9]\d{9}/);
    if (m) phone = m[0].startsWith('+') ? m[0] : `+91 ${m[0]}`;
  }
  // keep only the phone number, strip trailing noise
  phone = (phone.match(/(?:\+91[\s-]?)?[6-9]\d{9}/) ?? [''])[0];
  if (phone && !phone.startsWith('+')) phone = `+91 ${phone}`;

  // Age
  const normaliseAge = (v: string) =>
    v.replace(/\s*(yr|yrs|years?|Y\b).*/i, '')
     .replace(/[\/|].*/, '')
     .replace(/:.*/, '')        // strip DOB-suffix e.g. "021:08:18" → "021"
     .replace(/^0+(\d)/, '$1') // strip leading zeros e.g. "021" → "21"
     .trim();
  let age = normaliseAge(lookup(['age of patient', 'patient age', 'age in years', 'age', 'yrs', 'years']));
  if (!age) {
    const m = text.match(/\b(\d{1,3})\s*(?:yr|yrs|years?|Y)\b/i)
           || text.match(/\bAge[:\s]+(\d{1,3})/i)
           || text.match(/\b(\d{1,3})\s*[\/|]\s*(?:M|F)\b/i);
    if (m) age = m[1];
  }

  // Gender
  const normaliseGender = (g: string) => {
    const v = g.trim().split(/[\s,/]/)[0]; // take first token
    if (/^m(ale)?$/i.test(v)) return 'Male';
    if (/^f(emale)?$/i.test(v)) return 'Female';
    if (/^o(ther)?$/i.test(v)) return 'Other';
    return '';
  };
  let gender = normaliseGender(lookup(['patient gender', 'patient sex', 'gender', 'sex']));
  if (!gender) {
    // handles "21/F", "21 YRS / F", "21Y/M" etc.
    const m = text.match(/\b(\d{1,3})\s*(?:yrs?|years?)?\s*[\/|]\s*(M|F)\b/i) || text.match(/\b(Male|Female)\b/i);
    if (m) gender = normaliseGender(m[m.length - 1]);
  }

  // Blood group
  let blood_group = lookup(['blood group', 'blood type', 'b. group', 'b group', 'bg', 'b.g', 'blood']);
  if (!blood_group) {
    const m = text.match(/\b(A|B|AB|O)\s*[+\-]\b/);
    if (m) blood_group = m[0].replace(/\s/, '');
  }
  blood_group = (blood_group.match(/^(A|B|AB|O)\s*([+-])/i) ?? [''])[0].replace(/\s/, '');

  // Condition
  const t = text.toLowerCase();
  let condition = 'acne';
  if (/hair transplant|fue surgery|fut|graft|donor area/.test(t))                                condition = 'ht';
  else if (/hair loss|alopecia|bald|androgenetic|norwood|ludwig|miniaturis|prp|fue/.test(t))      condition = 'aga';
  else if (/implant|osseointegration|titanium post|crown/.test(t))                                condition = 'implant';
  else if (/root canal|endodontic|pulp\b|rct|obturation/.test(t))                                condition = 'rct';
  else if (/\bextract|\bsocket|post.extract|wisdom tooth/.test(t))                               condition = 'extract';
  else if (/acne|pimple|comedon|retinoid|isotretinoin|co2 laser|chemical peel|clindamycin/.test(t)) condition = 'acne';

  // Clinical fields
  const treatment_name = lookup(['treatment', 'procedure', 'plan', 'rx']);
  const symptoms       = block(['Symptoms?', 'Complaints?', 'C/O', 'CC', 'Chief Complaint']);
  const diagnosis      = block(['Diagnosis', 'Dx', 'Impression']);
  const precautions    = block(['Precautions?', 'Cautions?']);
  const tests          = block(['Tests?', 'Investigations?', 'Lab']);
  const dos            = block(["Do'?s?", 'Dos']);
  const donts          = block(["Don'?ts?", 'Avoid', 'Contraindications?']);

  // Medications: prefer labeled lines (Tab./Cap./numbered) over block
  const medLineRe = /^(?:Tab\.?|Cap\.?|Inj\.?|Syr\.?|Oint\.?|\d+[.)]\s|[•\-]\s)/i;
  const medications = lines.filter(l => medLineRe.test(l)).join('\n')
    || block(['Medications?', 'Medicines?', 'Rx', 'Drugs?']);

  // Follow-up date
  let follow_up_date = '';
  const fuRaw = lookup(['follow up', 'follow-up', 'followup', 'f/u', 'next visit', 'review date', 'review']);
  if (fuRaw) {
    const dm = fuRaw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dm) {
      const yr = dm[3].length === 2 ? `20${dm[3]}` : dm[3];
      follow_up_date = `${yr}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
    } else {
      const im = fuRaw.match(/\d{4}-\d{2}-\d{2}/);
      if (im) follow_up_date = im[0];
    }
  }

  return {
    name, phone, age, gender, blood_group,
    condition, treatment_name,
    symptoms, diagnosis, medications, precautions,
    tests, follow_up_date, dos, donts,
    current_day: '0',
    raw_text: raw,
  };
}

function buildExtractionPrompt(today: string): string {
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

/** Dev-only: call Claude directly from the browser using VITE_ANTHROPIC_API_KEY. */
async function claudeStructureDirect(rawText: string, apiKey: string): Promise<OcrResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1536,
      messages: [{
        role:    'user',
        content: `${buildExtractionPrompt(new Date().toISOString().slice(0, 10))}\n\nRaw OCR text:\n\`\`\`\n${rawText.slice(0, 8000)}\n\`\`\``,
      }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);

  const json   = await res.json() as { content: Array<{ text: string }> };
  const text   = json.content?.[0]?.text ?? '{}';
  const clean  = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
  const parsed = JSON.parse(clean) as OcrResult;
  parsed.raw_text = rawText;
  return parsed;
}

/** Compress a base64 image to stay under OCR.space's 1MB free-tier limit. */
async function compressImage(base64DataUri: string, maxSizeKb = 900): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(base64DataUri); // fallback: send original
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      const maxPx = 2000;
      if (width > maxPx || height > maxPx) {
        const ratio = Math.min(maxPx / width, maxPx / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);

      let quality = 0.85;
      let result  = canvas.toDataURL('image/jpeg', quality);
      while (result.length > maxSizeKb * 1024 * 1.37 && quality > 0.3) {
        quality -= 0.1;
        result   = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(result);
    };
    img.src = base64DataUri;
  });
}

/** Call OCR.space for each image and return the combined text. */
async function runOcrSpace(images: string[], apiKey: string): Promise<string> {
  const pageTexts: string[] = [];

  for (const img of images.slice(0, 4)) {  // max 4 pages
    const compressed = await compressImage(img);
    const body = new FormData();
    body.append('base64Image',       compressed);
    body.append('language',          'eng');
    body.append('isOverlayRequired', 'false');
    body.append('OCREngine',         '1');   // Engine 1: reliable on free tier
    body.append('scale',             'true');
    body.append('detectOrientation', 'true');

    const res = await fetch('https://api.ocr.space/parse/image', {
      method:  'POST',
      headers: { apikey: apiKey },
      body,
    });

    if (!res.ok) throw new Error(`OCR.space HTTP ${res.status}`);

    const json = await res.json() as {
      IsErroredOnProcessing: boolean;
      ErrorMessage?: string[];
      ParsedResults?: Array<{ ParsedText: string }>;
    };

    if (json.IsErroredOnProcessing) {
      throw new Error(json.ErrorMessage?.[0] ?? 'OCR.space error');
    }

    const text = json.ParsedResults?.map((r) => r.ParsedText).join('\n') ?? '';
    pageTexts.push(text);
  }

  return pageTexts.join('\n\n--- Page Break ---\n\n');
}

/** Upload a patient photo (base64) to Google Drive (via edge function). */
export async function uploadPatientPhoto(
  base64Data: string,
  patientId: string,
  filename: string,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('upload-to-drive', {
    body: { base64Data, patientId, filename },
  });

  if (error) {
    // Fallback: store in Supabase Storage if Drive isn't configured
    console.warn('upload-to-drive unavailable, falling back to Supabase Storage:', error.message);
    return await uploadToSupabaseStorage(base64Data, patientId, filename);
  }

  return (data as { url: string }).url;
}

/** Supabase Storage fallback for patient photos */
async function uploadToSupabaseStorage(
  base64Data: string,
  patientId: string,
  filename: string,
): Promise<string> {
  // Convert base64 to Blob
  const byteString = atob(base64Data.replace(/^data:image\/\w+;base64,/, ''));
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  const blob = new Blob([ab], { type: 'image/jpeg' });

  const path = `patients/${patientId}/${filename}`;
  const { error } = await supabase.storage
    .from('patient-photos')
    .upload(path, blob, { upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from('patient-photos').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Register a new patient via the register_patient RPC.
 * Returns the new patient_id.
 */
export async function registerPatient(
  orgSlug: string,
  doctorId: string,
  draft: NewPatientDraft,
): Promise<RegisteredPatientSummary> {
  const { data, error } = await supabase.rpc('register_patient', {
    p_org_slug:  orgSlug,
    p_doctor_id: doctorId,
    p_data:      draft,
  });
  if (error) throw error;
  return data as RegisteredPatientSummary;
}

// ── Real-time Subscriptions ───────────────────────────────────────────────────

export function subscribeToCheckins(
  orgSlugs: string[],
  doctorRowIds: string[],
  onNew: (checkin: Record<string, unknown>) => void,
) {
  const channels = orgSlugs.map((slug, i) =>
    supabase
      .channel(`checkins-${slug}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: `org_${slug}`, table: 'checkins' },
        (payload) => {
          if (doctorRowIds[i]) onNew({ ...payload.new, org_slug: slug });
        },
      )
      .subscribe(),
  );
  return () => channels.forEach((c) => supabase.removeChannel(c));
}

export function subscribeToAlerts(
  orgSlugs: string[],
  onNew: (alert: Record<string, unknown>) => void,
) {
  const channels = orgSlugs.map((slug) =>
    supabase
      .channel(`alerts-${slug}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: `org_${slug}`, table: 'alerts' },
        (payload) => onNew({ ...payload.new, org_slug: slug }),
      )
      .subscribe(),
  );
  return () => channels.forEach((c) => supabase.removeChannel(c));
}

// ── Demo fallback OCR result ──────────────────────────────────────────────────

const DEMO_OCR_RESULT: OcrResult = {
  name:           'Arjun Sharma',
  phone:          '+91 98112 34567',
  age:            '34',
  gender:         'Male',
  blood_group:    'B+',
  condition:      'aga',
  treatment_name: 'PRP Therapy',
  symptoms:       'Diffuse hair thinning at crown and temporal regions. Increased hair fall last 6 months.',
  diagnosis:      'Androgenetic Alopecia — Norwood Stage III Vertex. Miniaturisation confirmed. Density 148 hairs/cm².',
  medications:    'Minoxidil 5% topical daily · Finasteride 1mg oral daily · Biotin 10mg oral daily',
  current_day:    '0',
  precautions:    'No sun 72hr. No hair wash 48hr. No swimming 2 weeks.',
  tests:          'DHT, Testosterone. Ferritin, Vit D3, B12.',
  follow_up_date: new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10),
  dos:            '• Apply Minoxidil nightly\n• Massage scalp 2 min\n• Take meds as prescribed\n• Protein-rich diet\n• Sleep 7-8hrs · Drink 2-3L water',
  donts:          '• Never skip Finasteride\n• No alcohol/smoking\n• No chemical treatments\n• No heating tools\n• No pools 2wks post-PRP',
  raw_text:       '[DEMO — OCR.space not configured]',
};
