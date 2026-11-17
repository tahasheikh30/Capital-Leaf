"use client";

import Sheet from "@/components/Sheet";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import AiCategorize from "@/components/AiCategorize";
import { useToast } from "@/components/Toast";
import { api, peek } from "@/lib/api";
import { money, monthKey, today } from "@/lib/format";
import { useSpace } from "@/lib/space";
import type { Asset, Category, IncomeSource, Transaction } from "@/lib/types";

// Long months are drawn in pages of this size so the table stays fast to render.
const PAGE_SIZE = 50;

// Savings can go into these kinds of net worth items (not gold, certificates or debts).
const SAVINGS_KINDS = [
  { value: "cash", label: "Cash and bank" },
  { value: "mutual_fund", label: "Mutual fund" },
  { value: "other", label: "Other asset" },
] as const;
type SavingsKind = (typeof SAVINGS_KINDS)[number]["value"];
const kindLabel = (k: string) => SAVINGS_KINDS.find((x) => x.value === k)?.label ?? k;

export default function TransactionsPage() {
  const toast = useToast();
  const { isHousehold } = useSpace();
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
  const [formOpen, setFormOpen] = useState(false);

  // Optionally move part of a new income into savings.
  const [saveOn, setSaveOn] = useState(false);
  const [saveAmount, setSaveAmount] = useState("");
  const [saveTarget, setSaveTarget] = useState(""); // an item id, or "new"
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<SavingsKind>("cash");
  const [assets, setAssets] = useState<Asset[]>([]);

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

  const canSave = type === "income" && !editingId && !isHousehold;
  useEffect(() => {
    if (!formOpen || !canSave) return;
    api<Asset[]>("/assets")
      .then(setAssets)
      .catch(() => setAssets([]));
  }, [formOpen, canSave]);
  const targets = assets.filter((a) => (SAVINGS_KINDS as readonly { value: string }[]).some((k) => k.value === a.kind));

  function resetForm() {
    setFormOpen(false);
    setEditingId(null);
    setAmount("");
    setNote("");
    setCategoryId("");
    setSourceId("");
    setDate(today());
    setSaveOn(false);
    setSaveAmount("");
    setSaveTarget("");
    setNewName("");
    setNewKind("cash");
  }

  function startEdit(t: Transaction) {
    setEditingId(t.id);
    setFormOpen(true);
    setType(t.type);
    setAmount(String(t.amount));
    setDate(t.occurred_on);
    setNote(t.note ?? "");
    setCategoryId(t.category_id ?? "");
    setSourceId(t.income_source_id ?? "");
    setError("");
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const body: Record<string, unknown> = {
      type,
      amount: Number(amount),
      occurred_on: date,
      note: note || null,
      category_id: type === "expense" && categoryId ? categoryId : null,
      income_source_id: type === "income" && sourceId ? sourceId : null,
    };
    if (canSave && saveOn) {
      const moved = Number(saveAmount);
      if (!(moved > 0)) return toast.error("Enter how much to move to savings");
      if (moved > Number(amount)) return toast.error("You cannot move more to savings than the income");
      const target = saveTarget || (targets[0]?.id ?? "new");
      body.savings = target === "new" ? { amount: moved, new_asset: { kind: newKind, name: newName } } : { amount: moved, asset_id: target };
    }
    try {
      const saved = await api<{ savings?: { asset_name: string } }>(editingId ? `/transactions/${editingId}` : "/transactions", {
        method: editingId ? "PATCH" : "POST",
        body,
      });
      const movedTo = saved?.savings?.asset_name;
      resetForm();
      toast.success(editingId ? "Transaction updated" : movedTo ? `Transaction added. ${money(Number(saveAmount))} moved to ${movedTo}` : "Transaction added");
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
        <button className="btn btn-accent" onClick={() => { resetForm(); setFormOpen(true); }}>
          <Plus size={16} aria-hidden="true" /> Add
        </button>
        <input type="month" value={month} onChange={(e) => {
            setMonth(e.target.value);
            setShown(PAGE_SIZE);
          }} className="w-auto"/>
      </div>

      <AiCategorize items={items} cats={cats} onApplied={load} />

      <Sheet open={formOpen} onClose={resetForm} title={editingId ? "Edit transaction" : "Add a transaction"}>
<form className="sheet-form" onSubmit={add}>
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
          {canSave && (
            <>
              <label className="check">
                <input type="checkbox" checked={saveOn} onChange={(e) => setSaveOn(e.target.checked)} />
                <span>Move part of this to savings</span>
              </label>
              {saveOn && (
                <>
                  <div className="field">
                    <label>Amount to move</label>
                    <input type="number" required min="0.01" step="0.01" max={amount || undefined} value={saveAmount} onChange={(e) => setSaveAmount(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Move it to</label>
                    <select value={saveTarget || (targets[0]?.id ?? "new")} onChange={(e) => setSaveTarget(e.target.value)}>
                      {targets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({kindLabel(a.kind)})
                        </option>
                      ))}
                      <option value="new">A new savings item</option>
                    </select>
                  </div>
                  {(saveTarget || (targets[0]?.id ?? "new")) === "new" && (
                    <>
                      <div className="field">
                        <label>Name of the new item</label>
                        <input required maxLength={60} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Emergency fund" />
                      </div>
                      <div className="field">
                        <label>Type</label>
                        <select value={newKind} onChange={(e) => setNewKind(e.target.value as SavingsKind)}>
                          {SAVINGS_KINDS.map((k) => (
                            <option key={k.value} value={k.value}>
                              {k.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
          <button className="btn btn-accent">{editingId ? "Save" : "Add"}</button>
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
