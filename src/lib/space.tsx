"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setApiSpace } from "@/lib/api";
import type { Household } from "@/lib/types";

type SpaceState = {
  space: string; // "personal" or a household id
  household: Household | null;
  loaded: boolean;
  isHousehold: boolean;
  setSpace: (space: string) => void;
  reload: () => Promise<void>;
  refreshKey: number;
  refresh: () => void; // re-open the current page so it shows fresh data
};

const Ctx = createContext<SpaceState>({ space: "personal", household: null, loaded: false, isHousehold: false, setSpace: () => {}, reload: async () => {}, refreshKey: 0, refresh: () => {} });
export const useSpace = () => useContext(Ctx);

const KEY = "cl-space";

// Remembers which space the person was in (personal or their household) and tells the API layer.
export function SpaceProvider({ children }: { children: React.ReactNode }) {
  const [space, setSpaceState] = useState("personal");
  const [household, setHousehold] = useState<Household | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const reload = useCallback(async () => {
    try {
      const r = await api<{ household: Household | null }>("/households/me");
      setHousehold(r.household);
      // If they left or were removed, fall back to personal.
      setSpaceState((cur) => {
        const next = cur !== "personal" && r.household?.id !== cur ? "personal" : cur;
        setApiSpace(next);
        return next;
      });
    } catch {
      // Keep working in the personal space if the household cannot be loaded.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved && /^[0-9a-f-]{36}$/.test(saved)) {
        setApiSpace(saved);
        setSpaceState(saved);
      }
    } catch {}
    reload();
  }, [reload]);

  const setSpace = useCallback((next: string) => {
    setApiSpace(next);
    setSpaceState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  }, []);

  const value = useMemo(() => ({ space, household, loaded, isHousehold: space !== "personal", setSpace, reload, refreshKey, refresh }), [space, household, loaded, setSpace, reload, refreshKey, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Pages inside start fresh whenever the space changes, so nothing from the other space lingers.
export function SpaceBoundary({ children }: { children: React.ReactNode }) {
  const { space, loaded, refreshKey } = useSpace();
  if (!loaded) return null;
  return <Fragment key={`${space}:${refreshKey}`}>{children}</Fragment>;
}
