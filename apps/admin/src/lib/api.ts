import { supabase, supabaseAdmin } from './supabase';

export interface Clinic {
  id:         string;
  name:       string;
  slug:       string;
  specialty:  string;
  city:       string | null;
  state:      string | null;
  phone:      string | null;
  active:     boolean;
  plan:       string;
  created_at: string;
}

export interface DoctorRow {
  id:              string;
  name:            string;
  specialty:       string;
  clinic_name:     string;
  clinic_location: string;
  phone:           string | null;
  email:           string | null;
  auth_user_id:    string | null;
  created_at:      string;
}

export interface PatientRow {
  id:                string;
  name:              string;
  age:               number;
  gender:            string;
  condition:         string;
  treatment_name:    string;
  status:            string;
  adherence_percent: number;
  current_day:       number;
  doctor_id:         string;
  created_at:        string;
}

// ── Clinics ────────────────────────────────────────────────

export async function listClinics(): Promise<Clinic[]> {
  const { data, error } = await supabase
    .from('orgs')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Clinic[];
}

export async function createClinic(params: {
  name: string;
  slug: string;
  specialty: string;
  city?: string;
  phone?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('provision_org', {
    p_org_name:  params.name,
    p_slug:      params.slug,
    p_specialty: params.specialty,
    p_city:      params.city ?? null,
    p_phone:     params.phone ?? null,
  });
  if (error) throw error;
  return data as string;
}

// ── Doctors ────────────────────────────────────────────────

export async function listDoctorsForClinic(orgSlug: string): Promise<DoctorRow[]> {
  const schema = `org_${orgSlug}`;
  const { data, error } = await supabase
    .schema(schema as never)
    .from('doctors')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DoctorRow[];
}

/** Search existing doctors across all clinics by email (for "assign existing" flow) */
export async function findDoctorByEmail(email: string): Promise<{
  authUserId: string;
  name: string;
  clinics: string[];
} | null> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw error;

  const user = data.users.find((u) => u.email === email && u.user_metadata?.role === 'doctor');
  if (!user) return null;

  const { data: mappings } = await supabase
    .from('doctor_clinic_map')
    .select('org_slug')
    .eq('auth_user_id', user.id);

  return {
    authUserId: user.id,
    name:       user.user_metadata?.name ?? email,
    clinics:    (mappings ?? []).map((m: { org_slug: string }) => m.org_slug),
  };
}

/** Create a brand-new doctor auth account and profile */
export async function createDoctor(params: {
  name:      string;
  email:     string;
  password:  string;
  specialty: string;
  phone:     string;
  orgSlug:   string;
}): Promise<void> {
  // 1. Create auth user
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email:         params.email,
    password:      params.password,
    email_confirm: true,
    user_metadata: { role: 'doctor', name: params.name },
  });
  if (authErr) throw authErr;

  const userId  = authData.user.id;
  const doctorId = `doc_${Date.now()}`;
  const schema   = `org_${params.orgSlug}`;

  // 2. Insert into org schema doctors table
  const { error: profileErr } = await supabaseAdmin
    .schema(schema as never)
    .from('doctors')
    .insert({
      id:              doctorId,
      name:            params.name,
      specialty:       params.specialty,
      clinic_name:     params.orgSlug,
      clinic_location: '',
      phone:           params.phone,
      email:           params.email,
      auth_user_id:    userId,
    });
  if (profileErr) throw profileErr;

  // 3. Map doctor to clinic
  const { error: mapErr } = await supabaseAdmin
    .from('doctor_clinic_map')
    .insert({
      auth_user_id:  userId,
      org_slug:      params.orgSlug,
      doctor_row_id: doctorId,
      is_primary:    true,
    });
  if (mapErr) throw mapErr;
}

/** Assign an existing doctor to a new clinic */
export async function assignDoctorToClinic(params: {
  authUserId: string;
  orgSlug:    string;
  name:       string;
  specialty:  string;
  phone:      string;
  email:      string;
}): Promise<void> {
  const doctorId = `doc_${Date.now()}`;
  const schema   = `org_${params.orgSlug}`;

  const { error: profileErr } = await supabaseAdmin
    .schema(schema as never)
    .from('doctors')
    .insert({
      id:              doctorId,
      name:            params.name,
      specialty:       params.specialty,
      clinic_name:     params.orgSlug,
      clinic_location: '',
      phone:           params.phone,
      email:           params.email,
      auth_user_id:    params.authUserId,
    });
  if (profileErr) throw profileErr;

  const { error: mapErr } = await supabaseAdmin
    .from('doctor_clinic_map')
    .insert({
      auth_user_id:  params.authUserId,
      org_slug:      params.orgSlug,
      doctor_row_id: doctorId,
      is_primary:    false,
    });
  if (mapErr) throw mapErr;
}

// ── Patients ───────────────────────────────────────────────

export async function listPatientsForClinic(orgSlug: string): Promise<PatientRow[]> {
  const schema = `org_${orgSlug}`;
  const { data, error } = await supabase
    .schema(schema as never)
    .from('patients')
    .select('id, name, age, gender, condition, treatment_name, status, adherence_percent, current_day, doctor_id, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PatientRow[];
}

// ── Global stats ───────────────────────────────────────────

export async function getAdminStats(): Promise<{
  totalClinics: number;
  totalDoctors: number;
}> {
  const { data: clinics } = await supabase.from('orgs').select('id', { count: 'exact', head: true });
  const { data: map }     = await supabase.from('doctor_clinic_map').select('auth_user_id');

  const uniqueDoctors = new Set((map ?? []).map((r: { auth_user_id: string }) => r.auth_user_id)).size;

  return {
    totalClinics: (clinics as unknown as { count: number })?.count ?? 0,
    totalDoctors: uniqueDoctors,
  };
}
