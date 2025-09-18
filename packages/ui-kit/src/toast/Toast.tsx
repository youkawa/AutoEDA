import React, { useEffect, useState } from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export function Toast({
  message,
  tone = 'info',
  onDismiss,
  autoClose = 5000,
}: {
  message: string;
  tone?: ToastTone;
  onDismiss?: () => void;
  autoClose?: number;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (autoClose > 0) {
      const t = setTimeout(() => {
        setVisible(false);
        if (onDismiss) {
          setTimeout(() => onDismiss(), 200);
        }
      }, autoClose);
      return () => clearTimeout(t);
    }
  }, [autoClose, onDismiss]);

  if (!visible) return null;

  const toneClass: Record<ToastTone, string> = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    error: 'bg-red-50 border-red-200 text-red-800',
  };

  return (
    <div
      className={`max-w-sm w-full border rounded-lg shadow-lg p-4 transition ${toneClass[tone]}`}
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}
