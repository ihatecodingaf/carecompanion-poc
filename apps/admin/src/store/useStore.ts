import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Clinic } from '../lib/api';

interface Session {
  user: { id: string; email: string };
}

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
  visible: boolean;
}

interface AdminStore {
  session:   Session | null;
  clinics:   Clinic[];
  toast:     ToastState;

  setSession:  (s: Session | null) => void;
  setClinics:  (c: Clinic[]) => void;
  showToast:   (msg: string, type?: ToastState['type']) => void;
  hideToast:   () => void;
  logout:      () => void;
}

export const useStore = create<AdminStore>()(
  persist(
    (set) => ({
      session:  null,
      clinics:  [],
      toast:    { message: '', type: 'info', visible: false },

      setSession:  (session) => set({ session }),
      setClinics:  (clinics) => set({ clinics }),
      showToast:   (message, type = 'info') => set({ toast: { message, type, visible: true } }),
      hideToast:   () => set((s) => ({ toast: { ...s.toast, visible: false } })),
      logout:      () => set({ session: null, clinics: [] }),
    }),
    {
      name: 'precovery-admin',
      partialize: (s) => ({ session: s.session }),
    },
  ),
);
