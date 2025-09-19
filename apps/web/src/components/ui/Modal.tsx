import React from 'react';

export function Modal({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: React.ReactNode; title?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 max-h-[80vh] w-[min(680px,92vw)] overflow-auto rounded-2xl bg-white p-6 shadow-xl">
        {title ? <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}

