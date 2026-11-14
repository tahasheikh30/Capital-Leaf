"use client";

import { useCallback, useEffect, useState } from "react";
import { api, peek } from "@/lib/api";
import { money } from "@/lib/format";
import type { HoldingItem, Portfolio } from "@/lib/types";

export default function StocksPage() {
  const [data, setData] = useState<Portfolio | null>(() => peek<Portfolio>("/holdings") ?? null);
  const [refreshing, setRefreshing] = useState(false);

  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [buy, setBuy] = useState("");
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

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
    setEditingId(null);
    setSymbol("");
    setShares("");
    setBuy("");
    setManual("");
  }

  function startEdit(h: HoldingItem) {
    setEditingId(h.id);
    setSymbol(h.symbol);
    setShares(String(h.shares));
    setBuy(h.avg_buy_price != null ? String(h.avg_buy_price) : "");
    setManual(h.manual_price != null ? String(h.manual_price) : "");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/holdings/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const rows = data?.holdings ?? [];

  return (
    <>
      <div className="page-head">
        <h1>Stocks</h1>
        <div className="flex-center-gap">
          {data && <span className="muted">Updated {new Date(data.fetchedAt).toLocaleTimeString()}</span>}
          <button className="btn btn-ghost" disabled={refreshing} onClick={load}>
            {refreshing ? "Refreshing..." : "Refresh prices"}
          </button>
        </div>
      </div>

      <form className="card mb-16" onSubmit={add}>
        <h2>{editingId ? "Edit holding" : "Add a holding"}</h2>
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
