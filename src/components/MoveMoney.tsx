"use client";

import { useEffect, useState } from "react";
import Sheet from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { money, today } from "@/lib/format";
import type { Asset } from "@/lib/types";

const KINDS = [
  { value: "cash", label: "Cash and bank" },
  { value: "mutual_fund", label: "Mutual fund" },
  { value: "other", label: "Other asset" },
] as const;

// Move money between what you can spend and a savings item, in either direction.
// "To savings" lowers what you can spend this month. "Back to spending" raises it again.
export default function MoveMoney({
  open,
  onClose,
  direction: first = "in",
  assetId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  direction?: "in" | "out";
  assetId?: string;
  onDone?: () => void;
}) {
  const toast = useToast();
  const [direction, setDirection] = useState<"in" | "out">(first);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [target, setTarget] = useState(assetId ?? "");
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<(typeof KINDS)[number]["value"]>("cash");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);

  // Start fresh each time the sheet opens, with the direction and item the caller chose.
  useEffect(() => {
    if (!open) return;
    setDirection(first);
    setTarget(assetId ?? "");
    setAmount("");
    setDate(today());
    setNewName("");
    setNewKind("cash");
    api<Asset[]>("/assets")
      .then(setAssets)
      .catch(() => setAssets([]));
  }, [open, first, assetId]);

  const savings = assets.filter((a) => (KINDS as readonly { value: string }[]).some((k) => k.value === a.kind));
  const options = direction === "out" ? savings.filter((a) => Number(a.amount ?? 0) > 0) : savings;
  // What the dropdown shows: the chosen item if it fits, otherwise the first item, otherwise a new one (only when moving in).
  const chosen = options.some((a) => a.id === target) ? target : direction === "in" && target === "new" ? "new" : options[0]?.id ?? (direction === "in" ? "new" : "");
  const item = savings.find((a) => a.id === chosen);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) return toast.error("Enter an amount");
    if (!chosen) return toast.error("Choose a savings item first");
    if (direction === "out" && item && value > Number(item.amount ?? 0)) return toast.error(`${item.name} only holds ${money(Number(item.amount ?? 0))}`);
    if (chosen === "new" && !newName.trim()) return toast.error("Give the new savings item a name");
    setBusy(true);
    try {
      const saved = await api<{ asset_name: string }>("/savings-transfers", {
        method: "POST",
        body: {
          direction,
          amount: value,
          occurred_on: date,
          ...(chosen === "new" ? { new_asset: { kind: newKind, name: newName.trim() } } : { asset_id: chosen }),
        },
      });
      toast.success(direction === "in" ? `${money(value)} moved to ${saved?.asset_name ?? "savings"}` : `${money(value)} moved back to spending`);
      onDone?.();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Move money" subtitle={direction === "in" ? "Money moved to savings is taken out of what you can spend." : "Money moved back can be spent again."}>
      <form className="sheet-form" onSubmit={submit}>
        <div className="move-dir" role="group" aria-label="Direction">
          <button type="button" aria-pressed={direction === "in"} className={direction === "in" ? "on" : ""} onClick={() => setDirection("in")}>
            To savings
          </button>
          <button type="button" aria-pressed={direction === "out"} className={direction === "out" ? "on" : ""} onClick={() => setDirection("out")}>
            Back to spending
          </button>
        </div>
        <div className="row">
          <div className="field field-wide">
            <label>Amount</label>
            <input type="number" inputMode="decimal" required min="0.01" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field field-wide">
            <label>{direction === "in" ? "Move it to" : "Take it from"}</label>
            {options.length === 0 && direction === "out" ? (
              <p className="muted fs-sm mt-0">None of your savings items hold any money yet.</p>
            ) : (
              <select value={chosen} onChange={(e) => setTarget(e.target.value)}>
                {options.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}, {money(Number(a.amount ?? 0))}
                  </option>
                ))}
                {direction === "in" && <option value="new">A new savings item</option>}
              </select>
            )}
          </div>
          {direction === "in" && chosen === "new" && (
            <>
              <div className="field field-wide">
                <label>Name of the new item</label>
                <input maxLength={60} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Emergency fund" />
              </div>
              <div className="field field-wide">
                <label>Type</label>
                <select value={newKind} onChange={(e) => setNewKind(e.target.value as typeof newKind)}>
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className="field field-wide">
            <label>Date</label>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <button className="btn btn-accent" disabled={busy || (direction === "out" && options.length === 0)}>
            {direction === "in" ? "Move to savings" : "Move back to spending"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
