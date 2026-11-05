import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { listDoctorsForClinic, listPatientsForClinic, type DoctorRow, type PatientRow } from '../lib/api';
import { useStore } from '../store/useStore';
import AssignDoctorModal from '../components/AssignDoctorModal';

const STATUS_COLOR: Record<string, string> = {
  red:    'bg-red-500/10 text-red-400',
  yellow: 'bg-yellow-500/10 text-yellow-400',
  green:  'bg-emerald-500/10 text-emerald-400',
};

export default function ClinicDetailPage() {
  const { slug }   = useParams<{ slug: string }>();
  const navigate   = useNavigate();
  const { clinics, showToast } = useStore();

  const clinic = clinics.find((c) => c.slug === slug);

  const [doctors,      setDoctors]      = useState<DoctorRow[]>([]);
  const [patients,     setPatients]     = useState<PatientRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [tab,          setTab]          = useState<'doctors' | 'patients'>('doctors');
  const [showAssign,   setShowAssign]   = useState(false);

  useEffect(() => {
    if (!slug) return;
    Promise.all([
      listDoctorsForClinic(slug),
      listPatientsForClinic(slug),
    ]).then(([d, p]) => {
      setDoctors(d);
      setPatients(p);
    }).catch((e) => {
      showToast('Failed to load clinic data', 'error');
      console.error(e);
    }).finally(() => setLoading(false));
  }, [slug, showToast]);

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <button
        onClick={() => navigate('/clinics')}
        className="text-xs mb-4 transition-colors hover:text-teal-400"
        style={{ color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        ← Clinics
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--t)' }}>
            {clinic?.name ?? slug}
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm" style={{ color: 'var(--t2)' }}>
            <span>{clinic?.specialty}</span>
            {clinic?.city && <><span>·</span><span>{clinic.city}</span></>}
            <span>·</span>
            <span>{doctors.length} doctor{doctors.length !== 1 ? 's' : ''}</span>
            <span>·</span>
            <span>{patients.length} patient{patients.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <button
          onClick={() => setShowAssign(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: 'var(--teal)' }}
        >
          + Add Doctor
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b pb-0" style={{ borderColor: 'var(--b)' }}>
        {(['doctors', 'patients'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 text-sm font-medium capitalize transition-colors"
            style={{
              color:        tab === t ? 'var(--teal)' : 'var(--t3)',
              borderBottom: tab === t ? '2px solid var(--teal)' : '2px solid transparent',
              background:   'none',
              borderTop:    'none',
              borderLeft:   'none',
              borderRight:  'none',
              cursor:       'pointer',
            }}
          >
            {t === 'doctors' ? `👨‍⚕️ Doctors (${doctors.length})` : `🫀 Patients (${patients.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm" style={{ color: 'var(--t3)' }}>Loading…</div>
      ) : (
        <>
          {/* Doctors table */}
          {tab === 'doctors' && (
            doctors.length === 0 ? (
              <div className="text-center py-16" style={{ color: 'var(--t3)' }}>
                <div className="text-3xl mb-2">👨‍⚕️</div>
                <div className="text-sm">No doctors assigned yet</div>
                <button
                  onClick={() => setShowAssign(true)}
                  className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ background: 'var(--teal)' }}
                >
                  + Add Doctor
                </button>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--b)' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--b)' }}>
                      {['Doctor', 'Specialty', 'Email', 'Phone', 'Linked'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                            style={{ color: 'var(--t3)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {doctors.map((d, i) => (
                      <tr
                        key={d.id}
                        style={{
                          background:   i % 2 === 0 ? 'var(--bg2)' : 'transparent',
                          borderBottom: i < doctors.length - 1 ? '1px solid var(--b)' : 'none',
                        }}
                      >
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--t)' }}>{d.name}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>{d.specialty}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>{d.email ?? '—'}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>{d.phone ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold
                                           ${d.auth_user_id
                                             ? 'bg-emerald-500/10 text-emerald-400'
                                             : 'bg-red-500/10 text-red-400'}`}>
                            {d.auth_user_id ? 'Linked' : 'No auth'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Patients table */}
          {tab === 'patients' && (
            patients.length === 0 ? (
              <div className="text-center py-16 text-sm" style={{ color: 'var(--t3)' }}>
                <div className="text-3xl mb-2">🫀</div>
                No patients registered yet
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--b)' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--b)' }}>
                      {['Patient', 'Condition', 'Day', 'Adherence', 'Status'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                            style={{ color: 'var(--t3)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map((p, i) => (
                      <tr
                        key={p.id}
                        style={{
                          background:   i % 2 === 0 ? 'var(--bg2)' : 'transparent',
                          borderBottom: i < patients.length - 1 ? '1px solid var(--b)' : 'none',
                        }}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium" style={{ color: 'var(--t)' }}>{p.name}</div>
                          <div className="text-xs" style={{ color: 'var(--t3)' }}>{p.age}y · {p.gender}</div>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>{p.condition}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>Day {p.current_day}</td>
                        <td className="px-4 py-3 text-xs font-semibold"
                            style={{ color: p.adherence_percent >= 80 ? '#34d399' : p.adherence_percent >= 60 ? '#fbbf24' : '#f87171' }}>
                          {Math.round(p.adherence_percent)}%
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold
                                           ${STATUS_COLOR[p.status] ?? STATUS_COLOR.green}`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}

      {showAssign && slug && (
        <AssignDoctorModal
          orgSlug={slug}
          onClose={() => setShowAssign(false)}
          onAssigned={() => {
            setShowAssign(false);
            if (slug) listDoctorsForClinic(slug).then(setDoctors).catch(console.error);
          }}
        />
      )}
    </div>
  );
}
