import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import type { CheckinRow } from '../lib/database.types';

function StatusChip({ status }: { status: 'green' | 'yellow' | 'red' }) {
  const map = { green: '#10b981', yellow: '#f59e0b', red: '#ef4444' };
  return <span className={`status-dot ${status}`} style={{ background: map[status] }} />;
}

export default function HistoryPage() {
  const { checkins, patient } = useStore();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!checkins.length) {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>No check-ins yet</div>
        <div style={{ color: '#64748b', fontSize: 13, lineHeight: 1.5 }}>Complete your first daily check-in and your history will appear here.</div>
      </div>
    );
  }

  return (
    <div className="page fade-in">
      <div style={{ padding: '20px 16px 12px' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.3px' }}>History</h1>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>{checkins.length} check-in{checkins.length !== 1 ? 's' : ''} · {patient?.treatment_name}</p>
      </div>

      {/* Adherence bar */}
      {patient && (
        <div style={{ margin: '0 16px 16px' }} className="card">
          <div style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Overall Adherence</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>{Math.round(patient.adherence_percent)}%</span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
              <div style={{ height: '100%', width: `${patient.adherence_percent}%`, background: 'linear-gradient(90deg, #10b981, #34d399)', borderRadius: 3, transition: 'width 0.8s ease' }} />
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div style={{ padding: '0 16px' }}>
        {checkins.map((c) => (
          <CheckinCard
            key={c.id}
            checkin={c}
            isExpanded={expanded === c.id}
            onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
          />
        ))}
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}

function CheckinCard({ checkin: c, isExpanded, onToggle }: { checkin: CheckinRow; isExpanded: boolean; onToggle: () => void }) {
  const date = new Date(c.checkin_date);

  return (
    <div className="card fade-in" style={{ marginBottom: 10, overflow: 'hidden' }}>
      {/* Header row */}
      <button
        onClick={onToggle}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 14px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}
      >
        {/* Thumbnail */}
        {c.photo_url ? (
          <img src={c.photo_url} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: 10, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 20 }}>📷</span>
          </div>
        )}

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Day {c.day_number}</span>
            <StatusChip status={c.status as 'green' | 'yellow' | 'red'} />
          </div>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
            {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            {c.adherence_today !== undefined && (
              <span style={{ marginLeft: 8, color: c.adherence_today ? '#10b981' : '#ef4444' }}>
                {c.adherence_today ? '✓ Applied' : '✗ Missed'}
              </span>
            )}
          </div>
          {c.ai_headline && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, lineHeight: 1.3 }}>{c.ai_headline}</div>}
        </div>

        <svg
          viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth={2} width="16" height="16"
          style={{ flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '14px 14px' }}>
          {c.photo_url && (
            <div style={{ marginBottom: 12, borderRadius: 10, overflow: 'hidden' }}>
              <img src={c.photo_url} alt={`Day ${c.day_number} photo`} style={{ width: '100%', display: 'block', borderRadius: 10, objectFit: 'cover' }} />
            </div>
          )}

          {c.ai_summary && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 5, letterSpacing: 0.8 }}>AI ASSESSMENT</div>
              <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>{c.ai_summary}</div>
            </div>
          )}

          {c.symptoms_reported && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 5, letterSpacing: 0.8 }}>SYMPTOMS REPORTED</div>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>{c.symptoms_reported}</div>
            </div>
          )}

          {c.ai_suggested_actions && (
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed', marginBottom: 5 }}>RECOMMENDATION</div>
              <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>{c.ai_suggested_actions}</div>
            </div>
          )}

          {c.doctor_response && (
            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#10b981', marginBottom: 5 }}>DOCTOR RESPONSE</div>
              <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>{c.doctor_response}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
