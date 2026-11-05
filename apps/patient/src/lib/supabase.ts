import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { installDemoApi } from '@care-ai/demo-api';

// Public demo build: answer Supabase requests in the browser from sample data.
if (import.meta.env.VITE_DEMO_BACKEND === 'true') installDemoApi();

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Care.ai] Missing Supabase env vars — check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
);

/** Org slug from env — determines which schema queries run against */
export const ORG_SLUG = import.meta.env.VITE_ORG_SLUG || 'care_demo';
export const APP_MODE = (import.meta.env.VITE_APP_MODE || 'demo') as 'demo' | 'pilot';
