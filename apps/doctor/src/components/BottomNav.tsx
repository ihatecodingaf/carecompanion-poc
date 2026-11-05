import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';

const TABS = [
  { label: 'Home',     icon: '🏠', path: '/' },
  { label: 'Alerts',  icon: '🔔', path: '/alerts' },
  { label: 'Patients',icon: '🫀', path: '/patients' },
  { label: 'Add',     icon: '➕', path: '/add-patient' },
  { label: 'Settings',icon: '⚙️', path: '/settings' },
];

export default function BottomNav() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const dashboard = useStore((s) => s.dashboard);
  const alertCount = dashboard?.alerts?.length ?? 0;

  return (
    <nav
      className="flex-shrink-0 flex items-center justify-around safe-bottom"
      style={{
        height: '58px',
        background: 'var(--bg2)',
        borderTop: '1px solid var(--b)',
      }}
    >
      {TABS.map((tab) => {
        const active = location.pathname === tab.path ||
          (tab.path === '/' && location.pathname === '/dashboard');

        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className="flex flex-col items-center gap-0.5 flex-1 py-1.5 relative"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span
              className="text-[0.46rem] font-semibold leading-none"
              style={{ color: active ? 'var(--teal)' : 'var(--t3)' }}
            >
              {tab.label}
            </span>
            {tab.label === 'Alerts' && alertCount > 0 && (
              <span
                className="absolute top-1 right-3 min-w-[13px] h-[13px] rounded-full
                           bg-red-500 text-white flex items-center justify-center
                           text-[0.43rem] font-bold px-1"
              >
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
