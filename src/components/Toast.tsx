"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { usePreferences, type NoteCategory } from "@/lib/preferences";

type Kind = "success" | "error" | "info";
type Item = { id: number; kind: Kind; message: string; leaving: boolean };

type Opts = { category?: NoteCategory; href?: string };
type Toasts = {
  success: (message: string, opts?: Opts) => void;
  error: (message: string, opts?: Opts) => void;
  info: (message: string, opts?: Opts) => void;
};

// One entry in the notification list.
export type Note = { id: number; kind: Kind; message: string; at: number; read: boolean; category: NoteCategory; href?: string };
type NoteApi = { notes: Note[]; unread: number; markAllRead: () => void; clearAll: () => void };

const noop = () => {};
const ToastContext = createContext<Toasts>({ success: noop, error: noop, info: noop });
const NotesContext = createContext<NoteApi>({ notes: [], unread: 0, markAllRead: noop, clearAll: noop });

export const useToast = () => useContext(ToastContext);
export const useNotifications = () => useContext(NotesContext);

const KEEP = 50;
const NOTE_STORE = "cl-notes";

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
  const { prefs } = usePreferences();
  const prefsRef = useRef(prefs.notifications);
  prefsRef.current = prefs.notifications;
  const [notes, setNotes] = useState<Note[]>([]);

  // The list is kept for this browser tab only, so a reload keeps it and signing out in another tab does not matter.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(NOTE_STORE) ?? "[]") as Note[];
      if (Array.isArray(saved)) {
        setNotes(saved.slice(0, KEEP));
        nextId.current = Math.max(1, ...saved.map((n) => n.id + 1));
      }
    } catch {
      // Nothing saved or storage blocked.
    }
  }, []);

  const remember = useCallback((list: Note[]) => {
    try {
      sessionStorage.setItem(NOTE_STORE, JSON.stringify(list));
    } catch {
      // Not worth interrupting anyone for.
    }
  }, []);

  const close = useCallback((id: number) => {
    setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const push = useCallback((kind: Kind, message: string, opts: Opts = {}) => {
    const n = prefsRef.current;
    const category = opts.category ?? "activity";
    // Errors always get through. Everything else follows what the person chose.
    if (kind !== "error" && (!n.enabled || n.categories[category] === false)) return;
    const id = nextId.current++;
    setNotes((list) => {
      const next = [{ id, kind, message, at: Date.now(), read: false, category, href: opts.href }, ...list].slice(0, KEEP);
      remember(next);
      return next;
    });
    if (kind !== "error" && !n.popups) return;
    setItems((list) => {
      // The same message twice in a row would only be noise.
      if (list.some((t) => t.message === message && t.kind === kind && !t.leaving)) return list;
      const next = [...list, { id, kind, message, leaving: false }];
      return next.slice(-MAX_VISIBLE);
    });
  }, [remember]);

  const markAllRead = useCallback(() => {
    setNotes((list) => {
      if (list.every((n) => n.read)) return list;
      const next = list.map((n) => ({ ...n, read: true }));
      remember(next);
      return next;
    });
  }, [remember]);

  const clearAll = useCallback(() => {
    setNotes([]);
    remember([]);
  }, [remember]);

  const api = useMemo<Toasts>(
    () => ({
      success: (m, o) => push("success", m, o),
      error: (m, o) => push("error", m, o),
      info: (m, o) => push("info", m, o),
    }),
    [push]
  );

  const noteApi = useMemo<NoteApi>(() => ({ notes, unread: notes.filter((n) => !n.read).length, markAllRead, clearAll }), [notes, markAllRead, clearAll]);

  return (
    <ToastContext.Provider value={api}>
      <NotesContext.Provider value={noteApi}>
      {children}
      <div className="toast-region">
        {items.map((t) => (
          <ToastItem key={t.id} item={t} onClose={close} />
        ))}
      </div>
      </NotesContext.Provider>
    </ToastContext.Provider>
  );
}
