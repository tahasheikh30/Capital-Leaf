"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
        <div className="card">
          <h2>Built for irregular income</h2>
          <p className="muted mt-0">
            Freelancer mode sets aside a share of every payment for tax, shows what you can safely spend each month based on your average, and tells you how many months your cash would last in a quiet spell.
          </p>
          <button className="btn btn-primary" onClick={enable}>
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
        <Link href="/settings" className="btn btn-ghost">
          Change {d.taxPct}% rate
        </Link>
      </div>

      <div className="grid grid-4 mb-16">
        <div className="card">
          <div className="stat-label">Average monthly income</div>
          <div className="stat-value">{s.averageIncome != null ? money(s.averageIncome) : "-"}</div>
        </div>
        <div className="card">
          <div className="stat-label">Safe monthly budget</div>
          <div className="stat-value pos">{s.safeMonthlyBudget != null ? money(s.safeMonthlyBudget) : "-"}</div>
        </div>
        <div className="card">
          <div className="stat-label">Cash runway</div>
          <div className="stat-value">{s.runwayMonths != null ? `${s.runwayMonths} months` : "-"}</div>
        </div>
        <div className="card">
          <div className="stat-label">Income swing</div>
          <div className="stat-value">{s.swing != null ? `${Math.round(s.swing * 100)}%` : "-"}</div>
          <div className="muted fs-sm">gap between best and slowest month, as a share of your average</div>
        </div>
      </div>
      {!s.enoughHistory && <p className="muted mb-16">Averages need at least three completed months of records. Keep logging income and they will appear.</p>}

      <div className="grid grid-2 mb-16">
        <div className="card">
          <h2>Tax jar, since {d.tax.financialYearStart}</h2>
          <div className="bar-head">
            <span>Income this financial year</span>
            <strong>{money(d.tax.incomeThisYear)}</strong>
          </div>
          <div className="bar-head">
            <span>To set aside at {d.taxPct}%</span>
            <strong>{money(d.tax.setAsideTarget)}</strong>
          </div>
          <div className="bar-head">
            <span>Already paid to FBR</span>
            <strong>{money(d.tax.paid)}</strong>
          </div>
          <Meter value={heldPct} label="Tax paid" />
          <div className="bar-head mt-14">
            <span>Should still be sitting aside</span>
            <strong className={d.tax.stillToHold > 0 ? "neg" : "pos"}>{money(Math.max(0, d.tax.stillToHold))}</strong>
          </div>
          <p className="muted fs-sm">This is a planning guide using your chosen rate, not a tax calculation. Check actual rates with FBR or an adviser.</p>
        </div>

        <div className="card">
          <h2>This month</h2>
          <div className="bar-head">
            <span>Earned so far</span>
            <strong>{money(s.thisMonth.income)}</strong>
          </div>
          <div className="bar-head">
            <span>Set aside for tax</span>
            <strong>{money(s.thisMonth.taxSetAside)}</strong>
          </div>
          <div className="bar-head">
            <span>Spent</span>
            <strong>{money(s.thisMonth.spent)}</strong>
          </div>
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
        </div>
      </div>

      <div className="card mb-16">
        <h2>Income and spending, last months</h2>
        <div className="chart-box">
          <IncomeSwingChart data={chart} />
        </div>
      </div>

      <form className="card mb-16" onSubmit={addPayment}>
        <h2>Record a tax payment</h2>
        <div className="row">
          <div className="field">
            <label>Date</label>
            <input type="date" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
          <div className="field">
            <label>Amount</label>
            <input type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field">
            <label>Note</label>
            <input maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Advance tax, 1st quarter" />
          </div>
          <button className="btn btn-primary">Add</button>
        </div>
      </form>

      <div className="card table-wrap">
        <h2>Payments</h2>
        {d.payments.length === 0 ? (
          <p className="muted">No tax payments recorded yet.</p>
        ) : (
          <table className="table table-stack">
            <tbody>
              {d.payments.map((p) => (
                <tr key={p.id}>
                  <td data-label="Date">{p.paid_on}</td>
                  <td data-label="Note">{p.note ?? ""}</td>
                  <td data-label="Amount" className="text-right">{money(p.amount)}</td>
                  <td className="text-right cell-actions">
                    <button className="btn btn-danger" onClick={() => removePayment(p.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
