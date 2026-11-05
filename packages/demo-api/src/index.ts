/**
 * Public demo backend.
 *
 * In demo builds (VITE_DEMO_BACKEND=true) the apps point their Supabase URL at
 * DEMO_SUPABASE_URL and call installDemoApi() before creating the client.
 * Requests to that URL are answered in the browser by ./handlers; everything
 * else goes to the network as usual. Real builds never import this package.
 */
import { functions, rpc } from './handlers';
import { load, reset } from './store';

export const DEMO_SUPABASE_URL = 'https://demo-api.careai.local';
export const DEMO_ANON_KEY = 'public-demo-key';

const HOST = new URL(DEMO_SUPABASE_URL).host;
let installed = false;

export function installDemoApi(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  load(); // seed on first visit

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (url.host !== HOST) return realFetch(input, init);
    // Small delay so loading states look like they do against a real backend.
    await new Promise((r) => setTimeout(r, 120));
    try {
      return await route(url, init);
    } catch (e) {
      const err = e as Error & { status?: number };
      return json({ message: err.message, code: 'demo_error' }, err.status ?? 400);
    }
  };

  // Supabase Realtime: hand it a socket that never connects (no console spam).
  const RealWS = window.WebSocket;
  window.WebSocket = function (this: unknown, url: string | URL, protocols?: string | string[]) {
    if (new URL(String(url)).host === HOST) return new SilentSocket();
    return new RealWS(url, protocols);
  } as unknown as typeof WebSocket;
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });

  showBadge();
}

async function route(url: URL, init?: RequestInit): Promise<Response> {
  const path = url.pathname;
  const body = await readBody(init);

  // ── Auth (patient app) ────────────────────────────────────────────────────
  if (path === '/auth/v1/token') {
    const grant = url.searchParams.get('grant_type');
    const email = grant === 'refresh_token' ? String(body.refresh_token ?? '').replace(/^demo-refresh:/, '') : String(body.email ?? '');
    const patient = load().patients.find((p) => p.email && p.email.toLowerCase() === email.toLowerCase());
    if (!patient) return json({ code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
    return json(session(patient.email, patient.id));
  }
  if (path === '/auth/v1/user') {
    const claims = decodeToken(new Headers(init?.headers).get('Authorization'));
    return claims ? json(user(claims.email, claims.sub)) : json({ msg: 'Not signed in' }, 401);
  }
  if (path === '/auth/v1/logout') return new Response(null, { status: 204 });
  if (path === '/auth/v1/signup') return json({ code: 'signup_disabled', msg: 'Sign-ups are disabled in the demo. Pick one of the demo patients.' }, 422);

  // ── Postgres functions ────────────────────────────────────────────────────
  const rpcName = path.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/)?.[1];
  if (rpcName) {
    const fn = rpc[rpcName];
    if (!fn) return json({ message: `Function ${rpcName} is not available in the demo`, code: 'PGRST202' }, 404);
    return json(await fn(body));
  }

  // ── Edge functions ────────────────────────────────────────────────────────
  const fnName = path.match(/^\/functions\/v1\/([a-z0-9-]+)$/)?.[1];
  if (fnName) {
    const fn = functions[fnName];
    if (!fn) return json({ error: `Edge function ${fnName} is not available in the demo` }, 404);
    return json(await fn(body));
  }

  // ── Storage uploads: accept and forget ───────────────────────────────────
  if (path.startsWith('/storage/v1/object/')) return json({ Key: path.replace('/storage/v1/object/', ''), Id: crypto.randomUUID() });

  return json({ message: `Not available in the demo: ${path}` }, 404);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data ?? null), { status, headers: { 'Content-Type': 'application/json' } });
}

async function readBody(init?: RequestInit): Promise<Record<string, any>> {
  if (!init?.body || typeof init.body !== 'string') return {};
  try { return JSON.parse(init.body); } catch { return {}; }
}

const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

function user(email: string, id: string) {
  return {
    id, email, aud: 'authenticated', role: 'authenticated', email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: new Date().toISOString(),
  };
}

/** An unsigned, JWT-shaped token. Fine for a demo with no server to verify it. */
function session(email: string, id: string) {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24 * 7;
  const token = [b64url(JSON.stringify({ alg: 'none', typ: 'JWT' })), b64url(JSON.stringify({ sub: id, email, role: 'authenticated', aud: 'authenticated', exp })), 'demo'].join('.');
  return { access_token: token, token_type: 'bearer', expires_in: exp - Math.floor(Date.now() / 1000), expires_at: exp, refresh_token: `demo-refresh:${email}`, user: user(email, id) };
}

function decodeToken(header: string | null): { sub: string; email: string } | null {
  try {
    const payload = header?.replace(/^Bearer\s+/i, '').split('.')[1];
    if (!payload) return null;
    return JSON.parse(decodeURIComponent(escape(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))));
  } catch {
    return null;
  }
}

class SilentSocket extends EventTarget {
  readyState = 0;
  binaryType = 'blob';
  onopen = null; onclose = null; onerror = null; onmessage = null;
  send() {}
  close() { this.readyState = 3; }
}

function showBadge() {
  if (window.self !== window.top) return; // embedded on the landing page, which has its own Reset
  const add = () => {
    if (document.getElementById('careai-demo-badge')) return;
    const el = document.createElement('div');
    el.id = 'careai-demo-badge';
    el.innerHTML = 'DEMO · sample data <button type="button">Reset</button>';
    el.setAttribute('style', [
      'position:fixed', 'top:6px', 'left:50%', 'transform:translateX(-50%)', 'z-index:2147483647', 'display:flex', 'gap:6px', 'align-items:center',
      'font:600 10px/1 system-ui,sans-serif', 'letter-spacing:.06em', 'color:#CFE3F2', 'background:rgba(13,27,42,.82)',
      'border:1px solid rgba(43,191,191,.45)', 'border-radius:999px', 'padding:5px 6px 5px 10px', 'backdrop-filter:blur(6px)',
    ].join(';'));
    const btn = el.querySelector('button')!;
    btn.setAttribute('style', 'font:600 10px/1 system-ui,sans-serif;color:#0D1B2A;background:#2BBFBF;border:0;border-radius:999px;padding:4px 8px;cursor:pointer');
    btn.title = 'Restore the original demo patients and clear your changes';
    btn.onclick = () => { reset(); location.href = import.meta.env.BASE_URL || '/'; };
    document.body.appendChild(el);
  };
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
}
