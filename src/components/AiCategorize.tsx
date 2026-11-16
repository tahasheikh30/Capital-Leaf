"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { Category, CategorySuggestion, Transaction } from "@/lib/types";

type Status = { available: boolean; enabled: boolean };

// Suggests categories for expenses that have a note but no category. Nothing changes until the person approves it.
export default function AiCategorize({ items, cats, onApplied }: { items: Transaction[]; cats: Category[]; onApplied: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<{ tx: Transaction; s: CategorySuggestion; categoryId: string; on: boolean }[] | null>(null);

  useEffect(() => {
    api<Status>("/ai/status").then(setStatus).catch(() => setStatus(null));
  }, []);

  const todo = items.filter((t) => t.type === "expense" && !t.category_id && t.note && t.note.trim()).slice(0, 30);
  if (!status?.available || todo.length === 0) return null;
  if (!status.enabled)
    return (
      <p className="muted fs-sm mb-16">
        {todo.length} expense{todo.length === 1 ? "" : "s"} without a category. <Link href="/settings" className="link">Turn on AI in Settings</Link> to sort them automatically.
      </p>
    );

  async function suggest() {
    setBusy(true);
    try {
      const r = await api<{ suggestions: CategorySuggestion[] }>("/ai/categorize", { method: "POST", body: { items: todo.map((t) => ({ key: t.id, note: t.note!.trim().slice(0, 200) })) }, quiet: true });
      const found = todo
        .map((tx) => {
          const s = r.suggestions.find((x) => x.key === tx.id);
          return s && s.category_id ? { tx, s, categoryId: s.category_id, on: true } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      if (found.length === 0) toast.info("No confident suggestions this time");
      else setRows(found);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    const chosen = (rows ?? []).filter((r) => r.on);
    if (chosen.length === 0) return setRows(null);
    setBusy(true);
    try {
      await api("/transactions/bulk-category", { method: "POST", body: { assignments: chosen.map((r) => ({ id: r.tx.id, category_id: r.categoryId })) } });
      toast.success(`${chosen.length} expense${chosen.length === 1 ? "" : "s"} categorized`);
      setRows(null);
      onApplied();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!rows)
    return (
      <div className="card mb-16 ai-bar">
        <span>
          {todo.length} expense{todo.length === 1 ? "" : "s"} without a category.
        </span>
        <button className="btn btn-ghost" onClick={suggest} disabled={busy}>
          {busy ? "Thinking..." : "Suggest categories"}
        </button>
      </div>
    );

  return (
    <div className="card mb-16">
      <h2>Suggested categories</h2>
      <p className="muted fs-sm mt-0">Untick or change anything that is wrong. Nothing is saved until you apply.</p>
      <table className="table table-stack">
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.tx.id}>
              <td data-label="Use">
                <input type="checkbox" aria-label={`Apply to ${r.tx.note}`} checked={r.on} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
              </td>
              <td data-label="Expense">
                {r.tx.note}
                <div className="muted fs-sm">
                  {money(r.tx.amount)}, {r.tx.occurred_on}, {r.s.source === "history" ? "like before" : "AI guess"}
                </div>
              </td>
              <td data-label="Category">
                <select value={r.categoryId} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, categoryId: e.target.value } : x)))}>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex-gap mt-14">
        <button className="btn btn-primary" onClick={apply} disabled={busy}>
          Apply selected
        </button>
        <button className="btn btn-ghost" onClick={() => setRows(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
