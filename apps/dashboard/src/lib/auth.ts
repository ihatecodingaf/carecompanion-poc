import { headers } from 'next/headers';
import { query, SCHEMA } from './db';

interface Doctor { id: string; name: string; specialty: string; initials: string; }

// Reads the user ID from the header set by middleware (no second auth network call).
// Falls back to null — middleware already redirected unauthenticated requests to /login.
export async function getLoggedInDoctor(): Promise<Doctor | null> {
  const userId = headers().get('x-auth-user-id');
  if (!userId) return null;

  const rows = await query<Doctor>(
    `SELECT id, name, specialty, initials FROM ${SCHEMA}.doctors WHERE auth_user_id = $1`,
    [userId]
  );
  return rows[0] ?? null;
}
