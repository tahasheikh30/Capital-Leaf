"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Sheet from "@/components/Sheet";
import { Plus } from "lucide-react";
import Meter from "@/components/Meter";
import PersonalOnly from "@/components/PersonalOnly";
import { useToast } from "@/components/Toast";
import { api, peek } from "@/lib/api";
import { money, monthLabel, today } from "@/lib/format";
import type { FreelancerSummary } from "@/lib/types";

const IncomeSwingChart = dynamic(() => import("@/components/DashboardCharts").then((m) => m.IncomeSwingChart), {
  ssr: false,
  loading: () => <div className="skeleton skeleton-chart" aria-hidden="true" />,
});

export default function FreelancerPage() {
  return (
    <PersonalOnly>
      <View />
    </PersonalOnly>
  );
}

function View() {
  const toast = useToast();
  const [d, setD] = useState<FreelancerSummary | null>(() => peek<FreelancerSummary>("/freelancer/summary") ?? null);
  const [error, setError] = useState("");
  const [paidOn, setPaidOn] = useState(today());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setD(await api<FreelancerSummary>("/freelancer/summary"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function enable() {
    try {
      await api("/profile", { method: "PATCH", body: { freelancer_mode: true } });
      toast.success("Freelancer mode is on");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/freelancer/payments", { method: "POST", body: { paid_on: paidOn, amount: Number(amount), note: note || null } });
      toast.success("Tax payment recorded");
      setAmount("");
      setNote("");
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function removePayment(id: string) {
    try {
      await api(`/freelancer/payments/${id}`, { method: "DELETE" });
      toast.success("Payment deleted");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (error) return <div className="error">{error}</div>;
  if (!d) return <div className="skeleton skeleton-chart" aria-busy="true" aria-label="Loading" />;

  if (!d.enabled)
    return (
      <>
        <div className="page-head">
          <h1>Tax and income</h1>
        </div>
        <div className="hero-plate">
          <p className="hero-kicker">For irregular income</p>
          <p className="hero-figure hero-figure-sm">Know what is really yours to spend.</p>
          <p className="hero-line">
            Freelancer mode sets aside a share of every payment for tax, shows what you can safely spend each month based on your average, and tells you how many months your cash would last in a quiet spell.
          </p>
          <button className="btn hero-btn" onClick={enable}>
            Turn on freelancer mode
          </button>
        </div>
      </>
    );

  const s = d.stats;
  const firstUsed = d.months.findIndex((m) => m.income > 0 || m.spent > 0);
  const chart = d.months.slice(Math.max(0, firstUsed)).map((m) => ({ month: monthLabel(m.month), Income: m.income, Spent: m.spent }));
  const heldPct = d.tax.setAsideTarget > 0 ? (d.tax.paid / d.tax.setAsideTarget) * 100 : 0;

  return (
    <>
      <div className="page-head">
        <h1>Tax and income</h1>
        <Link href="/settings#features" className="btn btn-ghost">
          Change {d.taxPct}% rate
        </Link>
      </div>

      <div className="hero-plate">
        <p className="hero-kicker">Safe to spend each month</p>
        <p className="hero-figure">{s.safeMonthlyBudget != null ? money(s.safeMonthlyBudget) : "Not yet"}</p>
        <p className="hero-line">
          {s.enoughHistory
            ? `Based on your average income of ${s.averageIncome != null ? money(s.averageIncome) : "-"}, after ${d.taxPct}% for tax.`
            : "Averages need at least three completed months of records. Keep logging income and this will fill in."}
        </p>
        <dl className="hero-stats">
          <div>
            <dt>Average income</dt>
            <dd>{s.averageIncome != null ? money(s.averageIncome) : "-"}</dd>
          </div>
          <div>
            <dt>Cash runway</dt>
            <dd>{s.runwayMonths != null ? `${s.runwayMonths} months` : "-"}</dd>
          </div>
          <div>
            <dt>Income swing</dt>
            <dd>{s.swing != null ? `${Math.round(s.swing * 100)}%` : "-"}</dd>
          </div>
        </dl>
      </div>

      <div className="split">
        <section className="sec">
          <h2 className="sec-title">Tax jar, since {d.tax.financialYearStart}</h2>
          <ul className="ledger">
            <li>
              <span className="ledger-main">Income this financial year</span>
              <span className="ledger-amt">{money(d.tax.incomeThisYear)}</span>
            </li>
            <li>
              <span className="ledger-main">To set aside at {d.taxPct}%</span>
              <span className="ledger-amt">{money(d.tax.setAsideTarget)}</span>
            </li>
            <li>
              <span className="ledger-main">Already paid to FBR</span>
              <span className="ledger-amt">{money(d.tax.paid)}</span>
            </li>
            <li>
              <span className="ledger-main">Should still be sitting aside</span>
              <span className={`ledger-amt ${d.tax.stillToHold > 0 ? "neg" : "pos"}`}>{money(Math.max(0, d.tax.stillToHold))}</span>
            </li>
          </ul>
          <Meter value={heldPct} label="Tax paid" />
          <p className="muted fs-sm">This is a planning guide using your chosen rate, not a tax calculation. Check actual rates with FBR or an adviser.</p>
        </section>

        <section className="sec">
          <h2 className="sec-title">This month</h2>
          <ul className="ledger">
            <li>
              <span className="ledger-main">Earned so far</span>
              <span className="ledger-amt">{money(s.thisMonth.income)}</span>
            </li>
            <li>
              <span className="ledger-main">Set aside for tax</span>
              <span className="ledger-amt">{money(s.thisMonth.taxSetAside)}</span>
            </li>
            <li>
              <span className="ledger-main">Spent</span>
              <span className="ledger-amt">{money(s.thisMonth.spent)}</span>
            </li>
          </ul>
          {s.thisMonth.vsAverage != null && (
            <p className={s.thisMonth.vsAverage < 0 ? "neg" : "pos"}>
              {money(Math.abs(s.thisMonth.vsAverage))} {s.thisMonth.vsAverage < 0 ? "below" : "above"} your average so far
            </p>
          )}
          {s.lowestMonth && s.highestMonth && (
            <p className="muted fs-sm">
              Best month {monthLabel(s.highestMonth.month)} ({money(s.highestMonth.income)}), slowest {monthLabel(s.lowestMonth.month)} ({money(s.lowestMonth.income)}).
            </p>
          )}
        </section>
      </div>

      <section className="sec">
        <h2 className="sec-title">Income and spending, last months</h2>
        <div className="chart-box">
          <IncomeSwingChart data={chart} />
        </div>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="sec-title">Tax payments</h2>
          <button className="btn btn-accent btn-small sec-add" onClick={() => setFormOpen(true)}>
            <Plus size={15} aria-hidden="true" /> Record a payment
          </button>
        </div>
        {d.payments.length === 0 ? (
          <p className="empty">No tax payments recorded yet. When you pay FBR, record it here and the jar updates.</p>
        ) : (
          <ul className="ledger">
            {d.payments.map((p) => (
              <li key={p.id}>
                <span className="ledger-main">
                  {p.note || "Tax payment"}
                  <span className="ledger-sub">{p.paid_on}</span>
                </span>
                <span className="ledger-end">
                  <span className="ledger-amt">{money(p.amount)}</span>
                  <button className="btn btn-danger btn-small" onClick={() => removePayment(p.id)}>
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Sheet open={formOpen} onClose={() => setFormOpen(false)} title="Record a tax payment">
        <form className="sheet-form" onSubmit={addPayment}>
          <div className="row">
            <div className="field">
              <label htmlFor="tp-date">Date</label>
              <input id="tp-date" type="date" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="tp-amount">Amount</label>
              <input id="tp-amount" type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="field full">
              <label htmlFor="tp-note">Note</label>
              <input id="tp-note" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Advance tax, 1st quarter" />
            </div>
            <button className="btn btn-primary">Save payment</button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
