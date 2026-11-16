"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import type { PriceAlert } from "@/lib/types";

const EVERY_MS = 90_000;

// While the app is open, looks at price alerts now and then and tells the person when one is reached.
// (Email alerts are sent by the scheduled job on the server, so they work with the app closed too.)
export default function AlertsWatcher() {
  const toast = useToast();
  const busy = useRef(false);

  useEffect(() => {
    let stopped = false;

    async function check() {
      if (busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try {
        const r = await api<{ fired: PriceAlert[]; unseen: PriceAlert[] }>("/alerts/check", { method: "POST", quiet: true });
        if (stopped || r.unseen.length === 0) return;
        for (const a of r.unseen.slice(0, 3)) {
          toast.info(`${a.symbol} is ${a.direction === "above" ? "above" : "below"} your target of ${a.target}${a.triggered_price != null ? ` (now ${a.triggered_price})` : ""}`);
        }
        if (r.unseen.length > 3) toast.info(`${r.unseen.length - 3} more price alerts reached. See Stocks.`);
        await api("/alerts/seen-all", { method: "POST", quiet: true });
      } catch {
        // A failed background check is not worth bothering anyone about.
      } finally {
        busy.current = false;
      }
    }

    const first = setTimeout(check, 4000);
    const timer = setInterval(check, EVERY_MS);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [toast]);

  return null;
}
