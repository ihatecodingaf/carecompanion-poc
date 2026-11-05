import { useState } from 'react';
import { createClinic } from '../lib/api';
import { useStore } from '../store/useStore';

interface Props {
  onClose:   () => void;
  onCreated: () => void;
}

const SPECIALTIES = ['dermatology', 'dental', 'hair', 'multi'];

export default function CreateClinicModal({ onClose, onCreated }: Props) {
  const { showToast } = useStore();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name:      '',
    slug:      '',
    specialty: 'dermatology',
    city:      '',
    phone:     '',
  });

  function autoSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'name' ? { slug: autoSlug(value) } : {}),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) {
      showToast('Name and slug are required', 'error');
      return;
    }
    setLoading(true);
    try {
      await createClinic(form);
      showToast(`Clinic "${form.name}" created`, 'success');
      onCreated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create clinic', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold" style={{ color: 'var(--t)' }}>New Clinic</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Clinic Name *">
            <input className={INPUT} value={form.name} onChange={(e) => set('name', e.target.value)}
                   placeholder="e.g. Bloom Skin Clinic" />
          </Field>

          <Field label="Slug (URL identifier) *">
            <input className={INPUT} value={form.slug} onChange={(e) => set('slug', e.target.value)}
                   placeholder="bloom_skin" />
            <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              Auto-generated from name. Used in DB schema name.
            </p>
          </Field>

          <Field label="Specialty">
            <select className={INPUT} value={form.specialty} onChange={(e) => set('specialty', e.target.value)}>
              {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <input className={INPUT} value={form.city} onChange={(e) => set('city', e.target.value)}
                     placeholder="Mumbai" />
            </Field>
            <Field label="Phone">
              <input className={INPUT} value={form.phone} onChange={(e) => set('phone', e.target.value)}
                     placeholder="+91 98100..." />
            </Field>
          </div>

          <div className="flex gap-3 mt-1">
            <button type="button" onClick={onClose}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
                    style={{ background: 'var(--bg3)', color: 'var(--t2)', border: '1px solid var(--b)' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white
                               disabled:opacity-60 transition-opacity"
                    style={{ background: 'var(--teal)' }}>
              {loading ? 'Creating…' : 'Create Clinic'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const INPUT = `w-full rounded-lg px-3 py-2 text-sm outline-none`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
             style={{ color: 'var(--t3)' }}>
        {label}
      </label>
      <div style={{
        '--input-bg': 'var(--bg3)',
        '--input-border': 'var(--b)',
        '--input-color': 'var(--t)',
      } as React.CSSProperties}>
        {children}
      </div>
    </div>
  );
}
