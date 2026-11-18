import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

const TOAST_EVENT = 'app:show-toast';

export const showToast = ({
  title = 'Success',
  message = '',
  variant = 'success',
  duration = 3500
} = {}) => {
  try {
    window.dispatchEvent(
      new CustomEvent(TOAST_EVENT, {
        detail: {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title,
          message,
          variant,
          duration
        }
      })
    );
  } catch (e) {
    console.warn('Toast dispatch failed:', e);
  }
};

const VARIANT_STYLES = {
  success: {
    container: 'bg-slate-900 border-emerald-500/60 ring-emerald-500/20 text-white',
    iconWrap: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    badge: 'bg-emerald-500/25 text-emerald-300',
    Icon: CheckCircle2
  },
  warning: {
    container: 'bg-slate-900 border-amber-500/60 ring-amber-500/20 text-white',
    iconWrap: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    badge: 'bg-amber-500/25 text-amber-300',
    Icon: AlertTriangle
  },
  danger: {
    container: 'bg-slate-900 border-rose-500/60 ring-rose-500/20 text-white',
    iconWrap: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
    badge: 'bg-rose-500/25 text-rose-300',
    Icon: XCircle
  },
  info: {
    container: 'bg-slate-900 border-blue-500/60 ring-blue-500/20 text-white',
    iconWrap: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    badge: 'bg-blue-500/25 text-blue-300',
    Icon: Info
  }
};

export const ToastContainer = () => {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleToast = (e) => {
      const detail = e.detail;
      if (!detail) return;
      setToasts((prev) => [...prev.slice(-2), detail]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== detail.id));
      }, detail.duration || 3500);
    };

    window.addEventListener(TOAST_EVENT, handleToast);
    return () => window.removeEventListener(TOAST_EVENT, handleToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-20 right-4 sm:right-6 z-[9999] flex flex-col gap-2.5 max-w-sm w-[calc(100vw-2rem)] pointer-events-none"
      aria-live="polite"
    >
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateY(-10px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      {toasts.map((toast) => {
        const style = VARIANT_STYLES[toast.variant] || VARIANT_STYLES.success;
        const Icon = style.Icon;
        return (
          <div
            key={toast.id}
            style={{ animation: 'toastSlideIn 0.22s ease-out forwards' }}
            className={`pointer-events-auto rounded-2xl border shadow-2xl ring-4 p-3.5 flex items-start gap-3 ${style.container}`}
          >
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${style.iconWrap}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${style.badge}`}>
                  {toast.title}
                </span>
              </div>
              {toast.message && (
                <p className="text-xs font-bold text-slate-100 mt-1 leading-snug">
                  {toast.message}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer shrink-0"
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
