"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface ToastContextValue {
  show: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

/**
 * States the consequence, not just the fact — "C2 · L13 saved · 29 present,
 * 5 absent. Cohort attendance is now 82%." (03-screens.md). Callers own the
 * exact wording; this just renders and times it out.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((msg: string) => {
    setMessage(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message && (
        <div
          className={cn(
            "pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-4 pt-4",
            "animate-[pop_0.2s_ease]"
          )}
        >
          <div className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-[10px] border border-accent-300 bg-card py-3 pr-3 pl-3.5 shadow-dropdown border-l-[3px] border-l-accent">
            <CheckCircle size={16} weight="fill" className="flex-none text-accent" />
            <span className="text-[13px] font-medium text-ink">{message}</span>
            <button
              type="button"
              onClick={() => setMessage(null)}
              className="ml-1 flex-none text-ink-muted"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
