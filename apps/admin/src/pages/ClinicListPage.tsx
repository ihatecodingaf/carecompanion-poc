import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listClinics, type Clinic } from '../lib/api';
import { useStore } from '../store/useStore';
import CreateClinicModal from '../components/CreateClinicModal';

const SPECIALTY_BADGE: Record<string, string> = {
  dermatology: 'bg-purple-500/10 text-purple-400',
  dental:      'bg-blue-500/10 text-blue-400',
  hair:        'bg-emerald-500/10 text-emerald-400',
  multi:       'bg-slate-500/10 text-slate-400',
};

export default function ClinicListPage() {
  const navigate = useNavigate();
  const { showToast, setClinics, clinics } = useStore();
  const [loading,     setLoading]     = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);

  async function load() {
    try {
      const data = await listClinics();
      setClinics(data);
    } catch (e) {
      showToast('Failed to load clinics', 'error');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--t)' }}>Clinics</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--t2)' }}>
            {clinics.length} clinic{clinics.length !== 1 ? 's' : ''} onboarded
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
                     text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--teal)' }}
        >
          + New Clinic
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm" style={{ color: 'var(--t3)' }}>Loading…</div>
      ) : clinics.length === 0 ? (
        <div
          className="rounded-xl p-16 text-center"
          style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
        >
          <div className="text-4xl mb-3">🏥</div>
          <div className="text-sm font-medium mb-1" style={{ color: 'var(--t)' }}>No clinics yet</div>
          <div className="text-xs mb-4" style={{ color: 'var(--t3)' }}>Create your first clinic to get started</div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--teal)' }}
          >
            + New Clinic
          </button>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--b)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--b)' }}>
                {['Clinic', 'Specialty', 'City', 'Plan', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--t3)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clinics.map((c: Clinic, i) => (
                <tr
                  key={c.id}
                  className="cursor-pointer transition-colors hover:bg-white/5"
                  style={{
                    background: i % 2 === 0 ? 'var(--bg2)' : 'transparent',
                    borderBottom: i < clinics.length - 1 ? '1px solid var(--b)' : 'none',
                  }}
                  onClick={() => navigate(`/clinics/${c.slug}`)}
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold" style={{ color: 'var(--t)' }}>{c.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>{c.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold
                                     ${SPECIALTY_BADGE[c.specialty] ?? SPECIALTY_BADGE.multi}`}>
                      {c.specialty}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>
                    {c.city ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>
                    {c.plan}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold
                                     ${c.active
                                       ? 'bg-emerald-500/10 text-emerald-400'
                                       : 'bg-red-500/10 text-red-400'}`}>
                      {c.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs" style={{ color: 'var(--teal)' }}>
                    View →
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateClinicModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}
