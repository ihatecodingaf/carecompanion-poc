import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store/useStore';

import LandingPage       from './pages/LandingPage';
import LoginPage         from './pages/LoginPage';
import UploadPage        from './pages/UploadPage';
import PatientFormPage   from './pages/PatientFormPage';
import SuccessPage       from './pages/SuccessPage';
import DashboardPage     from './pages/DashboardPage';
import PatientDetailPage from './pages/PatientDetailPage';
import BottomNav         from './components/BottomNav';
import Toast             from './components/Toast';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const session = useStore((s) => s.session);
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const session = useStore((s) => s.session);

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Toast />
      <Routes>
        {/* ── Public (no auth required) ─────────────────────── */}
        <Route path="/" element={<LandingPage />} />

        <Route
          path="/login"
          element={session ? <Navigate to="/dashboard" replace /> : <LoginPage />}
        />

        {/* Add-patient flow — no login needed */}
        <Route path="/add-patient"         element={<UploadPage />} />
        <Route path="/add-patient/form"    element={<PatientFormPage />} />
        <Route path="/add-patient/success" element={<SuccessPage />} />

        {/* ── Protected (auth required, with BottomNav shell) ── */}
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
    <div className="flex flex-col" style={{ minHeight: '100dvh' }}>
      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/dashboard"                       element={<DashboardPage />} />
          <Route path="/patient/:patientId/:orgSlug"     element={<PatientDetailPage />} />
          {/* Alias routes for BottomNav tabs */}
          <Route path="/alerts"   element={<DashboardPage />} />
          <Route path="/patients" element={<DashboardPage />} />
          <Route path="/settings" element={<DashboardPage />} />
          <Route path="*"         element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
      <BottomNav />
    </div>
  );
}
