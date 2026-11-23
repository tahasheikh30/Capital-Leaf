"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Meter from "@/components/Meter";
import Sheet from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { SPENDING_EVENT } from "@/lib/spending";
import { money } from "@/lib/format";
import type { Category, CategoryBudgetLine } from "@/lib/types";

const TONE = { ok: "good", warn: "warn", over: "bad" } as const;

export function limitText(b: Pick<CategoryBudgetLine, "level" | "remaining">) {
  if (b.level === "over") return b.remaining === 0 ? "Limit reached" : `${money(-b.remaining)} over`;
  return `${money(b.remaining)} left`;
}

// A monthly limit for each category. Everything is counted by the server, so a limit means the same on every device.
export default function CategoryLimits() {
  const toast = useToast();
  const [lines, setLines] = useState<CategoryBudgetLine[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryBudgetLine | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [limit, setLimit] = useState("");

  const load = useCallback(async () => {
    try {
      const [status, c] = await Promise.all([api<{ items: CategoryBudgetLine[] }>("/category-budgets/status"), api<Category[]>("/categories")]);
      setLines(status.items ?? []);
      setCats(c);
    } catch (e) {
      setLines((l) => l ?? []);
      toast.error((e as Error).message);
    }
  }, [toast]);

  useEffect(() => {
    load();
    window.addEventListener(SPENDING_EVENT, load);
    return () => window.removeEventListener(SPENDING_EVENT, load);
  }, [load]);

  const free = cats.filter((c) => !(lines ?? []).some((l) => l.category_id === c.id));

  function close() {
    setOpen(false);
    setEditing(null);
    setCategoryId("");
    setLimit("");
  }

  function startAdd() {
    close();
    setCategoryId(free[0]?.id ?? "");
    setOpen(true);
  }

  function startEdit(b: CategoryBudgetLine) {
    setEditing(b);
    setCategoryId(b.category_id);
    setLimit(String(b.limit));
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(editing ? `/category-budgets/${editing.id}` : "/category-budgets", {
        method: editing ? "PATCH" : "POST",
        body: editing ? { monthly_limit: Number(limit) } : { category_id: categoryId, monthly_limit: Number(limit) },
      });
      toast.success(editing ? "Limit updated" : "Limit added");
      close();
      load();
      // Spending may already be past the new limit.
      window.dispatchEvent(new Event(SPENDING_EVENT));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove(b: CategoryBudgetLine) {
    try {
      await api(`/category-budgets/${b.id}`, { method: "DELETE" });
      toast.success("Limit removed");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <section className="sec sec-spaced" aria-labelledby="limits-title">
      <div className="sec-head">
        <h2 className="sec-title" id="limits-title">Limits by category</h2>
        <button type="button" className="btn btn-accent btn-small" onClick={startAdd} disabled={lines !== null && free.length === 0}>
          <Plus size={15} aria-hidden="true" /> Add a limit
        </button>
      </div>
      <p className="muted mt-0">Set the most you want to spend on a category each month. You are told at 80 percent and again at 100 percent.</p>

      {lines === null ? (
        <p className="muted">Loading...</p>
      ) : lines.length === 0 ? (
        <p className="empty">No limits yet. Try one for Food or Transport.</p>
      ) : (
        <ul className="limits">
          {lines.map((b) => (
            <li key={b.id} className={`limit limit-${b.level}`}>
              <div className="limit-top">
                <span className="limit-name">
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill={b.color} /></svg>
                  {b.category_name}
                </span>
                <span className="limit-amounts">{money(b.spent)} of {money(b.limit)}</span>
              </div>
              <Meter value={b.pct} tone={TONE[b.level]} label={`${b.category_name} limit used`} />
              <div className="limit-bottom">
                <span className={`limit-state limit-state-${b.level}`}>
                  {b.level === "warn" ? "Nearly there. " : ""}
                  {limitText(b)}
                </span>
                <span className="cell-actions">
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => startEdit(b)} aria-label={`Edit the ${b.category_name} limit`}>Edit</button>
                  <button type="button" className="btn btn-danger" onClick={() => remove(b)} aria-label={`Remove the ${b.category_name} limit`}>Remove</button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={open} onClose={close} title={editing ? `${editing.category_name} limit` : "Add a limit"}>
        <form className="sheet-form" onSubmit={save}>
          <div className="row">
            {!editing && (
              <div className="field">
                <label htmlFor="limit-cat">Category</label>
                <select id="limit-cat" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  {free.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label htmlFor="limit-amount">Monthly limit</label>
              <input id="limit-amount" type="number" required min="1" step="0.01" value={limit} onChange={(e) => setLimit(e.target.value)} />
            </div>
            <button className="btn btn-primary">{editing ? "Save" : "Add limit"}</button>
          </div>
        </form>
      </Sheet>
    </section>
  );
}
