import { createBrowserClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Browser client — only used for Supabase Auth (signIn/signOut/session cookies). All data queries go through lib/db.ts. */
export const supabase = createBrowserClient(url, anonKey);

export const ORG_SLUG = process.env.NEXT_PUBLIC_ORG_SLUG || 'care_demo';
