"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { api, peek } from "@/lib/api";
import { money, today } from "@/lib/format";
import type { DividendsData } from "@/lib/types";

export default function DividendsPanel() {
  const toast = useToast();
  const [data, setData] = useState<DividendsData | null>(() => peek<DividendsData>("/dividends") ?? null);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [perShare, setPerShare] = useState("");
  const [exDate, setExDate] = useState(today());
  const [payDate, setPayDate] = useState("");
  const [taxPct, setTaxPct] = useState("15");

  const load = useCallback(async () => {
    try {
      setData(await api<DividendsData>("/dividends"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function reset() {
    setEditingId(null);
    setSymbol("");
    setShares("");
    setPerShare("");
    setPayDate("");
    setTaxPct("15");
    setExDate(today());
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api(editingId ? `/dividends/${editingId}` : "/dividends", {
        method: editingId ? "PATCH" : "POST",
        body: { symbol, ex_date: exDate, pay_date: payDate || null, per_share: Number(perShare), shares: Number(shares), tax_pct: Number(taxPct) },
      });
      toast.success(editingId ? "Dividend updated" : "Dividend added");
      reset();
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function receive(id: string) {
    try {
      await api(`/dividends/${id}/receive`, { method: "POST", body: { add_to_income: true } });
      toast.success("Marked as received and added to this month's income");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/dividends/${id}`, { method: "DELETE" });
      toast.success("Dividend deleted");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const s = data?.summary;
  return (
    <>
      <div className="page-head">
        <h2 className="panel-title">Dividends</h2>
      </div>

      {s && (
        <div className="grid grid-4 mb-16">
          <div className="card">
            <div className="stat-label">Received this financial year</div>
            <div className="stat-value pos">{money(s.receivedThisFinancialYear)}</div>
          </div>
          <div className="card">
            <div className="stat-label">Last 12 months</div>
            <div className="stat-value">{money(s.receivedLast12Months)}</div>
          </div>
          <div className="card">
            <div className="stat-label">Expected ({s.expectedCount})</div>
            <div className="stat-value">{money(s.expectedNet)}</div>
          </div>
          <div className="card">
            <div className="stat-label">Yield on cost</div>
            <div className="stat-value">{s.yieldOnCost != null ? `${s.yieldOnCost}%` : "-"}</div>
          </div>
        </div>
      )}

      <form className="card mb-16" onSubmit={save}>
        <h2>{editingId ? "Edit dividend" : "Add a dividend"}</h2>
        {error && <div className="error">{error}</div>}
        <div className="row">
          <div className="field">
            <label>Symbol</label>
            <input required value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. OGDC" />
          </div>
          <div className="field">
            <label>Shares held</label>
            <input type="number" required min="0.0001" step="any" value={shares} onChange={(e) => setShares(e.target.value)} />
          </div>
          <div className="field">
            <label>Dividend per share</label>
            <input type="number" required min="0.0001" step="any" value={perShare} onChange={(e) => setPerShare(e.target.value)} />
          </div>
          <div className="field">
            <label>Ex-dividend date</label>
            <input type="date" required value={exDate} onChange={(e) => setExDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Payment date</label>
            <input type="date" value={payDate} min={exDate} onChange={(e) => setPayDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Tax withheld %</label>
            <input type="number" required min="0" max="100" step="0.1" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
          </div>
          <button className="btn btn-primary">{editingId ? "Save" : "Add"}</button>
          {editingId && (
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Cancel
            </button>
          )}
        </div>
        <p className="muted fs-sm mt-14">Enter dividends when a company announces them. The default tax rate is 15 percent, which you can change per dividend. When the money arrives, mark it received and it is added to your income.</p>
      </form>

      <div className="card table-wrap">
        {!data ? (
          <p className="muted">Loading...</p>
        ) : data.items.length === 0 ? (
          <p className="muted">No dividends yet. Add one when a company announces it.</p>
        ) : (
          <table className="table table-stack">
            <thead>
              <tr>
                <th>Company</th>
                <th>Dates</th>
                <th className="text-right">Gross</th>
                <th className="text-right">Net after tax</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((d) => (
                <tr key={d.id}>
                  <td data-label="Company">
                    <strong>{d.symbol}</strong>
                    <div className="muted fs-sm">
                      {d.shares} shares at {d.per_share} each
                    </div>
                  </td>
                  <td data-label="Dates">
                    <div className="cell-main">
                      <span className={`badge ${d.status === "received" ? "" : "badge-warn"}`}>{d.status === "received" ? `Received ${d.received_on}` : "Expected"}</span>
                      <div className="muted fs-sm">
                        Ex {d.ex_date}
                        {d.pay_date ? `, pays ${d.pay_date}` : ""}
                      </div>
                    </div>
                  </td>
                  <td data-label="Gross" className="text-right">{money(d.gross)}</td>
                  <td data-label="Net after tax" className="text-right pos">{money(d.net)}</td>
                  <td className="text-right nowrap cell-actions">
                    {d.status === "expected" && (
                      <>
                        <button className="btn btn-primary btn-small" onClick={() => receive(d.id)}>
                          Mark received
                        </button>
                        <button
                          className="btn btn-ghost btn-small"
                          onClick={() => {
                            setEditingId(d.id);
                            setSymbol(d.symbol);
                            setShares(String(d.shares));
                            setPerShare(String(d.per_share));
                            setExDate(d.ex_date);
                            setPayDate(d.pay_date ?? "");
                            setTaxPct(String(d.tax_pct));
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Edit
                        </button>
                      </>
                    )}
                    <button className="btn btn-danger" onClick={() => remove(d.id)}>
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
