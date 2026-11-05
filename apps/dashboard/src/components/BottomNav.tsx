'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  // { icon: '🏠', label: 'Home',    href: '/dashboard',        key: 'home' },  // hidden until dedicated home screen is built
  { icon: '🔔', label: 'Alerts',  href: '/dashboard/alerts', key: 'alerts' },
  { icon: '👥', label: 'Patients',href: '/dashboard',        key: 'patients' },
  { icon: '↩',  label: 'Log Out', href: '/__logout',         key: 'logout' },
];

export default function BottomNav({ alertCount = 0 }: { alertCount?: number }) {
  const path = usePathname();

  function isActive(key: string) {
    if (key === 'alerts')   return path.includes('/alerts');
    if (key === 'home' || key === 'patients') return path === '/dashboard';
    return false;
  }

  async function handleLogout(e: React.MouseEvent) {
    e.preventDefault();
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  return (
    <nav style={{
      height: 58,
      background: 'var(--bg2)',
      borderTop: '1px solid var(--b)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      flexShrink: 0,
      padding: '0 4px 4px',
    }}>
      {NAV_ITEMS.map(item => {
        const active = isActive(item.key);
        const hasBadge = item.key === 'alerts' && alertCount > 0;
        const isLogout = item.key === 'logout';

        if (isLogout) {
          return (
            <button key={item.key} onClick={handleLogout} style={{
              flex: 1, background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '5px 8px', borderRadius: 8,
            }}>
              <span style={{ fontSize: 17, color: 'var(--t3)' }}>{item.icon}</span>
              <span style={{ fontSize: 7.5, fontWeight: 600, color: 'var(--t3)', whiteSpace: 'nowrap' }}>{item.label}</span>
            </button>
          );
        }

        return (
          <Link key={item.key} href={item.href} style={{ textDecoration: 'none', flex: 1 }}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '5px 8px', borderRadius: 8, cursor: 'pointer', position: 'relative',
              transition: '0.12s',
            }}>
              <span style={{ fontSize: 17, color: active ? 'var(--teal)' : 'var(--t3)' }}>{item.icon}</span>
              <span style={{ fontSize: 7.5, fontWeight: 600, color: active ? 'var(--teal)' : 'var(--t3)', whiteSpace: 'nowrap' }}>
                {item.label}
              </span>
              {hasBadge && (
                <div style={{
                  position: 'absolute', top: 3, right: '20%',
                  minWidth: 13, height: 13, borderRadius: 99,
                  background: 'var(--red)', color: '#fff',
                  fontSize: 7, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                }}>
                  {alertCount}
                </div>
              )}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
