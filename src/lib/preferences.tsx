"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type Theme = "light" | "dark";
export type Density = "comfortable" | "compact";
export type NoteCategory = "alerts" | "activity" | "household";

export type Prefs = {
  theme: Theme;
  density: Density;
  animations: boolean;
  notifications: { enabled: boolean; popups: boolean; categories: Record<NoteCategory, boolean> };
  emailNewAlerts: boolean;
};

const STORE = "cl-prefs";
const YEAR = 60 * 60 * 24 * 365;

const DEFAULTS: Prefs = {
  theme: "light",
  density: "comfortable",
  animations: true,
  notifications: { enabled: true, popups: true, categories: { alerts: true, activity: true, household: true } },
  emailNewAlerts: true,
};

type Ctx = { prefs: Prefs; update: (change: (draft: Prefs) => void) => void };
const PrefsContext = createContext<Ctx>({ prefs: DEFAULTS, update: () => {} });
export const usePreferences = () => useContext(PrefsContext);

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; SameSite=Lax`;
}

function clone(p: Prefs): Prefs {
  return { ...p, notifications: { ...p.notifications, categories: { ...p.notifications.categories } } };
}

// Theme and density live in cookies so the server can put them on the page before it is drawn (no flash).
// Everything else is kept in this browser.
export function PreferencesProvider({ initialTheme, initialDensity, children }: { initialTheme: Theme | null; initialDensity: Density; children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>({ ...clone(DEFAULTS), theme: initialTheme ?? "light", density: initialDensity });
  const loaded = useRef(false);

  useEffect(() => {
    let saved: Partial<Prefs> = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    } catch {
      // Unreadable storage is fine: the defaults apply.
    }
    setPrefs((p) => {
      const next = clone(p);
      if (typeof saved.animations === "boolean") next.animations = saved.animations;
      if (typeof saved.emailNewAlerts === "boolean") next.emailNewAlerts = saved.emailNewAlerts;
      const n = saved.notifications;
      if (n) {
        if (typeof n.enabled === "boolean") next.notifications.enabled = n.enabled;
        if (typeof n.popups === "boolean") next.notifications.popups = n.popups;
        for (const k of Object.keys(next.notifications.categories) as NoteCategory[]) {
          if (typeof n.categories?.[k] === "boolean") next.notifications.categories[k] = n.categories[k];
        }
      }
      // First visit: follow the device until the person chooses.
      if (!initialTheme && window.matchMedia?.("(prefers-color-scheme: dark)").matches) next.theme = "dark";
      return next;
    });
    loaded.current = true;
  }, [initialTheme]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.dataset.density = prefs.density;
    root.dataset.motion = prefs.animations ? "on" : "off";
  }, [prefs.theme, prefs.density, prefs.animations]);

  const update = useCallback((change: (draft: Prefs) => void) => {
    setPrefs((p) => {
      const next = clone(p);
      change(next);
      try {
        setCookie("cl-theme", next.theme);
        setCookie("cl-density", next.density);
        localStorage.setItem(STORE, JSON.stringify({ animations: next.animations, emailNewAlerts: next.emailNewAlerts, notifications: next.notifications }));
      } catch {
        // Storage can be blocked. The choice still applies for this visit.
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ prefs, update }), [prefs, update]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}
