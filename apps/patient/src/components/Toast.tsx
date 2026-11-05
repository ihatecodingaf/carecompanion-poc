import React, { useEffect } from 'react';
import { useStore } from '../store/useStore';

export default function Toast() {
  const { toast, clearToast } = useStore();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, 3000);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  if (!toast) return null;

  return (
    <div className={`toast toast-${toast.type}`}>
      {toast.message}
    </div>
  );
}
