import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { extractPrescription } from '../lib/api';

// Convert a File to base64 data-URI string
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface UploadedPage {
  file:      File;
  preview:   string;   // object URL for thumbnail
  base64:    string;   // base64 data-URI for API
}

type OcrPhase = 'idle' | 'extracting' | 'parsing' | 'done' | 'error';

const PHASE_LABELS: Record<OcrPhase, string> = {
  idle:       '',
  extracting: 'Extracting text with OCR…',
  parsing:    'AI parsing prescription fields…',
  done:       '✓ Extraction complete',
  error:      '⚠ Extraction failed — you can still fill the form manually',
};

export default function UploadPage() {
  const navigate         = useNavigate();
  const setOcrResult     = useStore((s) => s.setOcrResult);

  const cameraRef        = useRef<HTMLInputElement>(null);
  const galleryRef       = useRef<HTMLInputElement>(null);

  const [pages, setPages]       = useState<UploadedPage[]>([]);
  const [phase, setPhase]       = useState<OcrPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [errMsg, setErrMsg]     = useState('');

  // ── File picker handlers ─────────────────────────────────────────────────
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const newPages: UploadedPage[] = [];
    for (const file of Array.from(files)) {
      const base64  = await fileToBase64(file);
      const preview = URL.createObjectURL(file);
      newPages.push({ file, preview, base64 });
    }

    setPages((prev) => [...prev, ...newPages]);
    setPhase('idle');
    setErrMsg('');
  }

  function removePage(idx: number) {
    setPages((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  // ── OCR + AI extraction ───────────────────────────────────────────────────
  async function runExtraction() {
    if (pages.length === 0) return;

    try {
      setErrMsg('');
      setPhase('extracting');
      setProgress(30);

      // Small delay so the user sees the progress animation
      await sleep(400);
      setProgress(55);
      setPhase('parsing');
      await sleep(300);
      setProgress(80);

      const result = await extractPrescription(pages.map((p) => p.base64));

      setProgress(100);
      setPhase('done');
      setOcrResult(result);

      await sleep(500);
      navigate('/add-patient/form');
    } catch (err) {
      console.error(err);
      setPhase('error');
      setErrMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  // Skip OCR — go straight to the empty form
  function skipToForm() {
    setOcrResult(null);
    navigate('/add-patient/form');
  }

  const canExtract = pages.length > 0 && phase !== 'extracting' && phase !== 'parsing';

  return (
    <div
      className="flex flex-col"
      style={{ minHeight: '100dvh', background: 'var(--bg)' }}
    >
      {/* ── Back bar ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-3.5"
        style={{ height: 44, background: 'var(--bg2)', borderBottom: '1px solid var(--b)' }}
      >
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-[0.72rem] font-semibold"
          style={{ color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ‹ Back
        </button>
        <span className="text-[0.8rem] font-bold" style={{ color: 'var(--t)' }}>
          Upload Prescription
        </span>
        {/* OCR badge */}
        <div
          className="flex items-center gap-1 rounded-full px-2 py-0.5"
          style={{
            background: 'rgba(43,191,191,0.12)',
            border: '1px solid rgba(43,191,191,0.3)',
          }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: 'var(--teal)' }}
          />
          <span className="text-[0.52rem] font-bold" style={{ color: 'var(--teal)' }}>OCR</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-3 px-3.5 pt-3.5 pb-4 min-h-0">

        {/* ── Step indicator ── */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <StepDot n={1} active />
          <div className="w-7 h-0.5" style={{ background: 'var(--b)' }} />
          <StepDot n={2} />
          <div className="w-7 h-0.5" style={{ background: 'var(--b)' }} />
          <StepDot n={3} />
          <span className="text-[0.62rem] font-medium ml-1" style={{ color: 'var(--t2)' }}>
            Upload Prescription · AI extracts all fields
          </span>
        </div>

        {/* ── Upload zone ── */}
        <button
          onClick={() => cameraRef.current?.click()}
          className="flex-1 flex flex-col items-center justify-center rounded-2xl
                     transition-transform active:scale-[0.98] cursor-pointer min-h-[180px]"
          style={{
            background:   'var(--bg4)',
            border:       `2px dashed ${pages.length ? 'rgba(43,191,191,0.45)' : 'var(--b)'}`,
            borderRadius: 16,
          }}
        >
          <div
            className="w-[68px] h-[68px] rounded-[18px] flex items-center justify-center text-[2rem] mb-3"
            style={{
              background: 'rgba(43,191,191,0.1)',
              border: '2px solid rgba(43,191,191,0.3)',
            }}
          >
            📷
          </div>
          <div className="text-[0.86rem] font-bold mb-1" style={{ color: 'var(--t)' }}>
            Photograph Prescription
          </div>
          <div
            className="text-[0.6rem] text-center leading-relaxed px-10 mb-3"
            style={{ color: 'var(--t2)' }}
          >
            Point camera at prescription or upload saved files · Multiple pages supported
          </div>
          <div className="flex gap-1.5 flex-wrap justify-center">
            {['JPG', 'PNG', 'PDF', 'Max 10MB'].map((tag) => (
              <span
                key={tag}
                className="text-[0.56rem] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--bg3)', border: '1px solid var(--b)', color: 'var(--t3)' }}
              >
                {tag}
              </span>
            ))}
          </div>
        </button>

        {/* ── Gallery vs camera pickers ── */}
        <div className="flex gap-2.5 flex-shrink-0">
          <button
            onClick={() => cameraRef.current?.click()}
            className="flex-1 flex items-center gap-2 rounded-xl px-3.5 py-3 text-[0.7rem]
                       font-semibold transition-transform active:scale-[0.97]"
            style={{ background: 'var(--bg4)', border: '1.5px solid var(--b)', color: 'var(--t2)', cursor: 'pointer' }}
          >
            <span className="text-xl">📷</span> Camera
          </button>
          <button
            onClick={() => galleryRef.current?.click()}
            className="flex-1 flex items-center gap-2 rounded-xl px-3.5 py-3 text-[0.7rem]
                       font-semibold transition-transform active:scale-[0.97]"
            style={{ background: 'var(--bg4)', border: '1.5px solid var(--b)', color: 'var(--t2)', cursor: 'pointer' }}
          >
            <span className="text-xl">🖼</span> Gallery
          </button>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {/* ── Uploaded pages thumbnails ── */}
        {pages.length > 0 && (
          <div className="flex gap-2 flex-shrink-0 flex-wrap">
            {pages.map((p, i) => (
              <div key={i} className="relative">
                <div
                  className="w-[64px] h-[64px] rounded-xl overflow-hidden flex-shrink-0"
                  style={{ border: '2px solid var(--teal)' }}
                >
                  <img
                    src={p.preview}
                    alt={`Page ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  onClick={() => removePage(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center
                             justify-center text-[0.5rem] font-bold text-white"
                  style={{ background: 'var(--red)', border: '1.5px solid var(--bg)', cursor: 'pointer' }}
                >
                  ×
                </button>
                <div
                  className="text-center text-[0.46rem] font-bold mt-0.5"
                  style={{ color: 'var(--teal)' }}
                >
                  Page {i + 1}
                </div>
              </div>
            ))}

            {/* Add more */}
            <button
              onClick={() => galleryRef.current?.click()}
              className="w-[64px] h-[64px] rounded-xl flex flex-col items-center justify-center
                         text-[0.7rem] gap-0.5"
              style={{
                border: '1.5px dashed var(--b)',
                background: 'var(--bg4)',
                color: 'var(--t3)',
                cursor: 'pointer',
              }}
            >
              <span className="text-[1.1rem]">+</span>
              <span className="text-[0.44rem]">Add page</span>
            </button>
          </div>
        )}

        {/* ── Progress bar + phase label ── */}
        {(phase === 'extracting' || phase === 'parsing' || phase === 'done') && (
          <div
            className="flex-shrink-0 rounded-xl px-3.5 py-3"
            style={{
              background: 'rgba(43,191,191,0.07)',
              border: '1px solid rgba(43,191,191,0.22)',
            }}
          >
            <div className="text-[0.68rem] font-semibold mb-2" style={{ color: 'var(--teal)' }}>
              {PHASE_LABELS[phase]}
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: 'var(--bg4)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: 'var(--teal)' }}
              />
            </div>
          </div>
        )}

        {/* ── Error state ── */}
        {phase === 'error' && (
          <div
            className="flex-shrink-0 rounded-xl px-3.5 py-3"
            style={{ background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.3)' }}
          >
            <div className="text-[0.66rem] font-semibold mb-0.5" style={{ color: '#f87171' }}>
              {PHASE_LABELS.error}
            </div>
            {errMsg && (
              <div className="text-[0.56rem]" style={{ color: 'var(--t3)' }}>{errMsg}</div>
            )}
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex gap-2.5 flex-shrink-0">
          <button
            onClick={skipToForm}
            className="px-4 py-3 rounded-xl text-[0.7rem] font-semibold"
            style={{ background: 'var(--bg3)', border: '1px solid var(--b)', color: 'var(--t2)', cursor: 'pointer' }}
          >
            Skip OCR
          </button>
          <button
            onClick={runExtraction}
            disabled={!canExtract}
            className="flex-1 py-3 rounded-xl text-[0.76rem] font-bold transition-opacity"
            style={{
              background: canExtract ? 'var(--teal)' : 'var(--bg4)',
              color:      canExtract ? '#fff' : 'var(--t3)',
              border:     'none',
              cursor:     canExtract ? 'pointer' : 'not-allowed',
              boxShadow:  canExtract ? '0 2px 10px rgba(43,191,191,0.3)' : 'none',
            }}
          >
            {phase === 'extracting' || phase === 'parsing'
              ? '⏳ Extracting…'
              : pages.length === 0
                ? '📷 Upload pages above'
                : `✨ Extract with AI (${pages.length} page${pages.length > 1 ? 's' : ''})`}
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StepDot({ n, active }: { n: number; active?: boolean }) {
  return (
    <div
      className="w-5 h-5 rounded-full flex items-center justify-center text-[0.55rem] font-bold flex-shrink-0"
      style={{
        background: active ? 'var(--teal)' : 'var(--bg4)',
        border:     active ? 'none' : '1px solid var(--b)',
        color:      active ? '#fff' : 'var(--t3)',
      }}
    >
      {n}
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
