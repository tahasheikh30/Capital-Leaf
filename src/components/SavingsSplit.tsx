"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { Asset } from "@/lib/types";

// Savings can go into these kinds of net worth items (not gold, certificates or debts).
export const SAVINGS_KINDS = [
  { value: "cash", label: "Cash and bank" },
  { value: "mutual_fund", label: "Mutual fund" },
  { value: "other", label: "Other asset" },
] as const;
type SavingsKind = (typeof SAVINGS_KINDS)[number]["value"];
const shortKind = (k: string) => (k === "mutual_fund" ? "fund" : k === "cash" ? "cash" : "other");
export const MAX_SPLITS = 5;

type Row = { key: number; target: string; amount: string; newName: string; newKind: SavingsKind };
let nextKey = 1;
const blank = (target = ""): Row => ({ key: nextKey++, target, amount: "", newName: "", newKind: "cash" });

// State for "move part of this income to savings", which can be split across several items.
export function useSavingsSplit(open: boolean, available: boolean) {
  const [on, setOn] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => [blank()]);
  const [assets, setAssets] = useState<Asset[]>([]);

  useEffect(() => {
    if (!open || !available) return;
    api<Asset[]>("/assets")
      .then(setAssets)
      .catch(() => setAssets([]));
  }, [open, available]);

  const targets = assets.filter((a) => (SAVINGS_KINDS as readonly { value: string }[]).some((k) => k.value === a.kind));
  // The item each row points at: what was picked, otherwise the first item no other row uses, otherwise a new one.
  const picked = new Set(rows.map((r) => r.target).filter((t) => t && t !== "new"));
  const resolved: string[] = [];
  for (const r of rows) {
    if (r.target) resolved.push(r.target);
    else {
      const free = targets.find((a) => !picked.has(a.id) && !resolved.includes(a.id));
      resolved.push(free?.id ?? "new");
    }
  }
  const resolve = (i: number) => resolved[i];

  return {
    on,
    setOn,
    rows,
    targets,
    resolve,
    update: (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r))),
    add: () => setRows((rs) => (rs.length < MAX_SPLITS ? [...rs, blank()] : rs)),
    remove: (key: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs)),
    reset: () => {
      setOn(false);
      setRows([blank()]);
    },
    // The list to send with the income, or a message to show the person.
    build(income: number): { savings: object[]; total: number } | { error: string } | null {
      if (!on) return null;
      let total = 0;
      const savings: object[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const amount = Number(r.amount);
        if (!(amount > 0)) return { error: rows.length > 1 ? `Enter how much to move in row ${i + 1}.` : "Enter how much to move to savings." };
        const t = resolve(i);
        if (t === "new" && !r.newName.trim()) return { error: "Give the new savings item a name." };
        if (t !== "new") {
          if (seen.has(t)) return { error: "Each item can only be used once. Combine the amounts instead." };
          seen.add(t);
        }
        total += amount;
        savings.push(t === "new" ? { amount, new_asset: { kind: r.newKind, name: r.newName.trim() } } : { amount, asset_id: t });
      }
      if (Math.round(total * 100) > Math.round(income * 100)) return { error: "You cannot move more to savings than the income." };
      return { savings, total };
    },
  };
}

export type SavingsSplitState = ReturnType<typeof useSavingsSplit>;

export function SavingsSplitFields({ s, income }: { s: SavingsSplitState; income: string }) {
  const entered = s.rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const incomeNum = Number(income) || 0;
  const left = incomeNum - entered;
  return (
    <div className="savings-box">
      <label className="check">
        <input type="checkbox" checked={s.on} onChange={(e) => s.setOn(e.target.checked)} />
        <span>Move part of this to savings</span>
      </label>
      {s.on &&
        s.rows.map((r, i) => {
          const target = s.resolve(i);
          const usedElsewhere = new Set(s.rows.map((_, j) => (j === i ? "" : s.resolve(j))).filter((v) => v && v !== "new"));
          return (
            <div className="split-row" key={r.key}>
              {s.rows.length > 1 && (
                <div className="split-head">
                  <span>Part {i + 1}</span>
                  <button type="button" className="split-x" onClick={() => s.remove(r.key)} aria-label={`Remove part ${i + 1}`}>
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              )}
              <div className="field">
                <label>Amount to move</label>
                <input type="number" inputMode="decimal" min="0.01" step="any" value={r.amount} onChange={(e) => s.update(r.key, { amount: e.target.value })} />
              </div>
              <div className="field">
                <label>Move it to</label>
                <select value={target} onChange={(e) => s.update(r.key, { target: e.target.value })}>
                  {s.targets.map((a) => (
                    <option key={a.id} value={a.id} disabled={usedElsewhere.has(a.id)}>
                      {a.name} ({shortKind(a.kind)})
                    </option>
                  ))}
                  <option value="new">A new savings item</option>
                </select>
              </div>
              {target === "new" && (
                <>
                  <div className="field">
                    <label>Name of the new item</label>
                    <input maxLength={60} value={r.newName} onChange={(e) => s.update(r.key, { newName: e.target.value })} placeholder="e.g. Emergency fund" />
                  </div>
                  <div className="field">
                    <label>Type</label>
                    <select value={r.newKind} onChange={(e) => s.update(r.key, { newKind: e.target.value as SavingsKind })}>
                      {SAVINGS_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          );
        })}
      {s.on && (
        <div className="split-foot">
          {s.rows.length < MAX_SPLITS && (
            <button type="button" className="btn btn-ghost btn-small" onClick={s.add}>
              <Plus size={14} aria-hidden="true" /> Add another item
            </button>
          )}
          {incomeNum > 0 && entered > 0 && <span className={`fs-sm ${left < 0 ? "neg" : "muted"}`}>{left < 0 ? `${money(-left)} over the income` : `${money(left)} stays as income`}</span>}
        </div>
      )}
    </div>
  );
}
