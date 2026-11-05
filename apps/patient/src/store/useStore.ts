import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PatientRow, CheckinRow, AIAnalysis } from '../lib/database.types';

interface AppState {
  // Auth
  session: { user: { id: string; email?: string; phone?: string } } | null;
  patient: PatientRow | null;

  // Check-ins
  checkins: CheckinRow[];
  latestAnalysis: AIAnalysis | null;

  // Voice-to-checkin: in-progress draft checkin id (transient, not persisted)
  currentCheckinId: string | null;

  // UI
  activeTab: 'home' | 'checkin' | 'history' | 'voice';
  isLoading: boolean;
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;

  // Actions
  setSession: (session: AppState['session']) => void;
  setPatient: (patient: PatientRow | null) => void;
  setCheckins: (checkins: CheckinRow[]) => void;
  addCheckin: (checkin: CheckinRow) => void;
  setLatestAnalysis: (analysis: AIAnalysis | null) => void;
  setCurrentCheckinId: (id: string | null) => void;
  setActiveTab: (tab: AppState['activeTab']) => void;
  setLoading: (loading: boolean) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  clearToast: () => void;
  logout: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      session: null,
      patient: null,
      checkins: [],
      latestAnalysis: null,
      currentCheckinId: null,
      activeTab: 'home',
      isLoading: false,
      toast: null,

      setSession: (session) =>
        set((state) => {
          // Avoid triggering re-renders when the user identity hasn't changed
          if (state.session?.user?.id === session?.user?.id) return state;
          return { session };
        }),
      setPatient: (patient) => set({ patient }),
      setCheckins: (checkins) => set({ checkins }),
      addCheckin: (checkin) =>
        set((s) => ({ checkins: [checkin, ...s.checkins.filter((c) => c.id !== checkin.id)] })),
      setLatestAnalysis: (analysis) => set({ latestAnalysis: analysis }),
      setCurrentCheckinId: (currentCheckinId) => set({ currentCheckinId }),
      setActiveTab: (activeTab) => set({ activeTab }),
      setLoading: (isLoading) => set({ isLoading }),
      showToast: (message, type = 'info') => set({ toast: { message, type } }),
      clearToast: () => set({ toast: null }),
      logout: () => set({ session: null, patient: null, checkins: [], latestAnalysis: null, currentCheckinId: null }),
    }),
    {
      name: 'care-ai-patient',
      version: 2, // bump to invalidate old localStorage (pre-hair-conditions)
      partialize: (state) => ({
        session: state.session,
        patient: state.patient,
        checkins: state.checkins,
      }),
    }
  )
);
