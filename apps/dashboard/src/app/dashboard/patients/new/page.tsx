import { query, SCHEMA } from '../../../../lib/db';
import AddPatientClient from '../../../../components/AddPatientClient';
import { ORG_SLUG } from '../../../../lib/supabase';

async function getDoctors() {
  return query<{ id: string; name: string; specialty: string }>(`
    SELECT id::text, name, specialty
    FROM ${SCHEMA}.doctors
    ORDER BY name
  `);
}

export const dynamic = 'force-dynamic';

export default async function NewPatientPage() {
  const doctors = await getDoctors();
  return <AddPatientClient doctors={doctors} orgSlug={ORG_SLUG} />;
}
