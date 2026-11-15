"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { api, peek } from "@/lib/api";
import { money, monthKey, today } from "@/lib/format";
import type { Category, IncomeSource, Transaction } from "@/lib/types";

// Long months are drawn in pages of this size so the table stays fast to render.
const PAGE_SIZE = 50;

export default function TransactionsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Transaction[]>(() => peek<Transaction[]>(`/transactions?month=${monthKey(new Date())}`) ?? []);
  const [cats, setCats] = useState<Category[]>(() => peek<Category[]>("/categories") ?? []);
  const [sources, setSources] = useState<IncomeSource[]>(() => peek<IncomeSource[]>("/income-sources") ?? []);
  const [month, setMonth] = useState(monthKey(new Date()));

  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [error, setError] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!month) return;
    try {
      const [t, c, s] = await Promise.all([
        api<Transaction[]>(`/transactions?month=${month}`),
        api<Category[]>("/categories"),
        api<IncomeSource[]>("/income-sources"),
      ]);
      setItems(t);
      setCats(c);
      setSources(s);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setAmount("");
    setNote("");
    setCategoryId("");
    setSourceId("");
    setDate(today());
  }

  function startEdit(t: Transaction) {
    setEditingId(t.id);
    setType(t.type);
    setAmount(String(t.amount));
    setDate(t.occurred_on);
    setNote(t.note ?? "");
    setCategoryId(t.category_id ?? "");
    setSourceId(t.income_source_id ?? "");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api(editingId ? `/transactions/${editingId}` : "/transactions", {
        method: editingId ? "PATCH" : "POST",
        body: {
          type,
          amount: Number(amount),
          occurred_on: date,
          note: note || null,
          category_id: type === "expense" && categoryId ? categoryId : null,
          income_source_id: type === "income" && sourceId ? sourceId : null,
        },
      });
      resetForm();
      toast.success(editingId ? "Transaction updated" : "Transaction added");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this transaction?")) return;
    try {
      if (editingId === id) resetForm();
      await api(`/transactions/${id}`, { method: "DELETE" });
      toast.success("Transaction deleted");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const income = items.filter((t) => t.type === "income").reduce((a, t) => a + Number(t.amount), 0);
  const spent = items.filter((t) => t.type === "expense").reduce((a, t) => a + Number(t.amount), 0);

  return (
    <>
      <div className="page-head">
        <h1>Transactions</h1>
        <input type="month" value={month} onChange={(e) => {
            setMonth(e.target.value);
            setShown(PAGE_SIZE);
          }} className="w-auto"/>
      </div>

      <form className="card mb-16" onSubmit={add}>
        <h2>{editingId ? "Edit transaction" : "Add a transaction"}</h2>
        {error && <div className="error">{error}</div>}
        <div className="row">
          <div className="field">
            <label>Type</label>
            <select value={type} disabled={!!editingId} onChange={(e) => setType(e.target.value as "income" | "expense")}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div className="field">
            <label>Amount</label>
            <input type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field">
            <label>Date</label>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
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
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </div>
          <button className="btn btn-accent">{editingId ? "Save" : "Add"}</button>
          {editingId && (
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="grid grid-2 mb-16">
        <div className="card">
          <div className="stat-label">Earned</div>
          <div className="stat-value pos">{money(income)}</div>
        </div>
        <div className="card">
          <div className="stat-label">Spent</div>
          <div className="stat-value neg">{money(spent)}</div>
        </div>
      </div>

      <div className="card table-wrap">
        {items.length === 0 ? (
          <p className="muted">Nothing recorded for this month.</p>
        ) : (
          <table className="table table-stack">
            <thead>
              <tr>
                <th>Date</th>
                <th>Details</th>
                <th>Type</th>
                <th className="text-right">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.slice(0, shown).map((t) => {
                const label =
                  t.type === "expense"
                    ? cats.find((c) => c.id === t.category_id)?.name ?? "Uncategorized"
                    : sources.find((s) => s.id === t.income_source_id)?.name ?? "Other";
                return (
                  <tr key={t.id}>
                    <td data-label="Date">{t.occurred_on}</td>
                    <td data-label="Details">
                      <div className="cell-main">
                        {label}
                        {t.note && <div className="muted fs-sm">{t.note}</div>}
                        {t.recurring_id && <div className="muted fs-sm">Repeats automatically</div>}
                      </div>
                    </td>
                    <td data-label="Type">
                      <span className={`badge ${t.type === "expense" ? "badge-expense" : ""}`}>{t.type}</span>
                    </td>
                    <td data-label="Amount" className={`text-right ${t.type === "income" ? "pos" : "neg"}`}>
                      {t.type === "income" ? "+" : "-"}
                      {money(Number(t.amount))}
                    </td>
                    <td className="text-right nowrap cell-actions">
                      <button className="btn btn-ghost btn-small" onClick={() => startEdit(t)}>
                        Edit
                      </button>
                      <button className="btn btn-danger" onClick={() => remove(t.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {items.length > shown && (
          <button className="btn btn-ghost btn-block mt-14" onClick={() => setShown((n) => n + PAGE_SIZE)}>
            Show more ({items.length - shown} left)
          </button>
        )}
      </div>
    </>
  );
}
