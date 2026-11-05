import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const { showToast } = useStore();
  const [email,    setEmail]    = useState('admin@precovery.dev');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (data.user?.user_metadata?.role !== 'superadmin') {
        await supabase.auth.signOut();
        showToast('Access denied — superadmin only', 'error');
        return;
      }
      navigate('/clinics', { replace: true });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div
        className="w-full max-w-sm rounded-2xl p-8"
        style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
      >
        <div className="mb-8">
          <div className="text-lg font-extrabold tracking-widest mb-1" style={{ color: 'var(--t)' }}>
            PRECOVERY
          </div>
          <div className="text-xs font-medium" style={{ color: 'var(--teal)' }}>Admin Console</div>
          <p className="text-sm mt-3" style={{ color: 'var(--t2)' }}>
            Superadmin access only
          </p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                   style={{ color: 'var(--t3)' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
              style={{ background: 'var(--bg3)', border: '1px solid var(--b)', color: 'var(--t)' }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                   style={{ color: 'var(--t3)' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--b)', color: 'var(--t)' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white mt-1
                       transition-opacity disabled:opacity-60"
            style={{ background: 'var(--teal)' }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
