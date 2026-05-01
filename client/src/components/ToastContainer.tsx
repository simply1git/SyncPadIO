import React from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';
import { Toast, ToastType } from '../hooks/useToast';

const toastConfig: Record<ToastType, { bg: string; text: string; icon: React.ReactNode }> = {
  success: {
    bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    text: 'text-green-800 dark:text-green-300',
    icon: <CheckCircle className="w-5 h-5" />,
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    text: 'text-red-800 dark:text-red-300',
    icon: <AlertCircle className="w-5 h-5" />,
  },
  info: {
    bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    text: 'text-blue-800 dark:text-blue-300',
    icon: <Info className="w-5 h-5" />,
  },
  warning: {
    bg: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    text: 'text-yellow-800 dark:text-yellow-300',
    icon: <AlertTriangle className="w-5 h-5" />,
  },
};

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-md pointer-events-none">
      {toasts.map(toast => {
        const config = toastConfig[toast.type];
        return (
          <div
            key={toast.id}
            className={`${config.bg} ${config.text} border rounded-lg p-4 shadow-lg flex items-start gap-3 pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-300`}
          >
            <div className="flex-shrink-0 mt-0.5">{config.icon}</div>
            <p className="flex-1 text-sm font-medium">{toast.message}</p>
            <button
              onClick={() => onRemove(toast.id)}
              className="flex-shrink-0 text-inherit opacity-70 hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
