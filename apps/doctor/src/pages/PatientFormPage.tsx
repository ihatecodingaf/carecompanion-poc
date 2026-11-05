import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { registerPatient } from '../lib/api';
import type { VitalEntry, NewPatientDraft } from '../store/useStore';

// ── Condition → Treatment map ─────────────────────────────────────────────────
const CONDITIONS: Array<{ value: string; label: string }> = [
  { value: 'aga',     label: 'Androgenetic Alopecia (Male)' },
  { value: 'acne',    label: 'Acne Vulgaris (Mild-Moderate)' },
  { value: 'ht',      label: 'Post-Hair Transplant (FUE/FUT)' },
  { value: 'implant', label: 'Post-Dental Implant Healing' },
  { value: 'extract', label: 'Post-Extraction (Dental)' },
  { value: 'rct',     label: 'Post-Root Canal' },
];

const TX_MAP: Record<string, string[]> = {
  aga:     ['PRP Therapy', 'Hair Transplant (FUE)', 'Hair Transplant (FUT)', 'PRP + Transplant'],
  acne:    ['Topical Retinoid', 'Chemical Peel', 'CO2 Laser', 'Oral Antibiotics'],
  ht:      ['Post-FUE Protocol', 'PRP Graft Survival', 'Growth Factor Therapy'],
  implant: ['Antibiotic Protocol', 'Chlorhexidine Rinse', 'Osseointegration Monitoring'],
  extract: ['Post-Extraction Meds', 'Socket Care', 'Cold Compression Protocol'],
  rct:     ['Post-RCT Antibiotics', 'Crown Placement', 'Pain Management'],
};

const DEFAULT_VITALS: VitalEntry[] = [
  { label: 'Pulse',  value: '' },
  { label: 'BP',     value: '' },
  { label: 'SPO2',   value: '' },
  { label: 'Weight', value: '' },
];

function isOcrPrefilled(val: string): boolean {
  return val.trim().length > 0;
}

// Teal-bordered "pre-filled" class
const preFilled = (filled: boolean): React.CSSProperties => filled
  ? {
      borderColor: 'rgba(43,191,191,0.5)',
      background:  'rgba(43,191,191,0.04)',
    }
  : {};

export default function PatientFormPage() {
  const navigate          = useNavigate();
  const ocr               = useStore((s) => s.ocrResult);
  const doctor            = useStore((s) => s.doctor);
  const clinics           = useStore((s) => s.clinics);
  const setLastRegistered = useStore((s) => s.setLastRegistered);
  const setDraft          = useStore((s) => s.setNewPatientDraft);

  const primaryClinic = clinics.find((c) => c.is_primary) ?? clinics[0];
  const orgSlug       = primaryClinic?.org_slug ?? 'care_demo';
  const doctorId      = doctor?.id ?? primaryClinic?.doctor_row_id ?? 'dr-martinez-001';

  // ── Form state (pre-filled from OCR where available) ─────────────────────
  const [name,          setName]          = useState(ocr?.name           ?? '');
  const [phone,         setPhone]         = useState(ocr?.phone          ?? '');
  const [age,           setAge]           = useState(ocr?.age            ?? '');
  const [gender,        setGender]        = useState(ocr?.gender         ?? 'Male');
  const [bloodGroup,    setBloodGroup]    = useState(ocr?.blood_group    ?? '');
  const [admissionDate, setAdmissionDate] = useState(new Date().toISOString().slice(0, 10));
  const [condition,     setCondition]     = useState(ocr?.condition      ?? 'aga');
  const [treatment,     setTreatment]     = useState(
    ocr?.treatment_name ?? (TX_MAP[ocr?.condition ?? 'aga']?.[0] ?? ''),
  );
  const [symptoms,      setSymptoms]      = useState(ocr?.symptoms        ?? '');
  const [diagnosis,     setDiagnosis]     = useState(ocr?.diagnosis       ?? '');
  const [medications,   setMedications]   = useState(ocr?.medications     ?? '');
  const [precautions,   setPrecautions]   = useState(ocr?.precautions     ?? '');
  const [tests,         setTests]         = useState(ocr?.tests           ?? '');
  const [followUpDate,  setFollowUpDate]  = useState(ocr?.follow_up_date  ?? '');
  const [dos,           setDos]           = useState(ocr?.dos             ?? '');
  const [donts,         setDonts]         = useState(ocr?.donts           ?? '');
  const [vitals,        setVitals]        = useState<VitalEntry[]>(DEFAULT_VITALS);
  const [photoDataUrl,  setPhotoDataUrl]  = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  const photoRef = useRef<HTMLInputElement>(null);

  // ── Condition change → reset treatment ───────────────────────────────────
  function handleConditionChange(val: string) {
    setCondition(val);
    setTreatment(TX_MAP[val]?.[0] ?? '');
  }

  // ── Photo capture ─────────────────────────────────────────────────────────
  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  // ── Vitals ────────────────────────────────────────────────────────────────
  function updateVital(i: number, field: keyof VitalEntry, val: string) {
    setVitals((prev) => prev.map((v, idx) => idx === i ? { ...v, [field]: val } : v));
  }

  function addVital()        { setVitals((p) => [...p, { label: '', value: '' }]); }
  function removeVital(i: number) { setVitals((p) => p.filter((_, idx) => idx !== i)); }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!name.trim() || !phone.trim()) {
      setError('Patient name and phone are required.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Photo upload skipped for now (Google Drive not yet configured).
      // The captured photo shows in-form only; set to null in DB.
      const photoUrl: string | null = null;

      // 2. Build draft
      const draft: NewPatientDraft = {
        name, phone, age, gender,
        blood_group:    bloodGroup,
        condition,
        treatment_name: treatment,
        symptoms, diagnosis, medications, precautions, tests,
        follow_up_date: followUpDate,
        dos, donts,
        current_day: '0',
        raw_text:  ocr?.raw_text ?? '',
        photo_url: photoUrl,
        vitals,
        doctor_id: doctorId,
        org_slug:  orgSlug,
      };

      setDraft(draft);

      // 3. Register
      const summary = await registerPatient(orgSlug, doctorId, draft);
      setLastRegistered(summary);
      navigate('/add-patient/success');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="flex flex-col"
      style={{ minHeight: '100dvh', background: 'var(--bg)' }}
    >
      {/* ── Back bar ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-3.5"
        style={{ height: 44, background: 'var(--bg2)', borderBottom: '1px solid var(--b)' }}
      >
        <button
          onClick={() => navigate('/add-patient')}
          className="flex items-center gap-1 text-[0.72rem] font-semibold"
          style={{ color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ‹ Upload
        </button>
        <span className="text-[0.8rem] font-bold" style={{ color: 'var(--t)' }}>
          New Patient
        </span>
        {ocr && (
          <div
            className="flex items-center gap-1 rounded-full px-2 py-0.5"
            style={{ background: 'rgba(43,191,191,0.12)', border: '1px solid rgba(43,191,191,0.3)' }}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--teal)' }} />
            <span className="text-[0.52rem] font-bold" style={{ color: 'var(--teal)' }}>AI-filled</span>
          </div>
        )}
      </div>

      {/* ── Scrollable form ── */}
      <div className="flex-1 overflow-y-auto no-scroll px-3 py-3">

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4">
          <StepDot n={1} done />
          <div className="w-7 h-0.5" style={{ background: 'var(--teal)', opacity: 0.5 }} />
          <StepDot n={2} active />
          <div className="w-7 h-0.5" style={{ background: 'var(--b)' }} />
          <StepDot n={3} />
          <span className="text-[0.6rem] ml-1" style={{ color: 'var(--t2)' }}>
            Review &amp; complete patient details
          </span>
        </div>

        {/* ── Patient Photo ── */}
        <Card title="📷 Patient Photo">
          <div className="flex items-center gap-3">
            <button
              onClick={() => photoRef.current?.click()}
              className="flex-1 flex items-center gap-2 rounded-xl px-3.5 py-3 text-[0.7rem]
                         font-semibold transition-transform active:scale-[0.97]"
              style={{ background: 'var(--bg4)', border: '1.5px solid var(--b)', color: 'var(--t2)', cursor: 'pointer' }}
            >
              <span className="text-xl">📷</span>
              {photoDataUrl ? 'Retake Photo' : 'Take Photo'}
            </button>
            <div
              className="w-[64px] h-[64px] rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ background: 'var(--bg4)', border: '1px solid var(--b)', fontSize: '1.3rem' }}
            >
              {photoDataUrl
                ? <img src={photoDataUrl} alt="preview" className="w-full h-full object-cover" />
                : '🤷'}
            </div>
          </div>
          <input ref={photoRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhoto} />
        </Card>

        {/* ── Patient Info ── */}
        <Card
          title="👤 Patient Information"
          badge={ocr ? 'Extracted' : undefined}
          className="mt-2"
        >
          <div className="grid grid-cols-2 gap-2 mb-2">
            <FormField label="Full Name *">
              <input
                className="fi"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={preFilled(isOcrPrefilled(ocr?.name ?? ''))}
                placeholder="Patient full name"
              />
            </FormField>
            <FormField label="Phone *">
              <input
                className="fi"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={preFilled(isOcrPrefilled(ocr?.phone ?? ''))}
                placeholder="+91 XXXXX XXXXX"
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <FormField label="Age">
              <input
                className="fi"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                style={preFilled(isOcrPrefilled(ocr?.age ?? ''))}
                placeholder="34"
              />
            </FormField>
            <FormField label="Gender">
              <select className="fi" value={gender} onChange={(e) => setGender(e.target.value)}>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Blood Group">
              <input
                className="fi"
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                style={preFilled(isOcrPrefilled(ocr?.blood_group ?? ''))}
                placeholder="B+"
              />
            </FormField>
            <FormField label="Admission Date">
              <input
                className="fi"
                type="date"
                value={admissionDate}
                onChange={(e) => setAdmissionDate(e.target.value)}
              />
            </FormField>
          </div>
        </Card>

        {/* ── Vitals ── */}
        <Card title="💓 Vitals at Admission" className="mt-2">
          <div className="flex flex-wrap gap-2 mb-2">
            {vitals.map((v, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1"
                style={{ background: 'var(--bg4)', border: '1px solid var(--b)' }}
              >
                <input
                  className="text-[0.56rem] font-bold w-[32px] bg-transparent border-none outline-none"
                  style={{ color: 'var(--t3)' }}
                  value={v.label}
                  onChange={(e) => updateVital(i, 'label', e.target.value)}
                  placeholder="Name"
                />
                <input
                  className="text-[0.68rem] w-[60px] bg-transparent border-none outline-none"
                  style={{ color: 'var(--t)' }}
                  value={v.value}
                  onChange={(e) => updateVital(i, 'value', e.target.value)}
                  placeholder="Value"
                />
                <button
                  onClick={() => removeVital(i)}
                  className="text-[0.72rem]"
                  style={{ color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addVital}
            className="text-[0.58rem] font-semibold px-2.5 py-1.5 rounded-lg"
            style={{
              background: 'transparent',
              border: '1.5px dashed var(--b)',
              color: 'var(--teal)',
              cursor: 'pointer',
            }}
          >
            + Add vital
          </button>
        </Card>

        {/* ── Disease & Treatment ── */}
        <Card title="🩺 Disease & Treatment" className="mt-2">
          <FormField label="Condition *" className="mb-3">
            <select
              className="fi"
              value={condition}
              onChange={(e) => handleConditionChange(e.target.value)}
              style={preFilled(isOcrPrefilled(ocr?.condition ?? ''))}
            >
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </FormField>

          <div className="text-[0.57rem] font-bold uppercase tracking-[0.04em] mb-2" style={{ color: 'var(--t3)' }}>
            Treatment Protocol *
          </div>
          <div className="flex flex-wrap gap-2">
            {(TX_MAP[condition] ?? []).map((tx) => (
              <label key={tx} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="treatment"
                  value={tx}
                  checked={treatment === tx}
                  onChange={() => setTreatment(tx)}
                  className="sr-only"
                />
                <div
                  className="text-[0.64rem] font-medium px-2.5 py-1.5 rounded-lg transition-colors"
                  style={{
                    background: treatment === tx ? 'rgba(43,191,191,0.1)' : 'var(--bg4)',
                    border: `1.5px solid ${treatment === tx ? 'var(--teal)' : 'var(--b)'}`,
                    color:  treatment === tx ? 'var(--teal)' : 'var(--t2)',
                  }}
                >
                  {tx}
                </div>
              </label>
            ))}
          </div>
        </Card>

        {/* ── Clinical Details ── */}
        <Card
          title="📋 Clinical Details"
          badge={ocr ? 'Auto-filled' : undefined}
          className="mt-2"
        >
          <FormField label="Symptoms">
            <textarea
              className="fi"
              style={{ ...preFilled(isOcrPrefilled(ocr?.symptoms ?? '')), minHeight: 60, resize: 'none' }}
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              placeholder="Presenting symptoms…"
            />
          </FormField>
          <FormField label="Diagnosis">
            <textarea
              className="fi"
              style={{ ...preFilled(isOcrPrefilled(ocr?.diagnosis ?? '')), minHeight: 60, resize: 'none' }}
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="Clinical diagnosis…"
            />
          </FormField>
          <FormField label="Medications">
            <textarea
              className="fi"
              style={{ ...preFilled(isOcrPrefilled(ocr?.medications ?? '')), minHeight: 50, resize: 'none' }}
              value={medications}
              onChange={(e) => setMedications(e.target.value)}
              placeholder="Prescribed medications…"
            />
          </FormField>
          <FormField label="Precautions">
            <textarea
              className="fi"
              style={{ ...preFilled(isOcrPrefilled(ocr?.precautions ?? '')), minHeight: 44, resize: 'none' }}
              value={precautions}
              onChange={(e) => setPrecautions(e.target.value)}
              placeholder="Post-treatment precautions…"
            />
          </FormField>
          <FormField label="Tests">
            <textarea
              className="fi"
              style={{ ...preFilled(isOcrPrefilled(ocr?.tests ?? '')), minHeight: 44, resize: 'none' }}
              value={tests}
              onChange={(e) => setTests(e.target.value)}
              placeholder="Lab tests to be done…"
            />
          </FormField>
          <FormField label="Next Follow-Up" className="mb-0">
            <input
              type="date"
              className="fi"
              style={preFilled(isOcrPrefilled(ocr?.follow_up_date ?? ''))}
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
            />
          </FormField>
        </Card>

        {/* ── Dos & Don'ts ── */}
        <Card title="📌 Dos & Don'ts" className="mt-2 mb-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div
                className="text-[0.54rem] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1"
                style={{ color: 'var(--teal)' }}
              >
                ✅ Dos
              </div>
              <textarea
                className="fi w-full"
                style={{ ...preFilled(isOcrPrefilled(ocr?.dos ?? '')), minHeight: 110, resize: 'none', borderColor: isOcrPrefilled(ocr?.dos ?? '') ? 'rgba(43,191,191,0.3)' : undefined }}
                value={dos}
                onChange={(e) => setDos(e.target.value)}
                placeholder="• Do this&#10;• And this"
              />
            </div>
            <div>
              <div
                className="text-[0.54rem] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1"
                style={{ color: 'var(--red)' }}
              >
                🚫 Don'ts
              </div>
              <textarea
                className="fi w-full"
                style={{ ...preFilled(isOcrPrefilled(ocr?.donts ?? '')), minHeight: 110, resize: 'none', borderColor: isOcrPrefilled(ocr?.donts ?? '') ? 'rgba(230,57,70,0.3)' : undefined }}
                value={donts}
                onChange={(e) => setDonts(e.target.value)}
                placeholder="• Avoid this&#10;• Don't do that"
              />
            </div>
          </div>
        </Card>

        {/* ── Error ── */}
        {error && (
          <div
            className="rounded-xl px-3.5 py-3 mb-3 text-[0.64rem]"
            style={{ background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.3)', color: '#f87171' }}
          >
            {error}
          </div>
        )}

        {/* ── Footer buttons ── */}
        <div className="flex gap-2.5 pb-2">
          <button
            onClick={() => navigate('/add-patient')}
            className="px-4 py-3 rounded-xl text-[0.68rem] font-semibold"
            style={{ background: 'var(--bg3)', border: '1px solid var(--b)', color: 'var(--t2)', cursor: 'pointer' }}
          >
            Discard
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-3 rounded-xl text-[0.76rem] font-bold"
            style={{
              background: submitting ? 'var(--bg4)' : 'var(--teal)',
              color:      submitting ? 'var(--t3)' : '#fff',
              border:     'none',
              cursor:     submitting ? 'not-allowed' : 'pointer',
              boxShadow:  submitting ? 'none' : '0 2px 10px rgba(43,191,191,0.3)',
            }}
          >
            {submitting ? '⏳ Registering…' : '✓ Register Patient'}
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Tiny shared helpers ───────────────────────────────────────────────────────

function Card({
  title, badge, children, className = '',
}: { title: string; badge?: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl overflow-hidden ${className}`}
      style={{ background: 'var(--bg3)', border: '1px solid var(--b)' }}
    >
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <span className="text-[0.72rem] font-bold" style={{ color: 'var(--t)' }}>{title}</span>
        {badge && (
          <div
            className="flex items-center gap-1 rounded-full px-2 py-0.5"
            style={{ background: 'rgba(43,191,191,0.12)', border: '1px solid rgba(43,191,191,0.3)' }}
          >
            <span className="inline-block w-1 h-1 rounded-full animate-pulse" style={{ background: 'var(--teal)' }} />
            <span className="text-[0.5rem] font-bold" style={{ color: 'var(--teal)' }}>{badge}</span>
          </div>
        )}
      </div>
      <div className="px-3 py-2.5">{children}</div>
    </div>
  );
}

function FormField({
  label, children, className = '',
}: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 mb-2 ${className}`}>
      <label className="text-[0.55rem] font-bold uppercase tracking-[0.04em]" style={{ color: 'var(--t3)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function StepDot({ n, active, done }: { n: number; active?: boolean; done?: boolean }) {
  const bg = done ? 'var(--teal)' : active ? 'var(--teal)' : 'var(--bg4)';
  return (
    <div
      className="w-5 h-5 rounded-full flex items-center justify-center text-[0.55rem] font-bold flex-shrink-0"
      style={{ background: bg, border: done || active ? 'none' : '1px solid var(--b)', color: done || active ? '#fff' : 'var(--t3)' }}
    >
      {done ? '✓' : n}
    </div>
  );
}
