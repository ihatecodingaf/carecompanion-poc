'use client';
import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import BottomNav from './BottomNav';

interface ZoneData { redness: number; swelling: number; texture_concern: number; notes?: string }
interface HairZoneData { density: number; scalp_visibility: number; hotspot: boolean; notes?: string }
interface Checkin {
  id: string; day_number: number; checkin_date: string; status: string;
  photo_url?: string; ai_headline?: string; ai_summary?: string; ai_zone_analysis?: string;
  ai_suggested_actions?: string; doctor_response?: string; quality_score?: number;
  symptoms_reported?: string; adherence_today?: boolean; transcript?: string;
}
interface Alert { id: string; severity: string; title: string; ai_analysis: string; suggested_actions: string; photo_url?: string; created_at: string; resolved: boolean; doctor_action?: string }
interface Message { id: number; sender: string; content: string; message_type: string; timestamp: string; photo_url?: string }

const HAIR_CONDITIONS = ['androgenic_alopecia', 'alopecia_areata', 'telogen_effluvium'];

const CONDITION_LABELS: Record<string, string> = {
  acne: 'Acne Vulgaris',
  laser_recovery: 'Post-Laser Recovery',
  androgenic_alopecia: 'Androgenic Alopecia',
  alopecia_areata: 'Alopecia Areata',
  telogen_effluvium: 'Telogen Effluvium',
};

const ZONE_LABELS: Record<string, string> = {
  forehead: 'Forehead', left_cheek: 'L. Cheek', right_cheek: 'R. Cheek',
  nose_tzone: 'T-Zone', perioral: 'Perioral', chin: 'Chin',
};

const HAIR_ZONE_LABELS: Record<string, string> = {
  crown: 'Crown', hairline: 'Hairline', left_temple: 'L. Temple',
  right_temple: 'R. Temple', parting_line: 'Parting', sides: 'Sides',
};

export default function PatientDetailClient({ data }: { data: { patient: Record<string, unknown>; doctor: Record<string, unknown>; checkins: Checkin[]; alerts: Alert[]; messages: Message[] }; orgSlug?: string }) {
  const { patient, doctor, checkins = [], alerts = [], messages = [] } = data;
  const [tab, setTab] = useState<'overview' | 'checkins' | 'alerts' | 'messages'>('overview');
  const [selectedCheckin, setSelectedCheckin] = useState<Checkin | null>(null);
  const [doctorResponse, setDoctorResponse] = useState('');
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: 99999, behavior: 'smooth' });
  }, [messages]);

  const isHairPatient = HAIR_CONDITIONS.includes(patient.condition as string);

  const parsedZoneAnalysis = selectedCheckin?.ai_zone_analysis
    ? JSON.parse(selectedCheckin.ai_zone_analysis) : null;
  const zoneAnalysis: Record<string, ZoneData> | null = !isHairPatient ? parsedZoneAnalysis : null;
  const hairZoneAnalysis: Record<string, HairZoneData> | null = isHairPatient ? parsedZoneAnalysis : null;

  const openAlerts = alerts.filter(a => !a.resolved);

  async function resolveAlert(alertId: string, action: string) {
    await fetch('/api/resolve-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertId, doctorNote: action }),
    });
    window.location.reload();
  }

  async function sendResponse() {
    if (!doctorResponse.trim() || !respondingTo) return;
    setSending(true);
    await fetch('/api/doctor-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkinId: respondingTo, response: doctorResponse }),
    });
    setSending(false);
    setDoctorResponse('');
    setRespondingTo(null);
    window.location.reload();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Photo lightbox */}
      {expandedPhoto && (
        <div onClick={() => setExpandedPhoto(null)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={expandedPhoto} alt="Check-in photo" style={{ maxWidth: '92vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: 10 }} />
        </div>
      )}
      {/* Top bar */}
      <div style={{ height: 44, background: 'var(--bg2)', borderBottom: '1px solid var(--b)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 13px', flexShrink: 0 }}>
        <Link href="/dashboard" style={{ textDecoration: 'none', color: 'var(--teal)', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
          ← Dashboard
        </Link>
        <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--t)' }}>{patient.name as string}</span>
        <div className={`tag tag-${patient.status as string}`} style={{ fontSize: 9 }}>
          <span className={`status-dot ${patient.status}`} />
          {patient.status === 'green' ? 'On Track' : patient.status === 'yellow' ? 'Watch' : 'Urgent'}
        </div>
      </div>

      <main style={{ flex: 1, overflow: 'auto', padding: '16px 14px 80px' }}>
        {/* Back + header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(43,191,191,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: 'var(--teal)' }}>
              {(patient.name as string).split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t)' }}>{patient.name as string}</div>
              <div style={{ color: 'var(--t3)', fontSize: 11, marginTop: 2 }}>
                {patient.age as number}y · {patient.gender as string} · Day {patient.current_day as number}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 16, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 3 }}>
          {(['overview', 'checkins', 'alerts', 'messages'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '6px 8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
              background: tab === t ? 'var(--bg4)' : 'transparent',
              color: tab === t ? 'var(--t)' : 'var(--t3)',
              position: 'relative', fontFamily: 'Inter,sans-serif', whiteSpace: 'nowrap',
            }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'alerts' && openAlerts.length > 0 && (
                <span style={{ position: 'absolute', top: 3, right: 4, width: 7, height: 7, borderRadius: '50%', background: 'var(--red)' }} />
              )}
            </button>
          ))}
        </div>

        {/* ─── Overview ─── */}
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Latest check-in */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 12, letterSpacing: 0.8 }}>LATEST CHECK-IN</div>
              {selectedCheckin ? (
                <>
                  {selectedCheckin.photo_url && (
                    <div style={{ marginBottom: 12, borderRadius: 10, overflow: 'hidden' }}>
                      <img
                        src={selectedCheckin.photo_url}
                        alt="Check-in photo"
                        style={{ width: '100%', display: 'block', objectFit: 'cover', borderRadius: 10 }}
                      />
                    </div>
                  )}
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{selectedCheckin.ai_headline ?? 'Analysis complete'}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 10 }}>{selectedCheckin.ai_summary}</div>
                  {selectedCheckin.ai_suggested_actions && (
                    <div style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                      <strong style={{ color: 'var(--brand-light)', fontSize: 10 }}>RECOMMENDATION: </strong>{selectedCheckin.ai_suggested_actions}
                    </div>
                  )}
                  {!selectedCheckin.doctor_response && (
                    <div style={{ marginTop: 12 }}>
                      {respondingTo === selectedCheckin.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <textarea className="input" style={{ resize: 'none', fontSize: 13, minHeight: 72 }} value={doctorResponse} onChange={e => setDoctorResponse(e.target.value)} placeholder="Write your clinical response…" />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setRespondingTo(null)}>Cancel</button>
                            <button className="btn btn-primary" style={{ fontSize: 12, flex: 1 }} onClick={sendResponse} disabled={sending}>
                              {sending ? <span className="spinner" /> : 'Send Response'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button className="btn btn-ghost" style={{ fontSize: 12, width: '100%' }} onClick={() => setRespondingTo(selectedCheckin.id)}>
                          ✏ Add Clinical Response
                        </button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: 'var(--text-3)', fontSize: 13 }}>No check-ins yet</div>
              )}
            </div>

            {/* Patient info + zone analysis */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 12, letterSpacing: 0.8 }}>PATIENT INFO</div>
                <InfoRow label="Doctor" value={doctor?.name as string} />
                <InfoRow label="Condition" value={CONDITION_LABELS[patient.condition as string] ?? (patient.condition as string)} />
                <InfoRow label="Started" value={new Date(patient.treatment_start_date as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
                <InfoRow label="Adherence" value={`${Math.round(patient.adherence_percent as number)}%`} />
                <InfoRow label="Email" value={patient.email as string} />
                {!!patient.prescribed_products && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>PRESCRIBED PRODUCTS</div>
                    {(JSON.parse(patient.prescribed_products as string) as string[]).map((p, i) => (
                      <div key={i} style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--brand)', flexShrink: 0 }} />
                        {p}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Zone breakdown — face */}
              {zoneAnalysis && (
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 12, letterSpacing: 0.8 }}>SKIN ZONE ANALYSIS — Day {selectedCheckin?.day_number}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {(Object.entries(zoneAnalysis) as [string, ZoneData][]).map(([key, zone]) => {
                      const max = Math.max(zone.redness, zone.swelling, zone.texture_concern);
                      const col = max >= 3 ? 'var(--red)' : max >= 2 ? 'var(--yellow)' : max >= 1 ? '#fbbf24' : 'var(--green)';
                      return (
                        <div key={key} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                          <div style={{ marginBottom: 5 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>{ZONE_LABELS[key] ?? key}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {(['redness', 'swelling', 'texture_concern'] as const).map(metric => (
                              <div key={metric} style={{ flex: 1 }}>
                                <div style={{ fontSize: 8, color: 'var(--text-3)', marginBottom: 2 }}>{metric === 'texture_concern' ? 'TEX' : metric === 'redness' ? 'RED' : 'SWL'}</div>
                                <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                                  <div style={{ height: '100%', width: `${(zone[metric] / 3) * 100}%`, background: col, borderRadius: 2 }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Zone breakdown — hair */}
              {hairZoneAnalysis && (
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 12, letterSpacing: 0.8 }}>HAIR ZONE ANALYSIS — Day {selectedCheckin?.day_number}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {(Object.entries(hairZoneAnalysis) as [string, HairZoneData][]).map(([key, zone]) => {
                      const d = zone.density;
                      const col = d >= 3 ? 'var(--green)' : d >= 2 ? 'var(--yellow)' : d >= 1 ? '#f97316' : 'var(--red)';
                      const bg = d >= 3 ? 'rgba(16,185,129,0.06)' : d >= 2 ? 'rgba(245,158,11,0.06)' : d >= 1 ? 'rgba(249,115,22,0.06)' : 'rgba(239,68,68,0.06)';
                      return (
                        <div key={key} style={{ padding: '8px 10px', borderRadius: 8, background: bg, border: `1px solid ${zone.hotspot ? 'rgba(239,68,68,0.3)' : 'var(--border)'}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>
                              {HAIR_ZONE_LABELS[key] ?? key}{zone.hotspot ? ' ⚠' : ''}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: col }}>D{d}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <div style={{ flex: 2 }}>
                              <div style={{ fontSize: 8, color: 'var(--text-3)', marginBottom: 2 }}>DENSITY</div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                                <div style={{ height: '100%', width: `${(d / 3) * 100}%`, background: col, borderRadius: 2 }} />
                              </div>
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 8, color: 'var(--text-3)', marginBottom: 2 }}>SCALP VIS</div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                                <div style={{ height: '100%', width: `${zone.scalp_visibility}%`, background: 'rgba(148,163,184,0.6)', borderRadius: 2 }} />
                              </div>
                            </div>
                          </div>
                          {zone.notes && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.3 }}>{zone.notes}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Check-ins ─── */}
        {tab === 'checkins' && !selectedCheckin && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {checkins.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--t3)', fontSize: 12 }}>No check-ins yet.</div>
            )}
            {checkins.map(c => {
              const borderCol = c.status === 'red' || c.status === 'critical' ? 'var(--red)'
                : c.status === 'yellow' || c.status === 'warning' ? 'var(--gold)' : 'var(--green)';
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCheckin(c)}
                  style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid var(--b)', borderLeft: `3px solid ${borderCol}`, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', display: 'block' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--t)' }}>Day {c.day_number}</span>
                      <span className={`status-dot ${c.status}`} />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--t3)' }}>{new Date(c.checkin_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>
                  {c.ai_headline && <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.35 }}>{c.ai_headline.slice(0, 80)}{c.ai_headline.length > 80 ? '…' : ''}</div>}
                </button>
              );
            })}
          </div>
        )}

        {tab === 'checkins' && selectedCheckin && (
          <div>
            {/* Back nav */}
            <button
              onClick={() => setSelectedCheckin(null)}
              style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '0 0 12px', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              ← All Check-ins
            </button>
            <div className="card" style={{ padding: 16, overflowY: 'auto', maxHeight: 'calc(100vh - 230px)' }}>
                  {/* Header: photo thumbnail + headline side-by-side */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-start' }}>
                    {selectedCheckin.photo_url && (
                      <div
                        onClick={() => setExpandedPhoto(selectedCheckin.photo_url!)}
                        style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', cursor: 'zoom-in', position: 'relative' }}
                        title="Click to enlarge"
                      >
                        <img
                          src={selectedCheckin.photo_url}
                          alt={`Day ${selectedCheckin.day_number} check-in`}
                          style={{ width: 110, height: 110, display: 'block', objectFit: 'cover' }}
                        />
                        <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: '2px 5px', fontSize: 9, color: '#fff' }}>🔍</div>
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{selectedCheckin.ai_headline}</h3>
                      <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>{selectedCheckin.ai_summary}</p>
                    </div>
                  </div>

                  {/* Patient voice notes */}
                  {(() => {
                    const raw = selectedCheckin.symptoms_reported ?? '';
                    const sympMatch = raw.match(/Symptoms:\s*(.+?)(?:\.\s*Medications:|$)/i);
                    const medMatch  = raw.match(/Medications:\s*(.+?)$/i);
                    const sympt = sympMatch?.[1]?.trim() || (raw && !raw.startsWith('Symptoms:') ? raw : null);
                    const meds  = medMatch?.[1]?.trim();
                    if (!sympt && !meds) return null;
                    return (
                      <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 9, background: 'rgba(43,191,191,0.04)', border: '1px solid rgba(43,191,191,0.15)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.06em', marginBottom: 10 }}>PATIENT VOICE NOTES</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {sympt && (
                            <div>
                              <div style={{ fontSize: 9, color: 'var(--teal)', fontWeight: 600, marginBottom: 3 }}>🩺 Aisha: "How is your skin feeling today? Any redness, itching, or discomfort?"</div>
                              <div style={{ fontSize: 11, color: 'var(--t2)', background: 'rgba(43,191,191,0.06)', padding: '5px 8px', borderRadius: 6, lineHeight: 1.45 }}>
                                👤 &ldquo;{sympt}&rdquo;
                              </div>
                            </div>
                          )}
                          {meds && (
                            <div>
                              <div style={{ fontSize: 9, color: 'var(--teal)', fontWeight: 600, marginBottom: 3 }}>🩺 Aisha: "Have you applied all your prescribed treatments today?"</div>
                              <div style={{ fontSize: 11, color: 'var(--t2)', background: 'rgba(43,191,191,0.06)', padding: '5px 8px', borderRadius: 6, lineHeight: 1.45 }}>
                                👤 &ldquo;{meds}&rdquo;
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  {selectedCheckin.ai_suggested_actions && (
                    <div style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)', marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--brand-light)', marginBottom: 5 }}>RECOMMENDATION</div>
                      <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{selectedCheckin.ai_suggested_actions}</div>
                    </div>
                  )}
                  {/* Face zone breakdown in checkins tab */}
                  {!isHairPatient && parsedZoneAnalysis && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8 }}>SKIN ZONE ANALYSIS</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {(Object.entries(parsedZoneAnalysis) as [string, ZoneData][]).map(([key, zone]) => {
                          const max = Math.max(zone.redness, zone.swelling, zone.texture_concern);
                          const col = max >= 3 ? 'var(--red)' : max >= 2 ? 'var(--yellow)' : max >= 1 ? '#fbbf24' : 'var(--green)';
                          return (
                            <div key={key} style={{ padding: '6px 8px', borderRadius: 7, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>{ZONE_LABELS[key] ?? key}</div>
                              <div style={{ display: 'flex', gap: 3 }}>
                                {(['redness', 'swelling', 'texture_concern'] as const).map(m => (
                                  <div key={m} style={{ flex: 1 }}>
                                    <div style={{ fontSize: 7, color: 'var(--text-3)', marginBottom: 2 }}>{m === 'texture_concern' ? 'TEX' : m === 'redness' ? 'RED' : 'SWL'}</div>
                                    <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                                      <div style={{ height: '100%', width: `${(zone[m] / 3) * 100}%`, background: col, borderRadius: 2 }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Hair zone breakdown in checkins tab */}
                  {isHairPatient && parsedZoneAnalysis && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8 }}>HAIR ZONE ANALYSIS</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {(Object.entries(parsedZoneAnalysis) as [string, HairZoneData][]).map(([key, zone]) => {
                          const d = zone.density;
                          const col = d >= 3 ? 'var(--green)' : d >= 2 ? 'var(--yellow)' : d >= 1 ? '#f97316' : 'var(--red)';
                          const bg = d >= 3 ? 'rgba(16,185,129,0.06)' : d >= 2 ? 'rgba(245,158,11,0.06)' : d >= 1 ? 'rgba(249,115,22,0.06)' : 'rgba(239,68,68,0.06)';
                          return (
                            <div key={key} style={{ padding: '6px 8px', borderRadius: 7, background: bg, border: `1px solid ${zone.hotspot ? 'rgba(239,68,68,0.3)' : 'var(--border)'}` }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-2)' }}>{HAIR_ZONE_LABELS[key] ?? key}{zone.hotspot ? ' ⚠' : ''}</span>
                                <span style={{ fontSize: 9, fontWeight: 700, color: col }}>D{d}</span>
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginBottom: 2 }}>
                                <div style={{ height: '100%', width: `${(d / 3) * 100}%`, background: col, borderRadius: 2 }} />
                              </div>
                              {zone.notes && <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.3 }}>{zone.notes}</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {selectedCheckin.doctor_response ? (
                    <div style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--green)', marginBottom: 5 }}>DOCTOR RESPONSE</div>
                      <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{selectedCheckin.doctor_response}</div>
                    </div>
                  ) : (
                    <div>
                      {respondingTo === selectedCheckin.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <textarea className="input" style={{ resize: 'none', fontSize: 13, minHeight: 80 }} value={doctorResponse} onChange={e => setDoctorResponse(e.target.value)} placeholder="Write your clinical response for the patient…" />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setRespondingTo(null)}>Cancel</button>
                            <button className="btn btn-primary" style={{ fontSize: 12, flex: 1 }} onClick={sendResponse} disabled={sending}>
                              {sending ? <span className="spinner" /> : 'Send to Patient'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button className="btn btn-ghost" style={{ fontSize: 12, width: '100%' }} onClick={() => setRespondingTo(selectedCheckin.id)}>✏ Respond to Patient</button>
                      )}
                    </div>
                  )}
            </div>
          </div>
        )}

        {/* ─── Alerts ─── */}
        {tab === 'alerts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {alerts.length === 0 && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>No alerts for this patient.</div>}
            {alerts.map(a => (
              <div key={a.id} className="card" style={{ padding: 16, borderColor: a.severity === 'red' ? 'rgba(239,68,68,0.2)' : a.severity === 'yellow' ? 'rgba(245,158,11,0.2)' : 'var(--border)', background: a.resolved ? 'var(--bg-card)' : a.severity === 'red' ? 'rgba(239,68,68,0.05)' : 'rgba(245,158,11,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`status-dot ${a.severity}`} />
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{a.title}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{new Date(a.created_at).toLocaleDateString()}</span>
                    {a.resolved && <span className="tag tag-green">Resolved</span>}
                  </div>
                </div>
                {a.photo_url && (
                  <div style={{ marginBottom: 10, borderRadius: 8, overflow: 'hidden' }}>
                    <img src={a.photo_url} alt="Alert photo" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block', borderRadius: 8 }} />
                  </div>
                )}
                <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, margin: '0 0 10px' }}>{a.ai_analysis}</p>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: a.resolved ? 0 : 10 }}><strong>Suggested:</strong> {a.suggested_actions}</div>
                {!a.resolved && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => resolveAlert(a.id, 'Reviewed — no action needed')}>
                      ✓ Resolve
                    </button>
                    <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => resolveAlert(a.id, 'Flagged for follow-up')}>
                      Flag for Follow-up
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ─── Messages ─── */}
        {tab === 'messages' && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)' }}>
            <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.map(m => (
                <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: m.sender === 'doctor' ? 'flex-end' : 'flex-start' }}>
                  {m.sender !== 'doctor' && (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: m.sender === 'aisha' ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
                      {m.sender === 'aisha' ? '🩺' : '👤'}
                    </div>
                  )}
                  <div style={{ maxWidth: '72%' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3, textAlign: m.sender === 'doctor' ? 'right' : 'left' }}>
                      {m.sender === 'aisha' ? 'AI Nurse Aisha' : m.sender === 'doctor' ? 'You (Doctor)' : patient.name as string}
                    </div>
                    <div style={{
                      padding: '10px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.55,
                      background: m.sender === 'doctor' ? 'rgba(124,58,237,0.15)' : m.sender === 'aisha' ? 'rgba(255,255,255,0.05)' : 'var(--bg-elevated)',
                      color: 'var(--text-1)',
                      borderTopRightRadius: m.sender === 'doctor' ? 3 : 12,
                      borderTopLeftRadius: m.sender !== 'doctor' ? 3 : 12,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {m.content}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, textAlign: m.sender === 'doctor' ? 'right' : 'left' }}>
                      {new Date(m.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <BottomNav alertCount={openAlerts.length} />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}
