import { useState, useCallback, useRef } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const add = useCallback((message: string, type: ToastType = 'info', duration = 3000) => {
    const id = `toast-${toastIdRef.current++}`;
    const toast: Toast = { id, message, type, duration };

    setToasts(prev => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const success = useCallback((message: string) => add(message, 'success', 3000), [add]);
  const error = useCallback((message: string) => add(message, 'error', 4000), [add]);
  const info = useCallback((message: string) => add(message, 'info', 3000), [add]);
  const warning = useCallback((message: string) => add(message, 'warning', 3000), [add]);

  return {
    toasts,
    add,
    remove,
    success,
    error,
    info,
    warning,
  };
}
