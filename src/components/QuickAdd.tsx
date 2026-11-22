"use client";

import { Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sheet from "@/components/Sheet";
import { addOrQueue } from "@/lib/offlineQueue";
import { useUserId } from "@/lib/useUserId";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { SavingsSplitFields, useSavingsSplit } from "@/components/SavingsSplit";
import { money, monthKey, today } from "@/lib/format";
import { useSpace } from "@/lib/space";
import type { Category, IncomeSource, Transaction } from "@/lib/types";

const dayOffset = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// One button on every screen: type an amount, tap a category, done.
// The floating add button and the N shortcut belong to the dashboard only. Other pages have their own Add buttons.
export default function QuickAdd() {
  return usePathname() === "/dashboard" ? <QuickAddSheet /> : null;
}

function QuickAddSheet() {
  const toast = useToast();
  const { household, isHousehold, refresh } = useSpace();
  const userId = useUserId();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"expense" | "income">("expense");

  // The home screen shortcuts open the form straight away: /dashboard?add=expense or ?add=income.
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("add");
    if (want === "expense" || want === "income") {
      setType(want);
      setOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
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

  // Optionally move part of a new income into savings (personal space only), split across items if wanted.
  const canSave = type === "income" && !isHousehold;
  const split = useSavingsSplit(open, canSave);

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
    split.reset();
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
    if (canSave) {
      const built = split.build(value);
      if (built && "error" in built) return setError(built.error);
      if (built) {
        moved = built.total;
        body.savings = built.savings;
      }
    }
    setBusy(true);
    try {
      const result = await addOrQueue<{ savings?: { asset_name: string }[] }>(userId, body, isHousehold && household ? household.id : "personal");
      if (result.queued) {
        toast.success("Saved on this device. It will sync when you are back online.");
        reset();
        setOpen(false);
        return;
      }
      const saved = result.saved;
      const names = (saved?.savings ?? []).map((m) => m.asset_name);
      const movedTo = names.length > 2 ? `${names.length} items` : names.join(" and ");
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

          {canSave && <SavingsSplitFields s={split} income={amount} />}

          {error && <div className="error">{error}</div>}
          <button className={`btn btn-block qa-submit ${type}`} disabled={busy}>
            {busy ? "Adding..." : type === "expense" ? "Add expense" : "Add income"}
          </button>
        </form>
      </Sheet>
    </>
  );
}
