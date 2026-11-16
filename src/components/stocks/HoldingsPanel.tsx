"use client";

import Sheet from "@/components/Sheet";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { api, peek } from "@/lib/api";
import { money } from "@/lib/format";
import type { HoldingItem, Portfolio } from "@/lib/types";

export default function HoldingsPanel() {
  const toast = useToast();
  const [data, setData] = useState<Portfolio | null>(() => peek<Portfolio>("/holdings") ?? null);
  const [refreshing, setRefreshing] = useState(false);

  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [buy, setBuy] = useState("");
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await api<Portfolio>("/holdings"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setFormOpen(false);
    setEditingId(null);
    setSymbol("");
    setShares("");
    setBuy("");
    setManual("");
  }

  function startEdit(h: HoldingItem) {
    setEditingId(h.id);
    setFormOpen(true);
    setSymbol(h.symbol);
    setShares(String(h.shares));
    setBuy(h.avg_buy_price != null ? String(h.avg_buy_price) : "");
    setManual(h.manual_price != null ? String(h.manual_price) : "");
    setError("");
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api(editingId ? `/holdings/${editingId}` : "/holdings", {
        method: editingId ? "PATCH" : "POST",
        body: {
          symbol,
          shares: Number(shares),
          avg_buy_price: buy ? Number(buy) : null,
          manual_price: manual ? Number(manual) : null,
        },
      });
      resetForm();
      toast.success(editingId ? "Holding updated" : "Holding added");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/holdings/${id}`, { method: "DELETE" });
      toast.success("Holding deleted");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const rows = data?.holdings ?? [];

  return (
    <>
      <div className="page-head">
        <h2 className="panel-title">Holdings</h2>
        <button className="btn btn-accent" onClick={() => { resetForm(); setFormOpen(true); }}>
          <Plus size={16} aria-hidden="true" /> Add
        </button>
        <div className="flex-center-gap">
          {data && <span className="muted">Updated {new Date(data.fetchedAt).toLocaleTimeString()}</span>}
          <button className="btn btn-ghost" disabled={refreshing} onClick={load}>
            {refreshing ? "Refreshing..." : "Refresh prices"}
          </button>
        </div>
      </div>

      <Sheet open={formOpen} onClose={resetForm} title={editingId ? "Edit holding" : "Add a holding"}>
<form className="sheet-form" onSubmit={add}>
        {error && <div className="error">{error}</div>}
        <div className="row">
          <div className="field">
            <label>PSX symbol</label>
            <input required value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. HUBC" />
          </div>
          <div className="field">
            <label>Shares</label>
            <input type="number" required min="0.0001" step="any" value={shares} onChange={(e) => setShares(e.target.value)} />
          </div>
          <div className="field">
            <label>Avg buy price</label>
            <input type="number" min="0" step="0.01" value={buy} onChange={(e) => setBuy(e.target.value)} />
          </div>
          <div className="field">
            <label>Manual price (fallback)</label>
            <input type="number" min="0" step="0.01" value={manual} onChange={(e) => setManual(e.target.value)} />
          </div>
          <button className="btn btn-primary">{editingId ? "Save" : "Add"}</button>
          {editingId && (
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>
</Sheet>

      <div className="grid grid-2 mb-16">
        <div className="card">
          <div className="stat-label">Portfolio value</div>
          <div className="stat-value">{money(data?.totalValue ?? 0)}</div>
        </div>
        <div className="card">
          <div className="stat-label">Total gain / loss</div>
          <div className={`stat-value ${(data?.totalPnl ?? 0) < 0 ? "neg" : "pos"}`}>{money(data?.totalPnl ?? 0)}</div>
        </div>
      </div>

      <div className="card table-wrap">
        {rows.length === 0 ? (
          <p className="muted">No holdings yet. Add a PSX symbol such as OGDC, HUBC or ENGRO.</p>
        ) : (
          <table className="table table-stack">
            <thead>
              <tr>
                <th>Symbol</th>
                <th className="text-right">Shares</th>
                <th className="text-right">Price</th>
                <th className="text-right">Value</th>
                <th className="text-right">Gain / loss</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id}>
                  <td data-label="Symbol">
                    <strong>{h.symbol}</strong>
                    <div className="muted fs-sm">
                      {h.priceSource === "live" ? "Live" : h.priceSource === "manual" ? "Manual price" : "No price"}
                    </div>
                  </td>
                  <td data-label="Shares" className="text-right">{h.shares}</td>
                  <td data-label="Price" className="text-right">
                    <div className="cell-main">
                      {h.price != null ? h.price.toFixed(2) : "-"}
                      {h.change != null && (
                        <div className={`fs-sm ${h.change < 0 ? "neg" : "pos"}`}>
                          {h.change > 0 ? "+" : ""}
                          {h.change.toFixed(2)}%
                        </div>
                      )}
                    </div>
                  </td>
                  <td data-label="Value" className="text-right">{h.value != null ? money(h.value) : "-"}</td>
                  <td data-label="Gain / loss" className={`text-right ${h.pnl != null && h.pnl < 0 ? "neg" : "pos"}`}>
                    {h.pnl != null ? money(h.pnl) : "-"}
                  </td>
                  <td className="text-right nowrap cell-actions">
                    <button className="btn btn-ghost btn-small" onClick={() => startEdit(h)}>
                      Edit
                    </button>
                    <button className="btn btn-danger" onClick={() => remove(h.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
