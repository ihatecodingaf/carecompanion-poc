import { useStore } from '../store/useStore';
import type { DoctorProfile, DoctorClinic } from '../store/useStore';

const DEMO_DOCTORS: Array<{
  profile: DoctorProfile;
  clinics: DoctorClinic[];
  patientNames: string;
}> = [
  {
    profile: {
      id: 'dr-martinez-001',
      name: 'Dr. Sofia Martinez',
      specialty: 'Dermatology',
      clinic_name: 'ClearSkin Medical',
      clinic_location: 'San Francisco, CA',
      phone: '+1 (415) 555-0101',
      email: 'dr.martinez@careai.demo',
      avatar_url: null,
      auth_user_id: '',
    },
    clinics: [{
      org_slug: 'care_demo',
      doctor_row_id: 'dr-martinez-001',
      is_primary: true,
      org_name: 'ClearSkin Medical',
      specialty: 'dermatology',
      city: 'San Francisco',
    }],
    patientNames: 'Priya Sharma · Marcus Johnson · Sarah Chen',
  },
  {
    profile: {
      id: 'dr-priya-001',
      name: 'Dr. Priya Nair',
      specialty: 'Dermatology',
      clinic_name: 'ClearSkin Medical',
      clinic_location: 'Mumbai, MH',
      phone: '+91 98200 00001',
      email: 'dr.priya@careai.demo',
      avatar_url: null,
      auth_user_id: '',
    },
    clinics: [{
      org_slug: 'care_demo',
      doctor_row_id: 'dr-priya-001',
      is_primary: true,
      org_name: 'ClearSkin Medical',
      specialty: 'dermatology',
      city: 'Mumbai',
    }],
    patientNames: 'Ritika Sharma · Arjun Patel · Meera Kapoor',
  },
];

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function LoginPage() {
  const { setSession, setDoctor, setClinics } = useStore();

  function enterAs(demo: typeof DEMO_DOCTORS[0]) {
    setDoctor(demo.profile);
    setClinics(demo.clinics);
    setSession({ user: { id: demo.profile.id, email: demo.profile.email } });
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="text-center px-6 pt-14 pb-8"
        style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--b)' }}
      >
        <div className="text-[0.8rem] font-extrabold tracking-widest mb-0.5" style={{ color: 'var(--t)' }}>
          PRECOVERY
        </div>
        <div className="text-[0.52rem] font-medium tracking-wide mb-6" style={{ color: 'var(--teal)' }}>
          AI Care Companion
        </div>
        <div className="text-[0.68rem] font-medium" style={{ color: 'var(--t2)', lineHeight: 1.5 }}>
          Select your profile to continue
        </div>
      </div>

      {/* Doctor cards */}
      <div className="flex-1 px-4 pt-6 flex flex-col gap-3">
        {DEMO_DOCTORS.map((demo) => (
          <button
            key={demo.profile.id}
            onClick={() => enterAs(demo)}
            className="w-full text-left rounded-2xl p-4 transition-transform active:scale-[0.97]"
            style={{
              background: 'var(--bg3)',
              border: '1px solid var(--b)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-[42px] h-[42px] rounded-full flex items-center justify-center
                           text-[0.72rem] font-bold text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, var(--teal), #1A8A8A)' }}
              >
                {initials(demo.profile.name)}
              </div>
              <div>
                <div className="text-[0.82rem] font-bold" style={{ color: 'var(--t)' }}>
                  {demo.profile.name}
                </div>
                <div className="text-[0.56rem] font-medium mt-0.5" style={{ color: 'var(--teal)' }}>
                  {demo.profile.specialty} · {demo.profile.clinic_location}
                </div>
              </div>
            </div>

            <div
              className="text-[0.56rem] rounded-lg px-2.5 py-1.5 mb-3"
              style={{ background: 'var(--bg4)', color: 'var(--t3)', border: '1px solid var(--b2)' }}
            >
              {demo.patientNames}
            </div>

            <div
              className="w-full text-center py-2 rounded-xl text-[0.68rem] font-semibold text-white"
              style={{ background: 'var(--teal)', boxShadow: '0 2px 8px rgba(43,191,191,0.3)' }}
            >
              Enter Dashboard →
            </div>
          </button>
        ))}
      </div>

      <p className="text-center text-[0.5rem] py-6" style={{ color: 'var(--t3)' }}>
        Demo mode · No authentication required
      </p>
    </div>
  );
}
