'use client';
import React, { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from './BottomNav';

interface Doctor     { id: string; name: string; specialty: string }
interface Medication { drug: string; form: string; dose: string; frequency: string; duration: string }
interface Vital      { label: string; value: string }
interface PatientForm {
  name: string; age: string; gender: string; email: string; phone: string;
  blood_group: string; admission_date: string;
  vitals: Vital[];
  condition: string; treatment_name: string; treatment_start_date: string; doctor_id: string;
  symptoms: string; diagnosis: string; precautions: string; tests: string;
  medications: Medication[];
  dos: string; donts: string;
  follow_up_date: string; notes: string;
}

const CONDITIONS = [
  { value: 'acne',                 label: 'Acne Vulgaris' },
  { value: 'androgenic_alopecia',  label: 'Androgenic Alopecia (AGA)' },
  { value: 'alopecia_areata',      label: 'Alopecia Areata' },
  { value: 'telogen_effluvium',    label: 'Telogen Effluvium' },
  { value: 'laser_recovery',       label: 'Post-Laser Recovery' },
  { value: 'post_hair_transplant', label: 'Post-Hair Transplant' },
  { value: 'post_dental_implant',  label: 'Post-Dental Implant' },
  { value: 'post_extraction',      label: 'Post-Extraction' },
  { value: 'post_root_canal',      label: 'Post-Root Canal' },
];

const PROTOCOLS: Record<string, string[]> = {
  acne:                 ['Tretinoin Protocol', 'Benzoyl Peroxide + Clindamycin', 'Oral Antibiotics', 'Isotretinoin Course'],
  androgenic_alopecia:  ['Topical Minoxidil', 'Oral Finasteride', 'PRP Therapy', 'Low-Level Laser Therapy'],
  alopecia_areata:      ['Intralesional Corticosteroids', 'Topical Immunotherapy', 'Oral Steroids'],
  telogen_effluvium:    ['Iron + Biotin Supplementation', 'Stress Management', 'Nutritional Protocol'],
  laser_recovery:       ['CO2 Laser Post-Care', 'Erbium Laser Recovery', 'IPL Post-Care'],
  post_hair_transplant: ['FUE Recovery Protocol', 'FUT Recovery Protocol', 'Accelerated Recovery'],
  post_dental_implant:  ['Standard Implant Recovery', 'Bone Graft Protocol'],
  post_extraction:      ['Simple Extraction Recovery', 'Surgical Extraction Recovery'],
  post_root_canal:      ['Standard RCT Recovery', 'Re-treatment Protocol'],
};

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

const DEFAULT_VITALS: Vital[] = [
  { label: 'Pulse',  value: '' },
  { label: 'BP',     value: '' },
  { label: 'SPO2',   value: '' },
  { label: 'Weight', value: '' },
];

const EMPTY_MED: Medication = { drug: '', form: '', dose: '', frequency: '', duration: '' };

const BLANK: PatientForm = {
  name: '', age: '', gender: 'Female', email: '', phone: '',
  blood_group: '', admission_date: new Date().toISOString().slice(0, 10),
  vitals: DEFAULT_VITALS.map(v => ({ ...v })),
  condition: 'acne', treatment_name: PROTOCOLS.acne[0], treatment_start_date: new Date().toISOString().slice(0, 10),
  doctor_id: '',
  symptoms: '', diagnosis: '', precautions: '', tests: '',
  medications: [{ ...EMPTY_MED }],
  dos: '', donts: '',
  follow_up_date: '', notes: '',
};

type Step = 'upload' | 'form' | 'success';

export default function AddPatientClient({ doctors, orgSlug, returnTo = '/dashboard' }: { doctors: Doctor[]; orgSlug: string; returnTo?: string }) {
  const router = useRouter();
  const ref1   = useRef<HTMLInputElement>(null);
  const ref2   = useRef<HTMLInputElement>(null);

  const [step, setStep]         = useState<Step>('upload');
  const [form, setForm]         = useState<PatientForm>({ ...BLANK, doctor_id: doctors[0]?.id ?? '' });
  const [file1, setFile1]       = useState<File | null>(null);
  const [file2, setFile2]       = useState<File | null>(null);
  const [prev1, setPrev1]       = useState<string | null>(null);
  const [prev2, setPrev2]       = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [savedId, setSavedId] = useState('');

  const pickFile = useCallback((f: File, slot: 1 | 2) => {
    const url = URL.createObjectURL(f);
    if (slot === 1) { setFile1(f); setPrev1(url); }
    else            { setFile2(f); setPrev2(url); }
    setError('');
  }, []);

  // ── OCR scan ──────────────────────────────────────────────────────────────
  const handleScan = useCallback(async () => {
    if (!file1) { setError('Upload at least the front page'); return; }
    setScanning(true); setError('');

    const fd = new FormData();
    fd.append('image', file1);
    if (file2) fd.append('image2', file2);
    const pages = file2 ? 2 : 1;

    try {
      setScanMsg(file2 ? `Scanning ${pages} pages with AI…` : 'Scanning with AI…');
      const res  = await fetch('/api/parse-prescription-smart', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || json.error) { setError(json.error ?? 'Scan failed'); return; }

      const d = json.data ?? {};

      const normalizeGender = (g: unknown): string => {
        const s = String(g ?? '').toLowerCase().trim();
        if (s === 'm' || s.startsWith('male')) return 'Male';
        if (s === 'f' || s.startsWith('female')) return 'Female';
        return 'Other';
      };
      const normalizeAge = (a: unknown): string => {
        if (a == null || a === '') return '';
        const n = parseInt(String(a).replace(/\D/g, ''), 10);
        return isNaN(n) ? '' : String(n);
      };

      const meds: Medication[] = (d.medications ?? []).map((m: Record<string, string | null>) => ({
        drug: m.drug ?? '', form: m.form ?? '', dose: m.dose ?? '',
        frequency: m.frequency ?? '', duration: m.duration ?? '',
      }));

      // Merge OCR vitals into form defaults: update matching labels, append new ones
      const mergeVitals = (prev: Vital[]): Vital[] => {
        const ocrVitals = (Array.isArray(d.vitals) ? d.vitals : []) as { label: string; value: string }[];
        if (!ocrVitals.length) return prev;
        const updated = prev.map(defV => {
          const match = ocrVitals.find(ov => ov.label?.toLowerCase() === defV.label.toLowerCase());
          return match?.value ? { ...defV, value: match.value } : defV;
        });
        const extras = ocrVitals.filter(ov => ov.label && ov.value && !prev.some(dv => dv.label.toLowerCase() === ov.label.toLowerCase()));
        return [...updated, ...extras];
      };

      setForm(prev => ({
        ...prev,
        name:           (d.patient_name && d.patient_name !== 'null') ? String(d.patient_name) : prev.name,
        age:            normalizeAge(d.age) || prev.age,
        gender:         d.gender ? normalizeGender(d.gender) : prev.gender,
        phone:          d.phone  ? String(d.phone)           : prev.phone,
        blood_group:    d.blood_group ? String(d.blood_group) : prev.blood_group,
        vitals:         mergeVitals(prev.vitals),
        diagnosis:      d.diagnosis   ? String(d.diagnosis)   : prev.diagnosis,
        treatment_name: d.diagnosis   ? String(d.diagnosis)   : prev.treatment_name,
        symptoms:       d.symptoms    ? String(d.symptoms)    : prev.symptoms,
        precautions:    d.precautions ? String(d.precautions) : prev.precautions,
        tests:          d.tests       ? String(d.tests)       : prev.tests,
        dos:            d.dos         ? String(d.dos)         : prev.dos,
        donts:          d.donts       ? String(d.donts)       : prev.donts,
        follow_up_date: d.follow_up   ? String(d.follow_up)   : prev.follow_up_date,
        notes:          [d.hospital, d.doctor_name].filter(Boolean).join(' · ') || prev.notes,
        medications:    meds.length ? meds : prev.medications,
      }));

      const providerLabel = json.provider === 'gemini' ? 'Gemini' : json.provider === 'docupipe' ? 'DocuPipe' : 'AI';
      setScanMsg(`${meds.length} med${meds.length !== 1 ? 's' : ''} · ${json.pages ?? pages} page${(json.pages ?? pages) > 1 ? 's' : ''} · via ${providerLabel}`);
      setStep('form');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }, [file1, file2]);

  // ── Medication helpers ─────────────────────────────────────────────────────
  const setMed    = (i: number, f: keyof Medication, v: string) =>
    setForm(p => { const m = [...p.medications]; m[i] = { ...m[i], [f]: v }; return { ...p, medications: m }; });
  const addMed    = () => setForm(p => ({ ...p, medications: [...p.medications, { ...EMPTY_MED }] }));
  const removeMed = (i: number) => setForm(p => ({ ...p, medications: p.medications.filter((_, j) => j !== i) }));

  // ── Vital helpers ──────────────────────────────────────────────────────────
  const setVital    = (i: number, key: keyof Vital, v: string) =>
    setForm(p => { const vs = [...p.vitals]; vs[i] = { ...vs[i], [key]: v }; return { ...p, vitals: vs }; });
  const addVital    = () => setForm(p => ({ ...p, vitals: [...p.vitals, { label: '', value: '' }] }));
  const removeVital = (i: number) => setForm(p => ({ ...p, vitals: p.vitals.filter((_, j) => j !== i) }));

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim())  { setError('Patient name is required'); return; }
    if (!form.email.trim()) { setError('Patient email is required — it\'s used as their login on the patient app'); return; }
    if (!form.doctor_id)    { setError('Select a doctor'); return; }
    setSaving(true); setError('');

    const prescribed = form.medications
      .filter(m => m.drug.trim())
      .map(m => [m.drug, m.dose, m.frequency].filter(Boolean).join(' '));

    const clinicalData = {
      blood_group:    form.blood_group,
      admission_date: form.admission_date,
      vitals:         form.vitals.filter(v => v.label && v.value),
      symptoms:       form.symptoms,
      diagnosis:      form.diagnosis,
      precautions:    form.precautions,
      tests:          form.tests,
      follow_up_date: form.follow_up_date,
      dos:            form.dos,
      donts:          form.donts,
      email:          form.email.trim() || null,
    };

    const res = await fetch('/api/add-patient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgSlug,
        name:               form.name.trim(),
        age:                form.age,
        gender:             form.gender,
        phone:              form.phone.trim() || null,
        doctorId:           form.doctor_id,
        condition:          form.condition,
        treatmentName:      form.treatment_name.trim() || form.condition,
        treatmentStartDate: form.treatment_start_date,
        notes:              form.notes.trim() || null,
        prescribedProducts: JSON.stringify(prescribed),
        clinicalData,
      }),
    });

    const json = await res.json();
    if (!res.ok || json.error) { setError(json.error ?? 'Failed to save patient'); setSaving(false); return; }
    setSavedId(form.name);
    setStep('success');
  };

  // ── Shared styles ──────────────────────────────────────────────────────────
  const fi: React.CSSProperties = {
    background: 'var(--bg4)', border: '1.5px solid var(--b)', borderRadius: 8,
    padding: '7px 10px', color: 'var(--t)', fontSize: 12, outline: 'none',
    fontFamily: 'Inter,sans-serif', width: '100%', transition: '0.15s',
    boxSizing: 'border-box',
  };
  const fl: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.04em',
    textTransform: 'uppercase', display: 'block', marginBottom: 3,
  };

  function Field({ label, required, children, style }: {
    label: string; required?: boolean; children: React.ReactNode; style?: React.CSSProperties;
  }) {
    return (
      <div style={{ marginBottom: 9, ...style }}>
        <label style={fl}>{label}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}</label>
        {children}
      </div>
    );
  }

  function Inp({ name, placeholder = '', type = 'text' }: { name: keyof PatientForm; placeholder?: string; type?: string }) {
    return (
      <input
        style={fi} type={type} placeholder={placeholder}
        value={form[name] as string}
        onChange={e => setForm(p => ({ ...p, [name]: e.target.value }))}
      />
    );
  }

  function Ta({ name, placeholder = '', rows = 3 }: { name: keyof PatientForm; placeholder?: string; rows?: number }) {
    return (
      <textarea
        style={{ ...fi, resize: 'none', minHeight: rows * 20 }}
        value={form[name] as string}
        placeholder={placeholder}
        onChange={e => setForm(p => ({ ...p, [name]: e.target.value }))}
      />
    );
  }

  function Divider({ label }: { label: string }) {
    return (
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--teal)', margin: '14px 0 9px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ flex: 1, height: 1, background: 'rgba(43,191,191,.2)', display: 'inline-block' }} />
        {label}
        <span style={{ flex: 1, height: 1, background: 'rgba(43,191,191,.2)', display: 'inline-block' }} />
      </div>
    );
  }

  // ── Step bar ───────────────────────────────────────────────────────────────
  function StepBar() {
    const steps = ['Upload', 'Details', 'Done'];
    const idx   = step === 'upload' ? 0 : step === 'form' ? 1 : 2;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 14px', background: 'var(--bg2)', borderBottom: '1px solid var(--b)', flexShrink: 0 }}>
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: i <= idx ? 'var(--teal)' : 'var(--bg4)', border: `1.5px solid ${i <= idx ? 'var(--teal)' : 'var(--b)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: i <= idx ? '#fff' : 'var(--t3)' }}>
                {i < idx ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 7, fontWeight: 600, color: i <= idx ? 'var(--teal)' : 'var(--t3)', whiteSpace: 'nowrap' }}>{s}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1.5, background: i < idx ? 'var(--teal)' : 'var(--b)', marginBottom: 10, transition: '0.3s' }} />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }

  // ── Upload slot ────────────────────────────────────────────────────────────
  function UploadSlot({ slot, label, file, preview, inputRef, required }: {
    slot: 1 | 2; label: string; file: File | null; preview: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputRef: React.RefObject<any>; required?: boolean;
  }) {
    return (
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: slot === 1 ? 'var(--teal)' : 'var(--t3)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          {label}
          {required  && <span style={{ color: 'var(--red)' }}>*</span>}
          {!required && <span style={{ color: 'var(--t3)', fontWeight: 400 }}> · optional</span>}
        </div>
        <div
          onClick={() => !scanning && inputRef.current?.click()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f, slot); }}
          onDragOver={e => e.preventDefault()}
          style={{ border: `2px dashed ${file ? 'var(--teal)' : 'var(--b)'}`, borderRadius: 10, padding: '12px 8px', textAlign: 'center', cursor: scanning ? 'default' : 'pointer', background: file ? 'rgba(43,191,191,.04)' : 'var(--bg4)', transition: 'all 0.2s', minHeight: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          {preview
            ? <img src={preview} alt={label} style={{ width: '100%', maxHeight: 100, objectFit: 'contain', borderRadius: 7, display: 'block' }} />
            : <><div style={{ fontSize: 22 }}>{slot === 1 ? '📄' : '📋'}</div><div style={{ fontSize: 10, color: 'var(--t3)' }}>Tap to upload</div></>
          }
          {file && <div style={{ fontSize: 8, color: 'var(--teal)', fontWeight: 600 }}>✓ {file.name.slice(0, 18)}</div>}
        </div>
        <input ref={inputRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f, slot); }} />
      </div>
    );
  }

  // ── SCREEN: Upload ─────────────────────────────────────────────────────────
  if (step === 'upload') return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{ height: 44, background: 'var(--bg2)', borderBottom: '1px solid var(--b)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 13px', flexShrink: 0 }}>
        <button onClick={() => router.push(returnTo)} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0, fontFamily: 'Inter,sans-serif' }}>← Back</button>
        <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--t)' }}>Add Patient</span>
        <span style={{ width: 60 }} />
      </div>
      <StepBar />
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Upload Prescription</div>
        <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 14 }}>AI extracts patient details and medications from up to 2 pages</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <UploadSlot slot={1} label="Front" file={file1} preview={prev1} inputRef={ref1} required />
          <UploadSlot slot={2} label="Back"  file={file2} preview={prev2} inputRef={ref2} />
        </div>
        {error && (
          <div style={{ padding: '9px 12px', borderRadius: 8, background: 'rgba(230,57,70,.1)', border: '1px solid rgba(230,57,70,.25)', fontSize: 11, color: '#f87171', marginBottom: 12 }}>⚠ {error}</div>
        )}
        {file1 && (
          <button onClick={handleScan} disabled={scanning} style={{ width: '100%', background: scanning ? 'rgba(43,191,191,.3)' : 'var(--teal)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontSize: 13, fontWeight: 700, cursor: scanning ? 'default' : 'pointer', fontFamily: 'Inter,sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 2px 8px rgba(43,191,191,.3)', marginBottom: 10 }}>
            {scanning
              ? <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />{scanMsg || 'Scanning…'}</>
              : <>🔍 Scan {file2 ? '2 pages' : 'prescription'} with AI</>
            }
          </button>
        )}
        <button onClick={() => setStep('form')} style={{ width: '100%', background: 'transparent', border: '1.5px solid var(--b)', borderRadius: 10, padding: '10px', color: 'var(--t2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
          Skip scan — fill manually →
        </button>
      </div>
      <BottomNav />
    </div>
  );

  // ── SCREEN: Form ───────────────────────────────────────────────────────────
  if (step === 'form') return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{ height: 44, background: 'var(--bg2)', borderBottom: '1px solid var(--b)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 13px', flexShrink: 0 }}>
        <button onClick={() => setStep('upload')} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0, fontFamily: 'Inter,sans-serif' }}>← Upload</button>
        <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--t)' }}>Patient Details</span>
        <span style={{ fontSize: 10, color: 'var(--teal)', fontWeight: 600 }}>{scanMsg ? '✓ AI-filled' : ''}</span>
      </div>
      <StepBar />

      <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 80px' }}>

        {/* OCR badge */}
        {scanMsg && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(43,191,191,.1)', border: '1px solid rgba(43,191,191,.2)', borderRadius: 99, padding: '3px 8px', fontSize: 9, fontWeight: 700, color: 'var(--teal)', marginBottom: 10 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0 }} />
            AI OCR · {scanMsg} · Review fields below
          </div>
        )}

        {/* ── PATIENT INFO ── */}
        <Divider label="Patient Info" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Full Name" required><Inp name="name" placeholder="Patient full name" /></Field>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Phone"><Inp name="phone" placeholder="+91 99999 00000" /></Field>
          </div>
          <Field label="Age"><Inp name="age" placeholder="28" type="number" /></Field>
          <Field label="Gender">
            <select style={fi} value={form.gender} onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}>
              <option>Female</option><option>Male</option><option>Other</option>
            </select>
          </Field>
          <Field label="Blood Group">
            <select style={fi} value={form.blood_group} onChange={e => setForm(p => ({ ...p, blood_group: e.target.value }))}>
              <option value="">Unknown</option>
              {BLOOD_GROUPS.map(bg => <option key={bg} value={bg}>{bg}</option>)}
            </select>
          </Field>
          <Field label="Admission Date"><Inp name="admission_date" type="date" /></Field>
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Email" required><Inp name="email" placeholder="patient@example.com" type="email" /></Field>
            <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: -6, marginBottom: 3 }}>Used as patient app login (password: Patient@123)</div>
          </div>
        </div>

        {/* ── VITALS AT ADMISSION ── */}
        <Divider label="Vitals at Admission" />
        {form.vitals.map((v, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginBottom: 7 }}>
            <Field label="Vital" style={{ flex: 1, marginBottom: 0 }}>
              <input style={fi} value={v.label} onChange={e => setVital(i, 'label', e.target.value)} placeholder="e.g. Pulse" />
            </Field>
            <Field label="Value" style={{ flex: 1, marginBottom: 0 }}>
              <input style={fi} value={v.value} onChange={e => setVital(i, 'value', e.target.value)} placeholder="e.g. 72 bpm" />
            </Field>
            <button type="button" onClick={() => removeVital(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: 20, padding: '0 0 7px', lineHeight: 1, fontFamily: 'Inter,sans-serif' }}>×</button>
          </div>
        ))}
        <button type="button" onClick={addVital} style={{ width: '100%', background: 'transparent', border: '1.5px dashed var(--b)', color: 'var(--teal)', borderRadius: 8, padding: '6px', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif', marginBottom: 2 }}>
          + Add vital
        </button>

        {/* ── DISEASE & TREATMENT ── */}
        <Divider label="Disease & Treatment" />
        <Field label="Condition" required>
          <select style={fi} value={form.condition} onChange={e => setForm(p => ({ ...p, condition: e.target.value, treatment_name: PROTOCOLS[e.target.value]?.[0] ?? '' }))}>
            {CONDITIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>

        {/* Treatment Protocol — radio buttons per condition */}
        <div style={{ marginBottom: 9 }}>
          <label style={fl}>Treatment Protocol</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {(PROTOCOLS[form.condition] ?? []).map(proto => {
              const active = form.treatment_name === proto;
              return (
                <label key={proto} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '7px 9px', borderRadius: 7, background: active ? 'rgba(43,191,191,.08)' : 'var(--bg3)', border: `1.5px solid ${active ? 'var(--teal)' : 'var(--b)'}`, transition: '0.15s' }}>
                  <input type="radio" name="protocol" value={proto} checked={active} onChange={() => setForm(p => ({ ...p, treatment_name: proto }))} style={{ accentColor: 'var(--teal)', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: active ? 'var(--t)' : 'var(--t2)' }}>{proto}</span>
                </label>
              );
            })}
            {/* Custom protocol */}
            {(() => {
              const isCustom = !PROTOCOLS[form.condition]?.includes(form.treatment_name);
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 7, background: isCustom ? 'rgba(43,191,191,.08)' : 'var(--bg3)', border: `1.5px solid ${isCustom ? 'var(--teal)' : 'var(--b)'}` }}>
                  <input type="radio" name="protocol" value="__custom__" checked={isCustom} onChange={() => setForm(p => ({ ...p, treatment_name: '' }))} style={{ accentColor: 'var(--teal)', flexShrink: 0 }} />
                  <input
                    style={{ ...fi, padding: '2px 0', background: 'transparent', border: 'none', borderBottom: '1px solid var(--b)', borderRadius: 0, fontSize: 11 }}
                    placeholder="Custom protocol…"
                    value={isCustom ? form.treatment_name : ''}
                    onChange={e => setForm(p => ({ ...p, treatment_name: e.target.value }))}
                  />
                </div>
              );
            })()}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Start Date"><Inp name="treatment_start_date" type="date" /></Field>
          <Field label="Assigned Doctor" required>
            <select style={fi} value={form.doctor_id} onChange={e => setForm(p => ({ ...p, doctor_id: e.target.value }))}>
              {doctors.length === 0
                ? <option value="">No doctors found</option>
                : doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)
              }
            </select>
          </Field>
        </div>

        {/* ── CLINICAL DETAILS ── */}
        <Divider label="Clinical Details" />
        <Field label="Symptoms"><Ta name="symptoms" placeholder="Presenting symptoms…" rows={3} /></Field>
        <Field label="Diagnosis"><Ta name="diagnosis" placeholder="Clinical diagnosis…" rows={2} /></Field>
        <Field label="Precautions"><Ta name="precautions" placeholder="Precautions to follow…" rows={2} /></Field>
        <Field label="Tests / Investigations"><Ta name="tests" placeholder="Lab tests, scans ordered…" rows={2} /></Field>

        {/* ── MEDICATIONS ── */}
        <Divider label="Medications" />
        {form.medications.map((m, i) => (
          <div key={i} style={{ background: 'var(--bg3)', border: '1px solid var(--b)', borderRadius: 9, padding: '10px', marginBottom: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--teal)' }}>Med {i + 1}</span>
              {form.medications.length > 1 && (
                <button type="button" onClick={() => removeMed(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: 16, padding: 0 }}>×</button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <Field label="Drug / Brand"><input style={fi} value={m.drug} onChange={e => setMed(i, 'drug', e.target.value)} placeholder="e.g. Meditare" /></Field>
              </div>
              <Field label="Form"><input style={fi} value={m.form} onChange={e => setMed(i, 'form', e.target.value)} placeholder="Tab/Cream" /></Field>
              <Field label="Dose"><input style={fi} value={m.dose} onChange={e => setMed(i, 'dose', e.target.value)} placeholder="e.g. 15mg" /></Field>
              <Field label="Frequency"><input style={fi} value={m.frequency} onChange={e => setMed(i, 'frequency', e.target.value)} placeholder="once/week" /></Field>
              <Field label="Duration"><input style={fi} value={m.duration} onChange={e => setMed(i, 'duration', e.target.value)} placeholder="6 wks" /></Field>
            </div>
          </div>
        ))}
        <button type="button" onClick={addMed} style={{ width: '100%', background: 'transparent', border: '1.5px dashed var(--b)', color: 'var(--teal)', borderRadius: 8, padding: '7px', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif', marginBottom: 2 }}>
          + Add medication
        </button>

        {/* ── CARE PLAN ── */}
        <Divider label="Care Plan" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Dos"><Ta name="dos" placeholder="What to do…" rows={4} /></Field>
          <Field label="Don'ts"><Ta name="donts" placeholder="What to avoid…" rows={4} /></Field>
        </div>

        {/* ── FOLLOW-UP ── */}
        <Divider label="Follow-Up" />
        <Field label="Next Follow-Up Date"><Inp name="follow_up_date" type="date" /></Field>
        <Field label="Notes">
          <Ta name="notes" placeholder="Additional notes, hospital, referring doctor…" rows={2} />
        </Field>

        {error && (
          <div style={{ padding: '9px 12px', borderRadius: 8, background: 'rgba(230,57,70,.1)', border: '1px solid rgba(230,57,70,.25)', fontSize: 11, color: '#f87171', marginBottom: 10 }}>⚠ {error}</div>
        )}

        <button type="submit" disabled={saving} style={{ width: '100%', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'Inter,sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 2px 8px rgba(43,191,191,.3)', marginTop: 4 }}>
          {saving
            ? <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Registering…</>
            : 'Register Patient →'
          }
        </button>
      </form>
    </div>
  );

  // ── SCREEN: Success ────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{ height: 44, background: 'var(--bg2)', borderBottom: '1px solid var(--b)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--t)' }}>Patient Registered</span>
      </div>
      <StepBar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(16,185,129,.15)', border: '2px solid rgba(16,185,129,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t)', marginBottom: 6 }}>Patient Added!</div>
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 28 }}>
          <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{savedId || 'Patient'}</span> has been registered successfully.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 280 }}>
          <button onClick={() => router.push(returnTo)} style={{ width: '100%', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>← Back to Home</button>
          <button
            onClick={() => { setStep('upload'); setForm({ ...BLANK, doctor_id: doctors[0]?.id ?? '' }); setFile1(null); setFile2(null); setPrev1(null); setPrev2(null); setScanMsg(''); setError(''); }}
            style={{ width: '100%', background: 'transparent', border: '1.5px solid var(--b)', color: 'var(--t2)', borderRadius: 10, padding: '11px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}
          >Add Another Patient</button>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
