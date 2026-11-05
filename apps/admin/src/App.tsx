import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useStore } from './store/useStore';

import LoginPage      from './pages/LoginPage';
import ClinicListPage from './pages/ClinicListPage';
import ClinicDetailPage from './pages/ClinicDetailPage';
import Sidebar        from './components/Sidebar';
import Toast          from './components/Toast';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session } = useStore();
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { setSession, logout } = useStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSession({ user: { id: session.user.id, email: session.user.email! } });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setSession({ user: { id: session.user.id, email: session.user.email! } });
      } else if (event === 'SIGNED_OUT') {
        logout();
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <BrowserRouter>
      <Toast />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <AuthGuard>
              <div className="flex min-h-screen">
                <Sidebar />
                <main className="flex-1 overflow-auto">
                  <Routes>
                    <Route path="/"                   element={<Navigate to="/clinics" replace />} />
                    <Route path="/clinics"             element={<ClinicListPage />} />
                    <Route path="/clinics/:slug"       element={<ClinicDetailPage />} />
                    <Route path="*"                    element={<Navigate to="/clinics" replace />} />
                  </Routes>
                </main>
              </div>
            </AuthGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
