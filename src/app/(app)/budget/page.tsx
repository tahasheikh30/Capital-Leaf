"use client";

import Sheet from "@/components/Sheet";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { api, peek } from "@/lib/api";
import { money, monthKey } from "@/lib/format";
import type { BudgetRuleItem, BudgetSummary } from "@/lib/types";

export default function BudgetPage() {
  const toast = useToast();
  const [summary, setSummary] = useState<BudgetSummary | null>(() => peek<BudgetSummary>(`/budget-rules/summary?month=${monthKey(new Date())}`) ?? null);

  const [name, setName] = useState("");
  const [mode, setMode] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setSummary(await api<BudgetSummary>(`/budget-rules/summary?month=${monthKey(new Date())}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setFormOpen(false);
    setEditingId(null);
    setName("");
    setValue("");
    setMode("percent");
  }

  function startEdit(r: BudgetRuleItem) {
    setEditingId(r.id);
    setFormOpen(true);
    setName(r.name);
    setMode(r.mode);
    setValue(String(r.value));
    setError("");
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api(editingId ? `/budget-rules/${editingId}` : "/budget-rules", {
        method: editingId ? "PATCH" : "POST",
        body: { name, mode, value: Number(value) },
      });
      resetForm();
      toast.success(editingId ? "Rule updated" : "Rule added");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/budget-rules/${id}`, { method: "DELETE" });
      toast.success("Rule deleted");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Budget</h1>
        <button className="btn btn-accent" onClick={() => { resetForm(); setFormOpen(true); }}>
          <Plus size={16} aria-hidden="true" /> Add
        </button>
        {summary && (
          <span className="muted">
            Based on {summary.basis === "average" ? "your average monthly income" : summary.usingExpected ? "expected monthly income" : "income earned this month"}: {money(summary.base)}
          </span>
        )}
      </div>

      <Sheet open={formOpen} onClose={resetForm} title={editingId ? "Edit rule" : "Set money aside"}>
<form className="sheet-form" onSubmit={add}>
        {error && <div className="error">{error}</div>}
        <div className="row">
          <div className="field">
            <label>Name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Savings" />
          </div>
          <div className="field">
            <label>How</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as "percent" | "fixed")}>
              <option value="percent">Percent of income</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </div>
          <div className="field">
            <label>{mode === "percent" ? "Percent" : "Amount"}</label>
            <input type="number" required min="0.01" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <button className="btn btn-primary">{editingId ? "Save" : "Add rule"}</button>
          {editingId && (
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>
</Sheet>

      {summary && (
        <>
          <div className="grid grid-4 mb-16">
            <div className="card">
              <div className="stat-label">Income</div>
              <div className="stat-value">{money(summary.base)}</div>
            </div>
            <div className="card">
              <div className="stat-label">Set aside{summary.taxSetAside ? ` (plus ${money(summary.taxSetAside)} tax)` : ""}</div>
              <div className="stat-value">{money(summary.allocated)}</div>
            </div>
            <div className="card">
              <div className="stat-label">Spending budget</div>
              <div className={`stat-value ${summary.spendable < 0 ? "neg" : ""}`}>{money(summary.spendable)}</div>
            </div>
            <div className="card">
              <div className="stat-label">Left after spending</div>
              <div className={`stat-value ${summary.remaining < 0 ? "neg" : "pos"}`}>{money(summary.remaining)}</div>
            </div>
          </div>
          {summary.movedToSavings ? <p className="muted fs-sm">{summary.movedToSavings > 0 ? `Includes ${money(summary.movedToSavings)} moved to savings this month.` : `Includes ${money(-summary.movedToSavings)} taken back out of savings this month.`}</p> : null}

          <div className="card table-wrap">
            {summary.rules.length === 0 ? (
              <p className="muted">No rules yet. Try adding Savings at 20 percent.</p>
            ) : (
              <table className="table table-stack">
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>Setting</th>
                    <th className="text-right">This month</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {summary.rules.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Rule">{r.name}</td>
                      <td data-label="Setting">
                        <span className="badge">{r.mode === "percent" ? `${Number(r.value)}%` : "Fixed"}</span>
                      </td>
                      <td data-label="This month" className="text-right">{money(r.amount)}</td>
                      <td className="text-right nowrap cell-actions">
                        <button className="btn btn-ghost btn-small" onClick={() => startEdit(r)}>
                          Edit
                        </button>
                        <button className="btn btn-danger" onClick={() => remove(r.id)}>
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
      )}
    </>
  );
}
