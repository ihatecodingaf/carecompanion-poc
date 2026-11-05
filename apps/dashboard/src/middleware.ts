import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set(name, value);
          supabaseResponse = NextResponse.next({ request });
          supabaseResponse.cookies.set(name, value, options);
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set(name, '');
          supabaseResponse = NextResponse.next({ request });
          supabaseResponse.cookies.set(name, '', { ...options, maxAge: 0 });
        },
      },
    }
  );

  // getSession() reads the JWT from the cookie — no network call, O(0) latency.
  // getUser() makes a round-trip to Supabase auth servers (~150ms). We skip it here
  // and trust the signed JWT for routing decisions. Pages that need the real user
  // object can call getUser() themselves — but we share the user ID via a header
  // so most pages only need one DB query, not a second auth call.
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;

  const path = request.nextUrl.pathname;
  const isDashboard = path.startsWith('/dashboard');
  const isLogin = path === '/login';

  if (!userId && isDashboard) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (userId && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Pass user ID to server components via header — eliminates the second getUser() call
  if (userId) {
    supabaseResponse.headers.set('x-auth-user-id', userId);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
};
