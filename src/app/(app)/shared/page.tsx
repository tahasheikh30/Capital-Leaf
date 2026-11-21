"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { longDate, money, today } from "@/lib/format";
import { useSpace } from "@/lib/space";

type Member = { user_id: string; role: string; name: string };
type Expense = { id: string; note: string; amount: number | string; paid_by: string; participants: string[]; occurred_on: string; created_by: string };
type Settlement = { id: string; from_user: string; to_user: string; amount: number | string; occurred_on: string; created_by: string };
type Shared = {
  me: string;
  members: Member[];
  expenses: Expense[];
  settlements: Settlement[];
  balances: { user_id: string; name: string; balance: number | string }[];
  suggestions: { from: string; to: string; amount: number }[];
};

export default function SharedPage() {
  const { household, isHousehold, loaded, setSpace } = useSpace();
  if (!loaded) return <div className="skeleton skeleton-row" aria-hidden="true" />;
  if (!household)
    return (
      <>
        <div className="page-head">
          <h1>Shared expenses</h1>
        </div>
        <p className="empty">
          Shared expenses live inside a household. <Link href="/household">Create or join one</Link> first.
        </p>
      </>
    );
  if (!isHousehold)
    return (
      <>
        <div className="page-head">
          <h1>Shared expenses</h1>
        </div>
        <div className="card">
          <h2>Switch to your household</h2>
          <p className="muted mt-0">Split bills with {household.name} and see who owes whom.</p>
          <button className="btn btn-primary" onClick={() => setSpace(household.id)}>
            Switch to {household.name}
          </button>
        </div>
      </>
    );
  return <SharedView />;
}

function SharedView() {
  const toast = useToast();
  const { space } = useSpace();
  const [data, setData] = useState<Shared | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<Shared>("/shared");
      setData(d);
      setPaidBy((cur) => cur || d.me);
      setChosen((cur) => (cur.length ? cur : d.members.map((m) => m.user_id)));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, space]);

  const nameOf = (id: string) => (id === data?.me ? "You" : data?.members.find((m) => m.user_id === id)?.name || "Former member");

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok, { category: "household" });
      await load();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (chosen.length === 0) return toast.error("Choose who this was split between");
    const ok = await run(() => api("/shared/expenses", { method: "POST", body: { note, amount: Number(amount), paid_by: paidBy, participants: chosen, occurred_on: date } }), "Expense added");
    if (ok) {
      setNote("");
      setAmount("");
    }
  }

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  if (!data) return error ? <p className="error">{error}</p> : <div className="skeleton skeleton-row" aria-hidden="true" />;
  const settled = data.suggestions.length === 0;

  return (
    <>
      <div className="page-head">
        <h1>Shared expenses</h1>
      </div>
      {error && <p className="error">{error}</p>}

      <section className="sec">
        <h2 className="sec-title">Who owes whom</h2>
        {data.expenses.length === 0 && data.settlements.length === 0 ? (
          <p className="empty">No shared expenses yet. Add the first one below.</p>
        ) : (
          <>
            <ul className="ledger">
              {data.balances.map((b) => {
                const v = Number(b.balance);
                return (
                  <li key={b.user_id}>
                    <span className="ledger-main">{nameOf(b.user_id)}</span>
                    <span className="ledger-end">
                      <span className={`ledger-amt ${v < 0 ? "neg" : ""}`}>{v > 0 ? `is owed ${money(v)}` : v < 0 ? `owes ${money(-v)}` : "all settled"}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {settled ? (
              <p className="muted mt-14">Everyone is settled up.</p>
            ) : (
              <>
                <h3 className="mt-14">Settle up</h3>
                <ul className="ledger">
                  {data.suggestions.map((s) => (
                    <li key={`${s.from}-${s.to}`}>
                      <span className="ledger-main">
                        {nameOf(s.from)} pays {nameOf(s.to)}
                      </span>
                      <span className="ledger-end">
                        <span className="ledger-amt">{money(s.amount)}</span>
                        <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => run(() => api("/shared/settlements", { method: "POST", body: { from_user: s.from, to_user: s.to, amount: s.amount } }), "Payment recorded")}>
                          Mark as paid
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>

      <form className="sec" onSubmit={add}>
        <h2 className="sec-title">Add an expense</h2>
        <div className="row">
          <div className="field">
            <label htmlFor="se-note">What was it for</label>
            <input id="se-note" required maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Groceries" />
          </div>
          <div className="field">
            <label htmlFor="se-amount">Amount</label>
            <input id="se-amount" type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="se-paid">Paid by</label>
            <select id="se-paid" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {data.members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {nameOf(m.user_id)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="se-date">Date</label>
            <input id="se-date" type="date" required value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <fieldset className="field">
          <legend>Split equally between</legend>
          {data.members.map((m) => (
            <label key={m.user_id} className="check">
              <input type="checkbox" checked={chosen.includes(m.user_id)} onChange={() => toggle(m.user_id)} /> {nameOf(m.user_id)}
            </label>
          ))}
        </fieldset>
        {Number(amount) > 0 && chosen.length > 0 && <p className="muted fs-sm">About {money(Number(amount) / chosen.length)} each.</p>}
        <button className="btn btn-primary" disabled={busy}>
          Add expense
        </button>
      </form>

      {data.expenses.length > 0 && (
        <section className="sec">
          <h2 className="sec-title">Expenses</h2>
          <ul className="ledger">
            {data.expenses.map((e) => (
              <li key={e.id}>
                <span className="ledger-main">
                  {e.note}
                  <span className="ledger-sub">
                    {nameOf(e.paid_by)} paid, split {e.participants.length === data.members.length ? "with everyone" : `between ${e.participants.length}`}, {longDate(e.occurred_on)}
                  </span>
                </span>
                <span className="ledger-end">
                  <span className="ledger-amt">{money(Number(e.amount))}</span>
                  <button className="btn btn-danger btn-small" disabled={busy} onClick={() => confirm(`Remove "${e.note}"?`) && run(() => api(`/shared/expenses/${e.id}`, { method: "DELETE" }), "Expense removed")}>
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.settlements.length > 0 && (
        <section className="sec">
          <h2 className="sec-title">Payments between members</h2>
          <ul className="ledger">
            {data.settlements.map((s) => (
              <li key={s.id}>
                <span className="ledger-main">
                  {nameOf(s.from_user)} paid {nameOf(s.to_user)}
                  <span className="ledger-sub">{longDate(s.occurred_on)}</span>
                </span>
                <span className="ledger-end">
                  <span className="ledger-amt">{money(Number(s.amount))}</span>
                  <button className="btn btn-danger btn-small" disabled={busy} onClick={() => confirm("Remove this payment?") && run(() => api(`/shared/settlements/${s.id}`, { method: "DELETE" }), "Payment removed")}>
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
