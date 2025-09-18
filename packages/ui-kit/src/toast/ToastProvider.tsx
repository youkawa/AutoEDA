import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Toast, type ToastTone } from './Toast';

type ToastItem = { id: string; message: string; tone: ToastTone; autoClose?: number };

const ToastCtx = createContext<(message: string, tone?: ToastTone, autoClose?: number) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, tone: ToastTone = 'info', autoClose = 5000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setItems((prev) => [...prev, { id, message, tone, autoClose }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {items.map((t) => (
          <Toast
            key={t.id}
            message={t.message}
            tone={t.tone}
            autoClose={t.autoClose}
            onDismiss={() => dismiss(t.id)}
          />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

