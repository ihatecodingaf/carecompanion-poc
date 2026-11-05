import { NextRequest, NextResponse } from 'next/server';
import { queryOne, SCHEMA } from '../../../lib/db';

export async function POST(req: NextRequest) {
  try {
    const { alertId, doctorNote } = await req.json();
    if (!alertId) return NextResponse.json({ error: 'alertId required' }, { status: 400 });

    const row = await queryOne(`
      UPDATE ${SCHEMA}.alerts
      SET resolved = true, doctor_action = $2
      WHERE id = $1
      RETURNING id
    `, [alertId, doctorNote ?? 'Reviewed']);

    if (!row) return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
