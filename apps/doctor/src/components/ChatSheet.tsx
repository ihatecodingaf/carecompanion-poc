import { useState, useRef } from 'react';
import { sendDoctorMessage } from '../lib/api';
import { useStore } from '../store/useStore';

interface Props {
  patientId:   string;
  orgSlug:     string;
  patientName: string;
  patientSub:  string;          // e.g. "Acne Vulgaris · CO2 Laser"
  avatarText:  string;          // initials
  avatarColor: string;          // CSS gradient
  onClose:     () => void;
}

const AI_SUGGESTIONS = [
  { icon: '📅', text: 'Book appointment in 3 days for follow-up' },
  { icon: '✅', text: 'No issues — continue current medication' },
  { icon: '⚠️', text: 'Mild concern — please visit clinic soon' },
  { icon: '🚨', text: 'Please visit clinic immediately — urgent review' },
  { icon: '📸', text: 'Send photos of treated area today' },
  { icon: '🌟', text: 'Healing on track — keep up the routine!' },
  { icon: '📋', text: 'Session 2 scheduled — 2 weeks from today' },
];

export default function ChatSheet({
  patientId, orgSlug, patientName, patientSub, avatarText, avatarColor, onClose,
}: Props) {
  const doctor           = useStore((s) => s.doctor);
  const showToast        = useStore((s) => s.showToast);
  const [msg, setMsg]    = useState('');
  const [sent, setSent]  = useState<Set<number>>(new Set());
  const inputRef         = useRef<HTMLInputElement>(null);

  async function sendQuick(idx: number, text: string) {
    try {
      await sendDoctorMessage(patientId, orgSlug, text, doctor?.id ?? 'dr-demo');
      setSent((p) => new Set(p).add(idx));
      showToast('Message sent to patient', 'success');
    } catch {
      showToast('Failed to send message', 'error');
    }
  }

  async function sendCustom() {
    if (!msg.trim()) return;
    try {
      await sendDoctorMessage(patientId, orgSlug, msg.trim(), doctor?.id ?? 'dr-demo');
      showToast('Message sent', 'success');
      setMsg('');
    } catch {
      showToast('Failed to send', 'error');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className="w-full flex flex-col overflow-hidden"
        style={{
          background:  'var(--bg2)',
          borderRadius: '18px 18px 0 0',
          maxHeight:   '90%',
          boxShadow:   '0 -6px 28px rgba(0,0,0,0.5)',
          animation:   'slideUp 0.22s ease',
          maxWidth:    430,
          margin:      '0 auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-8 h-[3px] rounded-full mx-auto mt-2 flex-shrink-0" style={{ background: 'var(--b)' }} />

        {/* Patient header */}
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--b)' }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[0.56rem] font-bold text-white flex-shrink-0"
            style={{ background: avatarColor }}
          >
            {avatarText}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[0.74rem] font-bold truncate" style={{ color: 'var(--t)' }}>{patientName}</div>
            <div className="text-[0.54rem] truncate" style={{ color: 'var(--t3)' }}>{patientSub}</div>
          </div>
          <button
            onClick={onClose}
            className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[0.6rem] flex-shrink-0"
            style={{ background: 'var(--bg4)', border: '1px solid var(--b)', color: 'var(--t2)', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        {/* Quick action grid */}
        <div
          className="grid grid-cols-3 gap-1.5 px-3 py-2.5 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--b)' }}
        >
          {[
            { icon: '📞', label: 'Voice Call',    onClick: () => alert('Calling…') },
            { icon: '🎥', label: 'Video Call',    onClick: () => alert('Video…') },
            { icon: '📅', label: 'Book Appt',     onClick: () => alert('Booking…') },
            { icon: '📋', label: 'Send Rx',       onClick: () => alert('Sending Rx…') },
            { icon: '📊', label: 'Share Report',  onClick: () => alert('Sharing…') },
            { icon: '🎙️', label: 'Voice Note',    onClick: () => alert('Recording…') },
          ].map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className="flex flex-col items-center gap-1.5 rounded-lg py-2 transition-colors"
              style={{
                background: 'var(--bg3)',
                border:     '1px solid var(--b)',
                color:      'var(--t2)',
                cursor:     'pointer',
                fontSize:   '0.56rem',
                fontWeight: 600,
              }}
            >
              <span className="text-[0.95rem]">{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>

        {/* AI suggested messages */}
        <div className="overflow-y-auto no-scroll flex-1 px-3 py-2.5" style={{ borderBottom: '1px solid var(--b)' }}>
          <div
            className="text-[0.5rem] font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5"
            style={{ color: 'var(--teal)' }}
          >
            🤖 AI Quick Messages
          </div>
          {AI_SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => !sent.has(i) && sendQuick(i, s.text)}
              className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 mb-1.5 text-left
                         transition-colors"
              style={{
                background: sent.has(i) ? 'rgba(43,191,191,0.07)' : 'var(--bg3)',
                border:     `1px solid ${sent.has(i) ? 'var(--teal)' : 'var(--b)'}`,
                color:      'var(--t)',
                cursor:     sent.has(i) ? 'default' : 'pointer',
                fontSize:   '0.64rem',
              }}
            >
              <span>{s.icon}</span>
              <span className="flex-1">{s.text}</span>
              {sent.has(i) && (
                <span style={{ color: 'var(--teal)', fontSize: '0.52rem' }}>✓</span>
              )}
            </button>
          ))}
        </div>

        {/* Custom message input */}
        <div className="flex gap-2 px-3 py-2.5 flex-shrink-0">
          <input
            ref={inputRef}
            className="flex-1 rounded-full px-3 py-1.5 text-[0.7rem] outline-none"
            style={{
              background:  'var(--bg3)',
              border:      '1.5px solid var(--b)',
              color:       'var(--t)',
              fontFamily:  'inherit',
            }}
            placeholder="Type a message…"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendCustom()}
          />
          <button
            onClick={sendCustom}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[0.72rem] flex-shrink-0"
            style={{ background: 'var(--teal)', border: 'none', color: '#fff', cursor: 'pointer' }}
          >
            ↗
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0);    }
        }
      `}</style>
    </div>
  );
}
