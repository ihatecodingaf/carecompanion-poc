import { useEffect, useRef } from 'react';

interface Props {
  title:    string;
  subtitle: string;
  value:    string;
  onChange: (v: string) => void;
  onSave:   () => void;
  onClose:  () => void;
}

export default function ActionModal({ title, subtitle, value, onChange, onSave, onClose }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    taRef.current?.focus();
  }, []);

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      {/* Sheet */}
      <div
        className="w-full rounded-t-[18px] pb-6"
        style={{
          background:  'var(--bg2)',
          boxShadow:   '0 -6px 28px rgba(0,0,0,0.5)',
          animation:   'slideUp 0.22s ease',
          maxWidth:    430,
          margin:      '0 auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-8 h-[3px] rounded-full mx-auto mt-2 mb-0" style={{ background: 'var(--b)' }} />

        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{ borderBottom: '1px solid var(--b)' }}
        >
          <span className="text-[0.78rem] font-bold" style={{ color: 'var(--t)' }}>{title}</span>
          <button
            onClick={onClose}
            className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[0.6rem]"
            style={{ background: 'var(--bg4)', border: '1px solid var(--b)', color: 'var(--t2)', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-4 pt-3">
          {subtitle && (
            <p className="text-[0.57rem] mb-2" style={{ color: 'var(--t3)' }}>{subtitle}</p>
          )}
          <textarea
            ref={taRef}
            className="fi w-full"
            style={{ minHeight: 88, fontSize: '0.7rem', resize: 'none' }}
            placeholder="Enter updates…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-[0.68rem] font-semibold"
              style={{ background: 'var(--bg4)', border: '1px solid var(--b)', color: 'var(--t2)', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              className="flex-1 py-2.5 rounded-xl text-[0.68rem] font-bold"
              style={{ background: 'var(--teal)', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              💾 Save &amp; Update
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0);    }
        }
        .fi {
          background: var(--bg4);
          border: 1.5px solid var(--b);
          border-radius: 8px;
          padding: 7px 10px;
          color: var(--t);
          font-size: 0.74rem;
          outline: none;
          font-family: inherit;
          width: 100%;
          transition: border-color 0.15s;
        }
        .fi:focus { border-color: var(--teal); }
      `}</style>
    </div>
  );
}
