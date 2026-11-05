import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store/useStore';
import { supabase } from './lib/supabase';
import { getPatientProfile } from './lib/api';
import { preloadMediaPipe } from './lib/mediapipe';

import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import CheckinPage from './pages/CheckinPage';
import HistoryPage from './pages/HistoryPage';
import VoicePage from './pages/VoicePage';
import AishaCheckinPage from './pages/AishaCheckinPage';
import MessagesPage from './pages/MessagesPage';
import BottomNav from './components/BottomNav';
import Toast from './components/Toast';
import InstallBanner from './components/InstallBanner';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session } = useStore();
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { session, setSession, setPatient, showToast } = useStore();

  useEffect(() => {
    preloadMediaPipe();

    // On load: restore session AND always re-fetch patient from DB so stale
    // localStorage data (e.g. old condition field) is immediately overwritten.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        setSession({ user: { id: session.user.id, email: session.user.email! } });
        try {
          // 8 s timeout — prevents a slow/hung Supabase RPC from freezing the app
          const profile = await Promise.race([
            getPatientProfile(session.user.email!),
            new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
          ]);
          if (profile) setPatient(profile);
        } catch { /* handled in HomePage */ }
      } else {
        // No valid server session — clear any stale persisted session from localStorage
        useStore.getState().logout();
      }
    });

    // Also handle sign-in / sign-out events (e.g. demo patient switching)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setSession({ user: { id: session.user.id, email: session.user.email! } });
        try {
          const patient = await getPatientProfile(session.user.email!);
          if (patient) setPatient(patient);
        } catch { /* handled in HomePage */ }
      } else if (event === 'SIGNED_OUT') {
        useStore.getState().logout();
      }
    });

    return () => subscription.unsubscribe();
  }, [setSession, setPatient, showToast]);

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Toast />
      <InstallBanner />
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
        {/* Full-screen routes — no BottomNav */}
        <Route path="/checkin-flow" element={<AuthGuard><AishaCheckinPage /></AuthGuard>} />
        <Route
          path="/*"
          element={
            <AuthGuard>
              <AppShell />
            </AuthGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

function AppShell() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/checkin" element={<CheckinPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/voice" element={<VoicePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  );
}
