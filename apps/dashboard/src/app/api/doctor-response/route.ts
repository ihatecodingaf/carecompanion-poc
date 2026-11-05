import { NextRequest, NextResponse } from 'next/server';
import { queryOne, SCHEMA } from '../../../lib/db';

export async function POST(req: NextRequest) {
  try {
    const { checkinId, response } = await req.json();
    if (!checkinId || !response?.trim()) {
      return NextResponse.json({ error: 'checkinId and response required' }, { status: 400 });
    }

    const row = await queryOne(`
      UPDATE ${SCHEMA}.checkins
      SET doctor_response = $2
      WHERE id = $1
      RETURNING id
    `, [checkinId, response.trim()]);

    if (!row) return NextResponse.json({ error: 'Check-in not found' }, { status: 404 });

    // Also store as a message in the chat thread
    const checkin = await queryOne<{ patient_id: string }>(`
      SELECT patient_id FROM ${SCHEMA}.checkins WHERE id = $1
    `, [checkinId]);

    if (checkin?.patient_id) {
      await queryOne(`
        INSERT INTO ${SCHEMA}.messages (patient_id, sender, content, message_type)
        VALUES ($1, 'doctor', $2, 'text')
        RETURNING id
      `, [checkin.patient_id, response.trim()]);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
