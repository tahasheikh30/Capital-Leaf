"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { SPENDING_EVENT } from "@/lib/spending";
import { money } from "@/lib/format";

type Fresh = { budget_id: string; category_name: string; level: 80 | 100; spent: number; limit: number };

const EVERY_MS = 5 * 60_000;

// Looks at the category limits when the app opens, when spending changes and now and then while it is open.
// The server remembers what it has already announced, so each warning is shown once per month.
export default function BudgetWatcher() {
  const toast = useToast();
  const busy = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    let stopped = false;

    async function check() {
      if (document.visibilityState !== "visible") return;
      if (busy.current) {
        again.current = true;
        return;
      }
      busy.current = true;
      try {
        const r = await api<{ fresh: Fresh[] }>("/category-budgets/check", { method: "POST", quiet: true });
        if (stopped) return;
        for (const f of r.fresh) {
          if (f.level === 100) toast.error(`${f.category_name} has reached its limit: ${money(f.spent)} of ${money(f.limit)} this month.`, { category: "alerts", href: "/budget" });
          else toast.info(`${f.category_name} is at 80 percent of its limit: ${money(f.spent)} of ${money(f.limit)} this month.`, { category: "alerts", href: "/budget" });
        }
      } catch {
        // A failed background check is not worth bothering anyone about.
      } finally {
        busy.current = false;
        if (again.current && !stopped) {
          again.current = false;
          setTimeout(check, 500);
        }
      }
    }

    // A short wait after a change lets a burst of edits (or a queue of offline entries) settle into one check.
    let soon: ReturnType<typeof setTimeout> | undefined;
    const onSpending = () => {
      clearTimeout(soon);
      soon = setTimeout(check, 800);
    };
    const first = setTimeout(check, 5000);
    const timer = setInterval(check, EVERY_MS);
    const onVisible = () => document.visibilityState === "visible" && check();
    window.addEventListener(SPENDING_EVENT, onSpending);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearTimeout(soon);
      clearInterval(timer);
      window.removeEventListener(SPENDING_EVENT, onSpending);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [toast]);

  return null;
}
