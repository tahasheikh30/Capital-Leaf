"use client";

import { useCallback, useEffect, useState } from "react";
import { api, peek } from "@/lib/api";
import { money, today } from "@/lib/format";
import { FREQUENCY_LABEL, type Category, type IncomeSource, type RecurringItem } from "@/lib/types";

export default function RecurringPage() {
  const [items, setItems] = useState<RecurringItem[]>(() => peek<RecurringItem[]>("/recurring") ?? []);
  const [cats, setCats] = useState<Category[]>(() => peek<Category[]>("/categories") ?? []);
  const [sources, setSources] = useState<IncomeSource[]>(() => peek<IncomeSource[]>("/income-sources") ?? []);

  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<RecurringItem["frequency"]>("monthly");
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [r, c, s] = await Promise.all([
        api<RecurringItem[]>("/recurring"),
        api<Category[]>("/categories"),
        api<IncomeSource[]>("/income-sources"),
      ]);
      setItems(r);
      setCats(c);
      setSources(s);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setAmount("");
    setNote("");
    setEnd("");
    setCategoryId("");
    setSourceId("");
    setStart(today());
  }

  function startEdit(r: RecurringItem) {
    setEditingId(r.id);
    setType(r.type);
    setAmount(String(r.amount));
    setFrequency(r.frequency);
    setStart(r.start_date);
    setEnd(r.end_date ?? "");
    setNote(r.note ?? "");
    setCategoryId(r.category_id ?? "");
    setSourceId(r.income_source_id ?? "");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const links = {
      category_id: type === "expense" && categoryId ? categoryId : null,
      income_source_id: type === "income" && sourceId ? sourceId : null,
    };
    try {
      if (editingId) {
        // Type, frequency and start date are fixed once created.
        await api(`/recurring/${editingId}`, {
          method: "PATCH",
          body: { amount: Number(amount), note: note || null, end_date: end || null, ...links },
        });
      } else {
        await api("/recurring", {
          method: "POST",
          body: { type, amount: Number(amount), frequency, start_date: start, end_date: end || null, note: note || null, ...links },
        });
      }
      resetForm();
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggle(r: RecurringItem) {
    try {
      await api(`/recurring/${r.id}`, { method: "PATCH", body: { active: !r.active } });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Stop and delete this repeating item? Entries already created stay in your transactions.")) return;
    try {
      await api(`/recurring/${id}`, { method: "DELETE" });
      if (editingId === id) resetForm();
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const label = (r: RecurringItem) =>
    r.type === "expense"
      ? cats.find((c) => c.id === r.category_id)?.name ?? "Uncategorized"
      : sources.find((s) => s.id === r.income_source_id)?.name ?? "Other income";

  return (
    <>
      <div className="page-head">
        <h1>Recurring</h1>
        <span className="muted">Rent, salary and subscriptions, added for you on time</span>
      </div>

      <form className="card mb-16" onSubmit={save}>
        <h2>{editingId ? "Edit repeating item" : "Add a repeating item"}</h2>
        {error && <div className="error">{error}</div>}
        <div className="row">
          <div className="field">
            <label>Type</label>
            <select value={type} disabled={!!editingId} onChange={(e) => setType(e.target.value as "income" | "expense")}>
              <option value="expense">Bill or expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div className="field">
            <label>Amount</label>
            <input type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field">
            <label>Repeats</label>
            <select value={frequency} disabled={!!editingId} onChange={(e) => setFrequency(e.target.value as RecurringItem["frequency"])}>
              {Object.entries(FREQUENCY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Starts</label>
            <input type="date" required disabled={!!editingId} value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label>Ends (optional)</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          {type === "expense" ? (
            <div className="field">
              <label>Category</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Uncategorized</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="field">
              <label>Source</label>
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">Other</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Note</label>
            <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. House rent" />
          </div>
          <button className="btn btn-accent">{editingId ? "Save" : "Add"}</button>
          {editingId && (
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
        {!editingId && <p className="muted fs-sm mt-14">If the start date is in the past, the missed entries are added straight away.</p>}
      </form>

      <div className="card table-wrap">
        {items.length === 0 ? (
          <p className="muted">Nothing repeating yet. Add your rent, salary or a subscription above.</p>
        ) : (
          <table className="table table-stack">
            <thead>
              <tr>
                <th>Item</th>
                <th>Repeats</th>
                <th>Next</th>
                <th className="text-right">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className={r.active ? "" : "row-paused"}>
                  <td data-label="Item">
                    {label(r)}
                    {r.note && <div className="muted fs-sm">{r.note}</div>}
                  </td>
                  <td data-label="Repeats">
                    <span className={`badge ${r.type === "expense" ? "badge-expense" : ""}`}>{FREQUENCY_LABEL[r.frequency]}</span>
                  </td>
                  <td data-label="Next">{r.active ? r.next_due : "Paused"}</td>
                  <td data-label="Amount" className={`text-right ${r.type === "income" ? "pos" : "neg"}`}>
                    {r.type === "income" ? "+" : "-"}
                    {money(Number(r.amount))}
                  </td>
                  <td className="text-right nowrap cell-actions">
                    <button className="btn btn-ghost btn-small" onClick={() => startEdit(r)}>
                      Edit
                    </button>
                    <button className="btn btn-ghost btn-small" onClick={() => toggle(r)}>
                      {r.active ? "Pause" : "Resume"}
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
  );
}
