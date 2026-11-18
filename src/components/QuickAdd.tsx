"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sheet from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { money, monthKey, today } from "@/lib/format";
import { useSpace } from "@/lib/space";
import type { Asset, Category, IncomeSource, Transaction } from "@/lib/types";

// Savings can go into these kinds of net worth items (not gold, certificates or debts).
const SAVINGS_KINDS = [
  { value: "cash", label: "Cash and bank" },
  { value: "mutual_fund", label: "Mutual fund" },
  { value: "other", label: "Other asset" },
] as const;
type SavingsKind = (typeof SAVINGS_KINDS)[number]["value"];
const shortKind = (k: string) => (k === "mutual_fund" ? "fund" : k === "cash" ? "cash" : "other");

const dayOffset = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// One button on every screen: type an amount, tap a category, done.
export default function QuickAdd() {
  const toast = useToast();
  const { household, isHousehold, refresh } = useSpace();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());
  const [categoryId, setCategoryId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [cats, setCats] = useState<Category[]>([]);
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const touchedCategory = useRef(false);

  // Optionally move part of a new income into savings (personal space only).
  const [saveOn, setSaveOn] = useState(false);
  const [saveAmount, setSaveAmount] = useState("");
  const [saveTarget, setSaveTarget] = useState(""); // an item id, or "new"
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<SavingsKind>("cash");
  const [assets, setAssets] = useState<Asset[]>([]);
  const canSave = type === "income" && !isHousehold;
  useEffect(() => {
    if (!open || !canSave) return;
    api<Asset[]>("/assets")
      .then(setAssets)
      .catch(() => setAssets([]));
  }, [open, canSave]);
  const targets = assets.filter((a) => (SAVINGS_KINDS as readonly { value: string }[]).some((k) => k.value === a.kind));
  const target = saveTarget || (targets[0]?.id ?? "new");

  const openSheet = useCallback(() => {
    setOpen(true);
    setError("");
    Promise.all([api<Category[]>("/categories"), api<IncomeSource[]>("/income-sources"), api<Transaction[]>(`/transactions?month=${monthKey(new Date())}`)])
      .then(([c, s, t]) => {
        setCats(c);
        setSources(s);
        setRecent(t);
      })
      .catch(() => {});
  }, []);

  // Press N anywhere (outside a text box) to add something.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (document.body.classList.contains("sheet-open")) return;
      e.preventDefault();
      openSheet();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openSheet]);

  // If this note was used before, pick the category it had last time.
  const remembered = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of [...recent].reverse()) if (t.type === "expense" && t.note && t.category_id) map.set(t.note.trim().toLowerCase(), t.category_id);
    return map;
  }, [recent]);

  function onNote(v: string) {
    setNote(v);
    const hit = remembered.get(v.trim().toLowerCase());
    if (hit && !touchedCategory.current && type === "expense") setCategoryId(hit);
  }

  function reset() {
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
    touchedCategory.current = false;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter an amount greater than zero.");
    const body: Record<string, unknown> = {
      type,
      amount: value,
      occurred_on: date,
      note: note.trim() || null,
      category_id: type === "expense" && categoryId ? categoryId : null,
      income_source_id: type === "income" && sourceId ? sourceId : null,
    };
    let moved = 0;
    if (canSave && saveOn) {
      moved = Number(saveAmount);
      if (!(moved > 0)) return setError("Enter how much to move to savings.");
      if (moved > value) return setError("You cannot move more to savings than the income.");
      body.savings = target === "new" ? { amount: moved, new_asset: { kind: newKind, name: newName.trim() } } : { amount: moved, asset_id: target };
    }
    setBusy(true);
    try {
      const saved = await api<{ savings?: { asset_name: string } }>("/transactions", { method: "POST", body });
      const movedTo = saved?.savings?.asset_name;
      toast.success(type === "expense" ? "Expense added" : movedTo ? `Income added. ${money(moved)} moved to ${movedTo}` : "Income added");
      reset();
      setOpen(false);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const options = type === "expense" ? cats : sources;
  const selected = type === "expense" ? categoryId : sourceId;
  const select = (id: string) => {
    if (type === "expense") {
      touchedCategory.current = true;
      setCategoryId(id === categoryId ? "" : id);
    } else setSourceId(id === sourceId ? "" : id);
  };

  return (
    <>
      <button type="button" className="fab" onClick={openSheet} aria-label="Add a transaction" title="Add a transaction (N)">
        <Plus size={26} strokeWidth={2.4} aria-hidden="true" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Add a transaction" subtitle={isHousehold && household ? `Goes to ${household.name}, visible to everyone in it` : undefined}>
        <form className="qa" onSubmit={submit}>
          <div className="qa-type" role="group" aria-label="Type">
            {(["expense", "income"] as const).map((t) => (
              <button key={t} type="button" className={`${type === t ? "on" : ""} ${t}`} aria-pressed={type === t} onClick={() => setType(t)}>
                {t === "expense" ? "Spent" : "Earned"}
              </button>
            ))}
          </div>

          <label className="qa-amount">
            <span className="qa-currency">Rs</span>
            <input inputMode="decimal" type="number" min="0.01" step="any" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" required />
          </label>

          <input className="qa-note" maxLength={200} placeholder={type === "expense" ? "What was it? e.g. Careem" : "Where did it come from?"} value={note} onChange={(e) => onNote(e.target.value)} aria-label="Note" />

          <div className="qa-block">
            <div className="qa-label">{type === "expense" ? "Category" : "Source"}</div>
            {options.length === 0 ? (
              <p className="muted fs-sm">{type === "expense" ? "No categories yet. You can add some on the Categories page." : "No income sources yet. You can add some on the Income sources page."}</p>
            ) : (
              <div className="chips">
                {options.map((o) => (
                  <button type="button" key={o.id} className={`chip ${selected === o.id ? "chip-on" : ""}`} aria-pressed={selected === o.id} onClick={() => select(o.id)}>
                    {"color" in o && (
                      <svg className="chip-dot" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                        <circle cx="5" cy="5" r="5" fill={(o as Category).color} />
                      </svg>
                    )}
                    {o.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="qa-block">
            <div className="qa-label">When</div>
            <div className="chips">
              <button type="button" className={`chip ${date === today() ? "chip-on" : ""}`} onClick={() => setDate(today())}>
                Today
              </button>
              <button type="button" className={`chip ${date === dayOffset(-1) ? "chip-on" : ""}`} onClick={() => setDate(dayOffset(-1))}>
                Yesterday
              </button>
              <input className="chip-date" type="date" value={date} max={dayOffset(0)} onChange={(e) => setDate(e.target.value || today())} aria-label="Date" />
            </div>
          </div>

          {canSave && (
            <div className="savings-box">
              <label className="check">
                <input type="checkbox" checked={saveOn} onChange={(e) => setSaveOn(e.target.checked)} />
                <span>Move part of this to savings</span>
              </label>
              {saveOn && (
                <>
                  <div className="field">
                    <label>Amount to move</label>
                    <input type="number" inputMode="decimal" required min="0.01" step="any" max={amount || undefined} value={saveAmount} onChange={(e) => setSaveAmount(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Move it to</label>
                    <select value={target} onChange={(e) => setSaveTarget(e.target.value)}>
                      {targets.map((a) => (
                        <option key={a.id} value={a.id}>
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
            </div>
          )}

          {error && <div className="error">{error}</div>}
          <button className={`btn btn-block qa-submit ${type}`} disabled={busy}>
            {busy ? "Adding..." : type === "expense" ? "Add expense" : "Add income"}
          </button>
        </form>
      </Sheet>
    </>
  );
}
