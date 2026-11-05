import { useEffect } from 'react';
import { useStore } from '../store/useStore';

export default function Toast() {
  const { toast, hideToast } = useStore();

  useEffect(() => {
    if (!toast.visible) return;
    const t = setTimeout(hideToast, 3000);
    return () => clearTimeout(t);
  }, [toast.visible, hideToast]);

  if (!toast.visible) return null;

  const bg =
    toast.type === 'success' ? 'bg-green-600' :
    toast.type === 'error'   ? 'bg-red-600'   : 'bg-[#1A2F47]';

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl
                  text-white text-sm font-semibold shadow-xl max-w-xs w-full mx-4 ${bg}`}
      style={{ maxWidth: '360px' }}
    >
      {toast.message}
    </div>
  );
}
