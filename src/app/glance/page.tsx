"use client";

import { useCallback, useEffect, useState } from "react";
import { TOKEN_KEY, fetchGlance, type Glance } from "@/lib/widget";
import { money } from "@/lib/format";

// What is left to spend this month, on one calm screen. It is opened from a link with a private token
// in the address (after the #, so it is never sent to any server), and can be added to the home screen.
export default function GlancePage() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [data, setData] = useState<Glance | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("t");
    let t = fromHash;
    try {
      if (fromHash) localStorage.setItem(TOKEN_KEY, fromHash);
      else t = localStorage.getItem(TOKEN_KEY);
    } catch {
      /* storage blocked: the link itself still works */
    }
    setToken(t);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      setData(await fetchGlance(token));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void load();
    const timer = setInterval(load, 5 * 60 * 1000);
    const visible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [token, load]);

  if (token === undefined) return <main className="glance" />;
  if (!token)
    return (
      <main className="glance">
        <h1>Left to spend</h1>
        <p className="muted">Open the widget link from CoinLeaf, Settings to see your number here.</p>
      </main>
    );

  const negative = (data?.leftToSpend ?? 0) < 0;
  return (
    <main className="glance">
      <p className="glance-label">Left to spend{data ? `, ${data.month}` : ""}</p>
      <p className={`glance-amount${negative ? " neg" : ""}`} aria-live="polite">{data ? money(data.leftToSpend, data.currency) : "..."}</p>
      {data && <p className="muted">Spent {money(data.spent, data.currency)} of {money(data.income, data.currency)}</p>}
      {error && <div className="error" role="alert">{error}</div>}
      <button className="btn" onClick={load} disabled={busy}>{busy ? "Refreshing..." : "Refresh"}</button>
    </main>
  );
}
