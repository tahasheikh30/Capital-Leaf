"use client";

import Sheet from "@/components/Sheet";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { api, peek } from "@/lib/api";
import type { Features, PriceAlert } from "@/lib/types";

export default function AlertsPanel() {
  const toast = useToast();
  const [alerts, setAlerts] = useState<PriceAlert[] | null>(() => peek<PriceAlert[]>("/alerts") ?? null);
  const [features, setFeatures] = useState<Features | null>(null);
  const [error, setError] = useState("");
  const [symbol, setSymbol] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [target, setTarget] = useState("");
  const [email, setEmail] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setAlerts(await api<PriceAlert[]>("/alerts"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
    api<Features>("/features").then(setFeatures).catch(() => {});
  }, [load]);

  function closeForm() {
    setFormOpen(false);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/alerts", { method: "POST", body: { symbol, direction, target: Number(target), notify_email: email } });
      toast.success("Alert set");
      setFormOpen(false);
      setSymbol("");
      setTarget("");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function act(path: string, method: "POST" | "DELETE", ok: string) {
    try {
      await api(path, { method });
      toast.success(ok);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const active = (alerts ?? []).filter((a) => a.active);
  const done = (alerts ?? []).filter((a) => !a.active);

  return (
    <>
      <div className="page-head">
        <h2 className="panel-title">Price alerts</h2>
        <button className="btn btn-accent" onClick={() => { closeForm(); setFormOpen(true); }}>
          <Plus size={16} aria-hidden="true" /> Add
        </button>
      </div>

      <Sheet open={formOpen} onClose={closeForm} title="New alert">
<form className="sheet-form" onSubmit={add}>
        {error && <div className="error">{error}</div>}
        <div className="row">
          <div className="field">
            <label>PSX symbol</label>
            <input required value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. HUBC" />
          </div>
          <div className="field">
            <label>Tell me when the price is</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value as "above" | "below")}>
              <option value="above">At or above</option>
              <option value="below">At or below</option>
            </select>
          </div>
          <div className="field">
            <label>Target price</label>
            <input type="number" required min="0.01" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <button className="btn btn-primary">Set alert</button>
        </div>
        <label className="check mt-14">
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
          <span>Also email me{features && !features.email ? " (email is not set up on this server yet, so you will only be told in the app)" : ""}</span>
        </label>
        <p className="muted fs-sm mt-14">Each alert fires once, then waits until you re-arm it. Prices are checked while the app is open, and by the server every few minutes for emails.</p>
      </form>
</Sheet>

      <div className="card table-wrap mb-16">
        <h2>Watching</h2>
        {!alerts ? (
          <p className="muted">Loading...</p>
        ) : active.length === 0 ? (
          <p className="muted">No active alerts.</p>
        ) : (
          <table className="table table-stack">
            <tbody>
              {active.map((a) => (
                <tr key={a.id}>
                  <td data-label="Symbol">
                    <strong>{a.symbol}</strong>
                  </td>
                  <td data-label="When">{a.direction === "above" ? "At or above" : "At or below"} {a.target}</td>
                  <td className="text-right cell-actions">
                    <button className="btn btn-danger" onClick={() => act(`/alerts/${a.id}`, "DELETE", "Alert deleted")}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {done.length > 0 && (
        <div className="card table-wrap">
          <h2>Reached</h2>
          <table className="table table-stack">
            <tbody>
              {done.map((a) => (
                <tr key={a.id}>
                  <td data-label="Symbol">
                    <strong>{a.symbol}</strong>
                  </td>
                  <td data-label="Reached">
                    {a.direction === "above" ? "At or above" : "At or below"} {a.target}
                    <div className="muted fs-sm">
                      {a.triggered_at ? new Date(a.triggered_at).toLocaleString() : ""}
                      {a.triggered_price != null ? ` at ${a.triggered_price}` : ""}
                    </div>
                  </td>
                  <td className="text-right nowrap cell-actions">
                    <button className="btn btn-ghost btn-small" onClick={() => act(`/alerts/${a.id}/rearm`, "POST", "Alert re-armed")}>
                      Re-arm
                    </button>
                    <button className="btn btn-danger" onClick={() => act(`/alerts/${a.id}`, "DELETE", "Alert deleted")}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
