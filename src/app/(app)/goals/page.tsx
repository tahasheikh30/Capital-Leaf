"use client";

import Sheet from "@/components/Sheet";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Meter from "@/components/Meter";
import PersonalOnly from "@/components/PersonalOnly";
import { useToast } from "@/components/Toast";
import { api, peek } from "@/lib/api";
import { money } from "@/lib/format";
import type { Asset, Goal } from "@/lib/types";

const NEW_KINDS = [
  { value: "cash", label: "Cash and bank" },
  { value: "mutual_fund", label: "Mutual fund" },
  { value: "other", label: "Other asset" },
] as const;
const shortKind = (k: string) => (k === "mutual_fund" ? "fund" : k === "cash" ? "cash" : "other");

const dateLabel = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });

function timeLeft(g: Goal) {
  if (g.days_left === null) return "";
  if (g.days_left < 0) return `${Math.abs(g.days_left)} days past the date`;
  if (g.days_left === 0) return "due today";
  if (g.days_left < 60) return `${g.days_left} days left`;
  return `${Math.round(g.days_left / 30.44)} months left`;
}

export default function GoalsPage() {
  return (
    <PersonalOnly>
      <GoalsView />
    </PersonalOnly>
  );
}

function GoalsView() {
  const toast = useToast();
  const [goals, setGoals] = useState<Goal[]>(() => peek<Goal[]>("/goals") ?? []);
  const [loaded, setLoaded] = useState(() => peek<Goal[]>("/goals") !== undefined);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  const [where, setWhere] = useState("new"); // an item id, or "new"
  const [newKind, setNewKind] = useState<(typeof NEW_KINDS)[number]["value"]>("cash");
  const [assets, setAssets] = useState<Asset[]>([]);

  const load = useCallback(async () => {
    try {
      setGoals(await api<Goal[]>("/goals"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Items that could become a goal: savings items that are not one already.
  useEffect(() => {
    if (!formOpen || editingId) return;
    api<Asset[]>("/assets")
      .then(setAssets)
      .catch(() => setAssets([]));
  }, [formOpen, editingId]);
  const free = assets.filter((a) => (NEW_KINDS as readonly { value: string }[]).some((k) => k.value === a.kind) && !goals.some((g) => g.id === a.id));

  function reset() {
    setFormOpen(false);
    setEditingId(null);
    setName("");
    setTarget("");
    setDate("");
    setWhere("new");
    setNewKind("cash");
  }

  function startEdit(g: Goal) {
    setEditingId(g.id);
    setName(g.name);
    setTarget(String(g.target_amount));
    setDate(g.target_date ?? "");
    setFormOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingId) {
        await api(`/goals/${editingId}`, { method: "PATCH", body: { name: name.trim(), target_amount: Number(target), target_date: date || null } });
        toast.success("Goal updated");
      } else {
        await api("/goals", {
          method: "POST",
          body: {
            target_amount: Number(target),
            target_date: date || null,
            ...(where === "new" ? { new_item: { kind: newKind, name: name.trim() } } : { asset_id: where }),
          },
        });
        toast.success("Goal created. Move part of an income to it from the plus button.");
      }
      reset();
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function setDone(g: Goal, done: boolean) {
    try {
      await api(`/goals/${g.id}`, { method: "PATCH", body: { done } });
      toast.success(done ? "Marked as done" : "Goal reopened");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove(g: Goal) {
    if (!confirm(`Remove the goal "${g.name}"? The savings item and its balance stay in your net worth.`)) return;
    try {
      await api(`/goals/${g.id}`, { method: "DELETE" });
      toast.success("Goal removed");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const active = goals.filter((g) => !g.done);
  const finished = goals.filter((g) => g.done);
  const useExisting = !editingId && where !== "new";

  const card = (g: Goal) => (
    <div className="card goal-card" key={g.id}>
      <div className="goal-top">
        <h3 className="goal-name">{g.name}</h3>
        {g.done ? <span className="badge">Done</span> : g.reached ? <span className="badge">Target reached</span> : g.overdue ? <span className="badge badge-expense">Past the date</span> : null}
      </div>
      <div className="goal-amounts">
        <strong>{money(g.saved)}</strong> <span className="muted">of {money(g.target_amount)}</span>
      </div>
      <Meter value={g.percent} tone={g.reached ? "good" : g.overdue ? "bad" : "good"} label={g.name} />
      <div className="goal-meta muted fs-sm">
        <span>{g.percent}%</span>
        {!g.reached && <span>{money(g.remaining)} to go</span>}
        {g.target_date && !g.done && (
          <span>
            by {dateLabel(g.target_date)}, {timeLeft(g)}
          </span>
        )}
      </div>
      {g.monthly_needed !== null && !g.done && <p className="goal-hint fs-sm">Put aside about {money(g.monthly_needed)} a month to get there on time.</p>}
      <div className="goal-actions">
        <button className="btn btn-ghost btn-small" onClick={() => startEdit(g)}>
          Edit
        </button>
        <button className="btn btn-ghost btn-small" onClick={() => setDone(g, !g.done)}>
          {g.done ? "Reopen" : "Mark as done"}
        </button>
        <button className="btn btn-danger" onClick={() => remove(g)}>
          Remove
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <h1>Goals</h1>
        <button className="btn btn-accent" onClick={() => { reset(); setFormOpen(true); }}>
          <Plus size={16} aria-hidden="true" /> New goal
        </button>
      </div>
      {error && <div className="error">{error}</div>}

      <Sheet open={formOpen} onClose={reset} title={editingId ? "Edit goal" : "New goal"}>
        <form className="sheet-form" onSubmit={save}>
          <div className="row">
            <div className="field">
              <label>What are you saving for?</label>
              <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New laptop" disabled={useExisting} />
            </div>
            <div className="field">
              <label>Target amount</label>
              <input type="number" inputMode="decimal" required min="1" step="any" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <div className="field">
              <label>Target date (optional)</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            {!editingId && (
              <>
                <div className="field field-wide">
                  <label>Where is the money kept?</label>
                  <select value={where} onChange={(e) => setWhere(e.target.value)}>
                    <option value="new">A new savings item for this goal</option>
                    {free.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({shortKind(a.kind)}), {money(Number(a.amount ?? 0))} saved
                      </option>
                    ))}
                  </select>
                </div>
                {where === "new" && (
                  <div className="field field-wide">
                    <label>Type of item</label>
                    <select value={newKind} onChange={(e) => setNewKind(e.target.value as typeof newKind)}>
                      {NEW_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
            <button className="btn btn-accent">{editingId ? "Save" : "Create goal"}</button>
          </div>
        </form>
      </Sheet>

      {!loaded ? (
        <div aria-hidden="true">
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
        </div>
      ) : goals.length === 0 ? (
        <div className="card">
          <h2>No goals yet</h2>
          <p className="muted mt-0">Pick something to save for and a target. Then when you add an income, use &quot;Move part of this to savings&quot; to put money toward it.</p>
        </div>
      ) : (
        <>
          <div className="goal-list">{active.map(card)}</div>
          {finished.length > 0 && (
            <>
              <h2 className="goal-done-title">Done</h2>
              <div className="goal-list">{finished.map(card)}</div>
            </>
          )}
        </>
      )}
    </>
  );
}
