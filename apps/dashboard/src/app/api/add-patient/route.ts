import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withClient, SCHEMA } from '../../../lib/db';

export const maxDuration = 60;

// Admin client — service role key bypasses RLS, used only server-side
function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, age, gender, phone, email, doctorId, condition, treatmentName, notes, prescribedProducts } = body;

    if (!name?.trim()) return NextResponse.json({ error: 'Patient name is required' }, { status: 400 });
    if (!doctorId)     return NextResponse.json({ error: 'Doctor is required' }, { status: 400 });

    const patientId = `pt-care_demo-${Date.now()}`;
    const trimmedName  = name.trim();
    const trimmedEmail = email?.trim()?.toLowerCase() || null;
    const resolvedCondition = condition || 'acne';
    const resolvedTreatment = treatmentName?.trim() || resolvedCondition;

    const welcomeMsg = `Welcome to your recovery journey, ${trimmedName}! 🌟\n\n📋 Treatment: ${resolvedTreatment}\n💊 Medications:\n${prescribedProducts || 'See prescription'}\n\nYour doctor is monitoring your progress. Complete your daily check-ins for personalised AI feedback.`;

    // Create Supabase auth user if email provided, so patient can log into the patient app
    let authUserId: string | null = null;
    if (trimmedEmail) {
      const { data: authData, error: authError } = await adminSupabase().auth.admin.createUser({
        email: trimmedEmail,
        password: 'Patient@123',
        email_confirm: true,
      });
      if (!authError && authData?.user) {
        authUserId = authData.user.id;
      }
      // If user already exists (email taken), look them up
      if (authError?.message?.toLowerCase().includes('already')) {
        const { data: existing } = await adminSupabase().auth.admin.listUsers();
        const found = existing?.users?.find(u => u.email === trimmedEmail);
        if (found) authUserId = found.id;
      }
    }

    await withClient(async (client) => {
      await client.query(`
        INSERT INTO ${SCHEMA}.patients
          (id, doctor_id, name, age, gender, phone, email, auth_user_id,
           condition, treatment_name, treatment_start_date, current_day,
           status, adherence_percent, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, CURRENT_DATE, 1, 'green', 100.0, $11)
      `, [
        patientId, doctorId, trimmedName,
        age ? parseInt(String(age), 10) : 0,
        gender || 'Unknown',
        phone?.trim() || null,
        trimmedEmail,
        authUserId,
        resolvedCondition,
        resolvedTreatment,
        notes?.trim() || null,
      ]);

      await client.query(`
        INSERT INTO ${SCHEMA}.messages (patient_id, sender, content, message_type)
        VALUES ($1, 'aisha', $2, 'text')
      `, [patientId, welcomeMsg]);

      await client.query(`
        INSERT INTO ${SCHEMA}.adherence_log (patient_id, day_number, product_name, applied)
        VALUES ($1, 1, 'Registration', true)
      `, [patientId]);
    });

    return NextResponse.json({ success: true, id: patientId, canLogin: !!authUserId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
