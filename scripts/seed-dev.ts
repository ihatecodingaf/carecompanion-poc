/**
 * Dev seed script — creates superadmin + doctor auth users
 * Run once after pushing migration 006:
 *   npx tsx scripts/seed-dev.ts
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env
 * or edit the constants below directly for local use.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seedSuperAdmin() {
  console.log('Creating superadmin...');

  const { data, error } = await supabase.auth.admin.createUser({
    email: 'admin@precovery.dev',
    password: 'PrecoveryAdmin2025!',
    email_confirm: true,
    user_metadata: { role: 'superadmin', name: 'Kaustubh (SuperAdmin)' },
  });

  if (error && !error.message.includes('already been registered')) {
    console.error('Superadmin error:', error.message);
    return null;
  }

  const userId = data?.user?.id;
  if (!userId) {
    console.log('Superadmin already exists — skipping insert');
    return null;
  }

  const { error: insertErr } = await supabase
    .from('admin_users')
    .insert({ id: userId, email: 'admin@precovery.dev', name: 'Kaustubh (SuperAdmin)' })
    .select();

  if (insertErr) console.error('admin_users insert error:', insertErr.message);
  else console.log('✅ Superadmin created:', userId);

  return userId;
}

async function seedDoctor() {
  console.log('Creating doctor...');

  const { data, error } = await supabase.auth.admin.createUser({
    email: 'dr.priya@precovery.dev',
    password: 'PrecoveryDoctor2025!',
    email_confirm: true,
    user_metadata: { role: 'doctor', name: 'Dr. Priya Mehta' },
  });

  if (error && !error.message.includes('already been registered')) {
    console.error('Doctor auth error:', error.message);
    return;
  }

  const userId = data?.user?.id;
  if (!userId) {
    console.log('Doctor already exists — skipping profile insert');
    return;
  }

  // Insert doctor row into org_care_demo.doctors via RPC (schema-aware)
  const { error: rpcErr } = await supabase.rpc('seed_doctor_profile', {
    p_auth_user_id: userId,
    p_doctor_id:    'doc_priya_001',
    p_name:         'Dr. Priya Mehta',
    p_specialty:    'Dermatology & Hair Restoration',
    p_clinic_name:  'Care Demo Clinic',
    p_location:     'Mumbai, Maharashtra',
    p_phone:        '+91 98100 00001',
    p_email:        'dr.priya@precovery.dev',
    p_org_slug:     'care_demo',
  });

  if (rpcErr) {
    // RPC may not exist yet — fallback to direct SQL approach note
    console.warn('seed_doctor_profile RPC not found — inserting directly');
    // Direct insert via raw query using service role
    const { error: directErr } = await supabase
      .schema('org_care_demo' as never)
      .from('doctors')
      .upsert({
        id:               'doc_priya_001',
        name:             'Dr. Priya Mehta',
        specialty:        'Dermatology & Hair Restoration',
        clinic_name:      'Care Demo Clinic',
        clinic_location:  'Mumbai, Maharashtra',
        phone:            '+91 98100 00001',
        email:            'dr.priya@precovery.dev',
        auth_user_id:     userId,
      });

    if (directErr) console.error('Doctor profile insert error:', directErr.message);
  }

  // Map doctor to care_demo clinic
  const { error: mapErr } = await supabase
    .from('doctor_clinic_map')
    .upsert({
      auth_user_id:  userId,
      org_slug:      'care_demo',
      doctor_row_id: 'doc_priya_001',
      is_primary:    true,
    });

  if (mapErr) console.error('doctor_clinic_map error:', mapErr.message);
  else console.log('✅ Doctor created and mapped to care_demo:', userId);
}

async function main() {
  console.log('🌱 Seeding dev Supabase project...\n');
  await seedSuperAdmin();
  await seedDoctor();
  console.log('\n✅ Seed complete.');
  console.log('\nCredentials:');
  console.log('  Superadmin: admin@precovery.dev / PrecoveryAdmin2025!');
  console.log('  Doctor:     dr.priya@precovery.dev / PrecoveryDoctor2025!');
}

main().catch(console.error);
