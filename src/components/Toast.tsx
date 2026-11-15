"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";

type Kind = "success" | "error" | "info";
type Item = { id: number; kind: Kind; message: string; leaving: boolean };

type Toasts = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const noop = () => {};
const ToastContext = createContext<Toasts>({ success: noop, error: noop, info: noop });

export const useToast = () => useContext(ToastContext);

const MAX_VISIBLE = 4;
const LIFETIME_MS: Record<Kind, number> = { success: 3500, info: 4500, error: 6500 };
const EXIT_MS = 220;

const ICON = { success: CircleCheck, error: CircleAlert, info: Info } as const;

function ToastItem({ item, onClose }: { item: Item; onClose: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const Icon = ICON[item.kind];

  // The timer stops while the pointer is over the toast or a button inside it has focus.
  useEffect(() => {
    if (paused || item.leaving) return;
    const t = setTimeout(() => onClose(item.id), LIFETIME_MS[item.kind]);
    return () => clearTimeout(t);
  }, [paused, item.leaving, item.id, item.kind, onClose]);

  return (
    <div
      className={`toast toast-${item.kind} ${item.leaving ? "toast-leaving" : ""}`}
      role={item.kind === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon className="toast-icon" size={20} aria-hidden="true" />
      <span className="toast-text">{item.message}</span>
      <button type="button" className="toast-close" onClick={() => onClose(item.id)} aria-label="Dismiss notification">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const nextId = useRef(1);

  const close = useCallback((id: number) => {
    setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const push = useCallback((kind: Kind, message: string) => {
    setItems((list) => {
      // The same message twice in a row would only be noise.
      if (list.some((t) => t.message === message && t.kind === kind && !t.leaving)) return list;
      const next = [...list, { id: nextId.current++, kind, message, leaving: false }];
      return next.slice(-MAX_VISIBLE);
    });
  }, []);

  const api = useMemo<Toasts>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region">
        {items.map((t) => (
          <ToastItem key={t.id} item={t} onClose={close} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
