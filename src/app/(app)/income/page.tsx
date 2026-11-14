"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { KIND_LABEL, type IncomeSource } from "@/lib/types";

export default function IncomePage() {
  const [items, setItems] = useState<IncomeSource[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<IncomeSource["kind"]>("job");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api<IncomeSource[]>("/income-sources"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setAmount("");
    setKind("job");
  }

  function startEdit(i: IncomeSource) {
    setEditingId(i.id);
    setName(i.name);
    setKind(i.kind);
    setAmount(String(i.expected_monthly));
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api(editingId ? `/income-sources/${editingId}` : "/income-sources", {
        method: editingId ? "PATCH" : "POST",
        body: { name, kind, expected_monthly: Number(amount || 0) },
      });
      resetForm();
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this income source? Past transactions stay, just unlinked.")) return;
    try {
      await api(`/income-sources/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const total = items.reduce((a, i) => a + Number(i.expected_monthly), 0);

  return (
    <>
      <div className="page-head">
        <h1>Income sources</h1>
        <span className="muted">Expected monthly total: {money(total)}</span>
      </div>

      <form className="card mb-16" onSubmit={add}>
        <h2>{editingId ? "Edit source" : "Add a source"}</h2>
        {error && <div className="error">{error}</div>}
        <div className="row">
          <div className="field">
            <label>Name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Salary" />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as IncomeSource["kind"])}>
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Expected monthly</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <button className="btn btn-primary">{editingId ? "Save" : "Add"}</button>
          {editingId && (
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="card table-wrap">
        {items.length === 0 ? (
          <p className="muted">No income sources yet. Add your job or side hustle above.</p>
        ) : (
          <table className="table table-stack">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th className="text-right">Expected monthly</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td data-label="Name">{i.name}</td>
                  <td data-label="Type">
                    <span className="badge">{KIND_LABEL[i.kind]}</span>
                  </td>
                  <td data-label="Expected monthly" className="text-right">{money(Number(i.expected_monthly))}</td>
                  <td className="text-right nowrap cell-actions">
                    <button className="btn btn-ghost btn-small" onClick={() => startEdit(i)}>
                      Edit
                    </button>
                    <button className="btn btn-danger" onClick={() => remove(i.id)}>
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
