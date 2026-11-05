import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── OCR / Patient Registration Types ─────────────────────────────────────────

export interface OcrResult {
  // Patient demographics
  name:           string;
  phone:          string;
  age:            string;
  gender:         string;
  blood_group:    string;
  // Clinical
  condition:      string;
  treatment_name: string;
  symptoms:       string;
  diagnosis:      string;
  medications:    string;
  precautions:    string;
  tests:          string;
  follow_up_date: string;
  dos:            string;
  donts:          string;
  current_day:    string;   // always "0" for new patients
  // Internal
  raw_text:       string;
}

export interface VitalEntry {
  label: string;
  value: string;
}

export interface NewPatientDraft extends OcrResult {
  photo_url:  string | null;   // Google Drive URL or Supabase URL
  vitals:     VitalEntry[];
  doctor_id:  string;
  org_slug:   string;
}

export interface RegisteredPatientSummary {
  patient_id:     string;
  name:           string;
  condition:      string;
  treatment_name: string;
  follow_up_date: string;
}

// ── Existing Types (unchanged) ────────────────────────────────────────────────

export interface DoctorClinic {
  org_slug:      string;
  doctor_row_id: string;
  is_primary:    boolean;
  org_name:      string;
  specialty:     string;
  city:          string;
}

export interface DoctorProfile {
  id:              string;
  name:            string;
  specialty:       string;
  clinic_name:     string;
  clinic_location: string;
  phone:           string;
  email:           string;
  avatar_url:      string | null;
  auth_user_id:    string;
}

export interface Patient {
  id:                string;
  name:              string;
  age:               number;
  gender:            string;
  condition:         string;
  treatment_name:    string;
  current_day:       number;
  status:            'red' | 'yellow' | 'green';
  adherence_percent: number;
  avatar_url:        string | null;
  phone:             string | null;
  org_slug:          string;
  org_name:          string;
}

export interface Alert {
  id:          string;
  patient_id:  string;
  severity:    string;
  title:       string;
  ai_analysis: string;
  created_at:  string;
  org_slug:    string;
  org_name:    string;
}

export interface DashboardStats {
  total_patients: number;
  alerts_open:    number;
  red_count:      number;
  yellow_count:   number;
  green_count:    number;
  avg_adherence:  number;
}

export interface DashboardData {
  patients: Patient[];
  alerts:   Alert[];
  stats:    DashboardStats;
}

export interface Session {
  user: { id: string; email: string };
}

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
  visible: boolean;
}

interface DoctorStore {
  session:        Session | null;
  doctor:         DoctorProfile | null;
  clinics:        DoctorClinic[];
  activeClinics:  string[];       // org_slugs currently shown (empty = all)
  dashboard:      DashboardData | null;
  toast:          ToastState;

  // ── OCR / registration state ───────────────────────────────
  ocrResult:              OcrResult | null;
  newPatientDraft:        NewPatientDraft | null;
  lastRegistered:         RegisteredPatientSummary | null;

  setSession:     (s: Session | null) => void;
  setDoctor:      (d: DoctorProfile | null) => void;
  setClinics:     (c: DoctorClinic[]) => void;
  setActiveClinics: (slugs: string[]) => void;
  setDashboard:   (d: DashboardData) => void;
  addAlert:       (a: Alert) => void;
  showToast:      (message: string, type?: ToastState['type']) => void;
  hideToast:      () => void;
  logout:         () => void;

  setOcrResult:       (r: OcrResult | null) => void;
  setNewPatientDraft: (d: NewPatientDraft | null) => void;
  setLastRegistered:  (p: RegisteredPatientSummary | null) => void;
}

export const useStore = create<DoctorStore>()(
  persist(
    (set) => ({
      session:          null,
      doctor:           null,
      clinics:          [],
      activeClinics:    [],
      dashboard:        null,
      toast:            { message: '', type: 'info', visible: false },
      ocrResult:        null,
      newPatientDraft:  null,
      lastRegistered:   null,

      setSession:     (session) => set({ session }),
      setDoctor:      (doctor) => set({ doctor }),
      setClinics:     (clinics) => set({ clinics }),
      setActiveClinics: (activeClinics) => set({ activeClinics }),
      setDashboard:   (dashboard) => set({ dashboard }),

      setOcrResult:       (ocrResult)       => set({ ocrResult }),
      setNewPatientDraft: (newPatientDraft) => set({ newPatientDraft }),
      setLastRegistered:  (lastRegistered)  => set({ lastRegistered }),

      addAlert: (alert) =>
        set((state) => ({
          dashboard: state.dashboard
            ? { ...state.dashboard, alerts: [alert, ...state.dashboard.alerts] }
            : null,
        })),

      showToast: (message, type = 'info') =>
        set({ toast: { message, type, visible: true } }),

      hideToast: () =>
        set((s) => ({ toast: { ...s.toast, visible: false } })),

      logout: () =>
        set({ session: null, doctor: null, clinics: [], activeClinics: [], dashboard: null }),
    }),
    {
      name: 'precovery-doctor',
      partialize: (s) => ({ session: s.session, doctor: s.doctor, clinics: s.clinics }),
    },
  ),
);
