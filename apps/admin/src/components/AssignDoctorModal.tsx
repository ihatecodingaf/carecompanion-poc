import { useState } from 'react';
import { findDoctorByEmail, createDoctor, assignDoctorToClinic } from '../lib/api';
import { useStore } from '../store/useStore';

interface Props {
  orgSlug:    string;
  onClose:    () => void;
  onAssigned: () => void;
}

type Mode = 'search' | 'create' | 'assign-existing';

interface ExistingDoctor {
  authUserId: string;
  name:       string;
  clinics:    string[];
}

export default function AssignDoctorModal({ orgSlug, onClose, onAssigned }: Props) {
  const { showToast } = useStore();
  const [mode,     setMode]     = useState<Mode>('search');
  const [loading,  setLoading]  = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [found,    setFound]    = useState<ExistingDoctor | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [form, setForm] = useState({
    name: '', email: '', password: 'PrecoveryDoctor2025!', specialty: 'dermatology', phone: '',
  });

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFound(null);
    setNotFound(false);
    try {
      const result = await findDoctorByEmail(searchEmail.trim());
      if (result) {
        setFound(result);
        setMode('assign-existing');
      } else {
        setNotFound(true);
        setForm((f) => ({ ...f, email: searchEmail.trim() }));
        setMode('create');
      }
    } catch (e) {
      showToast('Search failed', 'error');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignExisting() {
    if (!found) return;
    setLoading(true);
    try {
      await assignDoctorToClinic({
        authUserId: found.authUserId,
        orgSlug,
        name:       found.name,
        specialty:  'dermatology',
        phone:      '',
        email:      searchEmail,
      });
      showToast(`${found.name} assigned to clinic`, 'success');
      onAssigned();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to assign', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await createDoctor({ ...form, orgSlug });
      showToast(`Dr. ${form.name} created and added`, 'success');
      onAssigned();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to create doctor', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl p-6"
           style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold" style={{ color: 'var(--t)' }}>Add Doctor</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg">✕</button>
        </div>

        {/* Step 1: Search */}
        {mode === 'search' && (
          <form onSubmit={handleSearch} className="flex flex-col gap-4">
            <p className="text-sm" style={{ color: 'var(--t2)' }}>
              Search by email — if the doctor already has an account they'll be mapped.
              Otherwise you can create a new account.
            </p>
            <input
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--b)', color: 'var(--t)' }}
              type="email" value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              placeholder="doctor@clinic.com"
            />
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                      className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                      style={{ background: 'var(--bg3)', color: 'var(--t2)', border: '1px solid var(--b)' }}>
                Cancel
              </button>
              <button type="submit" disabled={loading || !searchEmail.trim()}
                      className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                      style={{ background: 'var(--teal)' }}>
                {loading ? 'Searching…' : 'Search'}
              </button>
            </div>
          </form>
        )}

        {/* Step 2a: Found existing doctor */}
        {mode === 'assign-existing' && found && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl p-4" style={{ background: 'var(--bg3)', border: '1px solid var(--b)' }}>
              <div className="font-semibold mb-1" style={{ color: 'var(--t)' }}>{found.name}</div>
              <div className="text-xs mb-2" style={{ color: 'var(--t2)' }}>{searchEmail}</div>
              {found.clinics.length > 0 && (
                <div className="text-xs" style={{ color: 'var(--t3)' }}>
                  Already in: {found.clinics.join(', ')}
                </div>
              )}
            </div>
            <p className="text-sm" style={{ color: 'var(--t2)' }}>
              Assign this doctor to <strong style={{ color: 'var(--t)' }}>{orgSlug}</strong>?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setMode('search')}
                      className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                      style={{ background: 'var(--bg3)', color: 'var(--t2)', border: '1px solid var(--b)' }}>
                Back
              </button>
              <button onClick={handleAssignExisting} disabled={loading}
                      className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                      style={{ background: 'var(--teal)' }}>
                {loading ? 'Assigning…' : 'Assign to Clinic'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2b: Create new doctor */}
        {mode === 'create' && (
          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            {notFound && (
              <div className="text-xs px-3 py-2 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                No doctor found with that email — create a new account below
              </div>
            )}
            {[
              { label: 'Full Name *',  key: 'name',      type: 'text',     ph: 'Dr. Priya Mehta' },
              { label: 'Email *',      key: 'email',     type: 'email',    ph: 'dr.priya@clinic.com' },
              { label: 'Password *',   key: 'password',  type: 'text',     ph: '' },
              { label: 'Phone',        key: 'phone',     type: 'tel',      ph: '+91 98100...' },
            ].map(({ label, key, type, ph }) => (
              <div key={key}>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                       style={{ color: 'var(--t3)' }}>{label}</label>
                <input type={type} value={(form as Record<string, string>)[key]}
                       onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                       placeholder={ph}
                       className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                       style={{ background: 'var(--bg3)', border: '1px solid var(--b)', color: 'var(--t)' }} />
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                     style={{ color: 'var(--t3)' }}>Specialty</label>
              <select value={form.specialty} onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))}
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ background: 'var(--bg3)', border: '1px solid var(--b)', color: 'var(--t)' }}>
                {['dermatology', 'dental', 'hair', 'general'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 mt-1">
              <button type="button" onClick={() => setMode('search')}
                      className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                      style={{ background: 'var(--bg3)', color: 'var(--t2)', border: '1px solid var(--b)' }}>
                Back
              </button>
              <button type="submit" disabled={loading || !form.name || !form.email}
                      className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                      style={{ background: 'var(--teal)' }}>
                {loading ? 'Creating…' : 'Create Doctor'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
