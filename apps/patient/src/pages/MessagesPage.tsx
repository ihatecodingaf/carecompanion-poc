import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { getMessages } from '../lib/api';
import type { MessageRow } from '../lib/database.types';

export default function MessagesPage() {
  const { patient } = useStore();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patient) return;
    getMessages(patient.id)
      .then(msgs => {
        // Show doctor messages + Aisha AI analyses (not patient's own)
        const visible = msgs.filter(m => m.sender === 'doctor' || m.sender === 'aisha');
        setMessages(visible.reverse()); // newest last so it reads top-to-bottom chronologically
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patient]);

  const doctorMessages = messages.filter(m => m.sender === 'doctor');

  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28, height: 28, border: '3px solid rgba(43,191,191,0.2)', borderTopColor: '#2bbfbf', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 16px 12px', flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.3px' }}>From Your Doctor</h1>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
          {doctorMessages.length
            ? `${doctorMessages.length} message${doctorMessages.length !== 1 ? 's' : ''} from your care team`
            : 'Messages from your care team appear here'}
        </p>
      </div>

      {messages.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>No messages yet</div>
          <div style={{ color: '#64748b', fontSize: 13, lineHeight: 1.5, maxWidth: 260 }}>
            Your doctor's notes and Aisha's care updates will appear here after each check-in.
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 16px' }}>
          {messages.map(m => (
            <MessageCard key={m.id} message={m} />
          ))}
          <div style={{ height: 8 }} />
        </div>
      )}
    </div>
  );
}

function MessageCard({ message: m }: { message: MessageRow }) {
  const isDoctor = m.sender === 'doctor';
  const date = new Date(m.timestamp);
  const timeStr = date.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const accentColor = isDoctor ? '#10b981' : '#7c3aed';
  const bgColor     = isDoctor ? 'rgba(16,185,129,0.06)' : 'rgba(124,58,237,0.06)';
  const borderColor = isDoctor ? 'rgba(16,185,129,0.2)' : 'rgba(124,58,237,0.15)';
  const labelColor  = isDoctor ? '#10b981' : '#a78bfa';
  const label       = isDoctor ? '👨‍⚕️ Doctor' : '🩺 Aisha · AI Nurse';

  return (
    <div style={{
      marginBottom: 12, borderRadius: 14, padding: '12px 14px',
      background: bgColor, border: `1px solid ${borderColor}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: labelColor, letterSpacing: '0.04em' }}>{label}</span>
        <span style={{ fontSize: 10, color: '#4b5563' }}>{timeStr}</span>
      </div>

      {m.photo_url && (
        <div style={{ marginBottom: 10, borderRadius: 10, overflow: 'hidden' }}>
          <img src={m.photo_url} alt="Check-in" style={{ width: '100%', display: 'block', borderRadius: 10, objectFit: 'cover', maxHeight: 180 }} />
        </div>
      )}

      <div style={{ fontSize: 13, color: '#c4cfe0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.content}</div>

      {isDoctor && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor }} />
          <span style={{ fontSize: 10, color: '#64748b' }}>From your care team</span>
        </div>
      )}
    </div>
  );
}
