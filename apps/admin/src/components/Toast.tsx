import { useEffect } from 'react';
import { useStore } from '../store/useStore';

export default function Toast() {
  const { toast, hideToast } = useStore();

  useEffect(() => {
    if (!toast.visible) return;
    const t = setTimeout(hideToast, 3500);
    return () => clearTimeout(t);
  }, [toast.visible, hideToast]);

  if (!toast.visible) return null;

  const bg =
    toast.type === 'success' ? 'bg-emerald-600' :
    toast.type === 'error'   ? 'bg-red-600'     : 'bg-slate-700';

  return (
    <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-lg text-white text-sm
                     font-medium shadow-xl ${bg} max-w-sm`}>
      {toast.message}
    </div>
  );
}
