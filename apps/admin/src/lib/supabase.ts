import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Anon client — for auth + public reads
export const supabase = createClient(url, key);

// Service-role client — for admin operations (create users, cross-schema writes)
// NOTE: service role key must NEVER be exposed in patient/doctor apps.
// Admin app is superadmin-only, so this is acceptable here.
const serviceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
