import { createClient } from '@supabase/supabase-js';
import { installDemoApi } from '@care-ai/demo-api';

// Public demo build: answer Supabase requests in the browser from sample data.
if (import.meta.env.VITE_DEMO_BACKEND === 'true') installDemoApi();

const url  = import.meta.env.VITE_SUPABASE_URL;
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
}

export const supabase = createClient(url, key);
