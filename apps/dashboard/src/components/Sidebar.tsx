'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>,
  },
  {
    href: '/dashboard/alerts',
    label: 'Alerts',
    icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>,
  },
];

export default function Sidebar({ alertCount = 0 }: { alertCount?: number }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <nav className="sidebar">
      {/* Logo */}
      <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#7c3aed,#5b21b6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" fill="white" width="18" height="18"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}><span className="gradient-text">Care.ai</span></div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500 }}>DOCTOR DASHBOARD</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ padding: '10px 0', flex: 1 }}>
        {navItems.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
              <div className={`sidebar-item ${active ? 'active' : ''}`}>
                {item.icon}
                <span>{item.label}</span>
                {item.label === 'Alerts' && alertCount > 0 && (
                  <span style={{ marginLeft: 'auto', minWidth: 18, height: 18, borderRadius: 9, background: 'var(--red)', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
                    {alertCount > 9 ? '9+' : alertCount}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
        <button onClick={handleSignOut} className="sidebar-item" style={{ width: 'calc(100% - 0px)', color: 'var(--text-3)' }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
          <span>Sign Out</span>
        </button>
      </div>
    </nav>
  );
}
