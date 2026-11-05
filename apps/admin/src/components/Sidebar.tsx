import { NavLink } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';

const NAV = [
  { label: 'Clinics',    path: '/clinics',  icon: '🏥' },
  { label: 'Audit Log',  path: '/audit',    icon: '📋' },
];

export default function Sidebar() {
  const { logout, session } = useStore();

  async function handleLogout() {
    await supabase.auth.signOut();
    logout();
  }

  return (
    <aside
      className="w-56 flex-shrink-0 flex flex-col min-h-screen"
      style={{ background: 'var(--bg2)', borderRight: '1px solid var(--b)' }}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--b)' }}>
        <div className="text-sm font-extrabold tracking-widest" style={{ color: 'var(--t)' }}>
          PRECOVERY
        </div>
        <div className="text-[0.6rem] font-medium mt-0.5" style={{ color: 'var(--teal)' }}>
          Admin Console
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {NAV.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
               ${isActive
                 ? 'bg-teal-500/10 text-teal-400'
                 : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
               }`
            }
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User + logout */}
      <div className="px-4 py-4 border-t" style={{ borderColor: 'var(--b)' }}>
        <div className="text-xs text-slate-400 truncate mb-2">{session?.user.email}</div>
        <button
          onClick={handleLogout}
          className="w-full text-left text-xs text-slate-500 hover:text-red-400 transition-colors"
        >
          Sign out →
        </button>
      </div>
    </aside>
  );
}
