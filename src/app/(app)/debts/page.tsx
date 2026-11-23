"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PersonalOnly from "@/components/PersonalOnly";
import { api, peek } from "@/lib/api";
import { DEFAULT_MIN_SHARE, addMonths, coversInterest, minimumsOnly, monthsLabel, plan, toDebts, type Strategy } from "@/lib/debt";
import { longDate, money, today } from "@/lib/format";
import type { Asset } from "@/lib/types";

export default function DebtsPage() {
  return (
    <PersonalOnly>
      <DebtsView />
    </PersonalOnly>
  );
}

function DebtsView() {
  const [assets, setAssets] = useState<Asset[] | null>(() => peek<Asset[]>("/assets") ?? null);
  const [error, setError] = useState("");
  const [extra, setExtra] = useState("0");
  const [strategy, setStrategy] = useState<Strategy>("avalanche");

  useEffect(() => {
    api<Asset[]>("/assets").then(setAssets).catch((e) => setError((e as Error).message));
  }, []);

  const debts = useMemo(() => toDebts(assets ?? []), [assets]);
  const extraNum = Math.max(0, Number(extra) || 0);
  const baseline = useMemo(() => minimumsOnly(debts), [debts]);
  const chosen = useMemo(() => plan(debts, extraNum, strategy), [debts, extraNum, strategy]);
  const other = useMemo(() => plan(debts, extraNum, strategy === "avalanche" ? "snowball" : "avalanche"), [debts, extraNum, strategy]);
  // Things the plan had to guess, so the person can fix them for a real answer.
  const owed = (assets ?? []).filter((a) => a.kind === "liability" && Number(a.amount) > 0);
  const noRate = owed.filter((a) => !(Number(a.annual_rate) > 0)).map((a) => a.name);
  const noMin = owed.filter((a) => !(Number(a.min_payment) > 0)).map((a) => a.name);
  const stuck = debts.filter((d) => !coversInterest(d) && d.rate > 0);
  const saved = baseline.paidOff && chosen.paidOff ? Math.max(0, baseline.totalInterest - chosen.totalInterest) : 0;
  const monthlyBudget = debts.reduce((s, d) => s + d.minPayment, 0) + extraNum;

  return (
    <>
      <div className="page-head">
        <h1>Debt payoff</h1>
      </div>
      {error && <p className="error">{error}</p>}
      {assets === null ? (
        <div className="skeleton skeleton-row" aria-hidden="true" />
      ) : debts.length === 0 ? (
        <p className="empty">
          No debts to plan. Add a loan or card balance under <Link href="/net-worth">Net worth</Link> as a debt or loan, with its interest rate and minimum payment.
        </p>
      ) : (
        <>
          <div className="card">
            <div className="field">
              <label htmlFor="extra">Extra you can pay each month</label>
              <input id="extra" type="number" min="0" step="1" value={extra} onChange={(e) => setExtra(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="strategy">Which debt to attack first</label>
              <select id="strategy" value={strategy} onChange={(e) => setStrategy(e.target.value as Strategy)}>
                <option value="avalanche">Highest interest first (pays least interest)</option>
                <option value="snowball">Smallest balance first (quick wins)</option>
              </select>
            </div>
            <p className="muted fs-sm">You pay {money(monthlyBudget)} a month in total. When a debt is cleared, its payment moves to the next one.</p>
          </div>

          {stuck.length > 0 && (
            <p className="error" role="alert">
              The minimum payment on {stuck.map((d) => d.name).join(", ")} does not cover its monthly interest, so the balance never shrinks unless you pay extra.
            </p>
          )}

          {(noRate.length > 0 || noMin.length > 0) && (
            <div className="card debt-assume" role="note">
              <strong>This is a rough estimate.</strong>
              {noRate.length > 0 && <p>No interest rate is set for {noRate.join(", ")}, so it is counted as 0% interest. That is why interest can show as Rs 0.</p>}
              {noMin.length > 0 && <p>No minimum payment is set for {noMin.join(", ")}, so we assume {Math.round(DEFAULT_MIN_SHARE * 100)}% of its balance each month.</p>}
              <p className="muted fs-sm">Add the real numbers under <Link href="/net-worth">Net worth</Link> (edit the debt) for a plan you can rely on.</p>
            </div>
          )}

          <section className="sec sec-spaced">
            <h2 className="sec-title">Your plan</h2>
            {chosen.paidOff ? (
              <div className="card" data-testid="summary">
                <p>
                  Debt free in <strong>{monthsLabel(chosen.months)}</strong>, around {longDate(addMonths(today(), chosen.months))}.
                </p>
                <p>
                  Total interest <strong>{money(chosen.totalInterest)}</strong>.
                  {baseline.paidOff && saved > 0 && <> That is {money(saved)} less than paying only the minimums.</>}
                </p>
                {baseline.paidOff ? (
                  <p className="muted fs-sm">Minimums only: {monthsLabel(baseline.months)} and {money(baseline.totalInterest)} interest.</p>
                ) : (
                  <p className="muted fs-sm">With minimums only, you would not be debt free within 50 years.</p>
                )}
                {other.paidOff && other.totalInterest !== chosen.totalInterest && (
                  <p className="muted fs-sm">
                    {strategy === "avalanche" ? "Smallest balance first" : "Highest interest first"} would cost {money(other.totalInterest)} in interest and take {monthsLabel(other.months)}.
                  </p>
                )}
              </div>
            ) : (
              <p className="error" role="alert">
                These payments will not clear your debts within 50 years. Add an extra monthly amount above.
              </p>
            )}
          </section>

          <details className="card debt-how">
            <summary>How is this worked out?</summary>
            <p>
              It is a simulation of what you would pay, month by month, using the balance, yearly interest rate and minimum payment saved for each debt. It does not know your future income, so it only holds if you really pay this amount every month.
            </p>
            <ol>
              <li>Each month, interest is added to every debt: balance × yearly rate ÷ 12.</li>
              <li>Every debt gets its minimum payment. Your total monthly payment is the minimums plus your extra amount.</li>
              <li>Whatever is left after the minimums goes to the first debt in your chosen order (highest rate, or smallest balance).</li>
              <li>When a debt reaches zero, its payment moves to the next one, so the total you pay each month stays the same.</li>
              <li>This repeats until everything is paid. The month it ends is the debt free date.</li>
            </ol>
            <p className="muted fs-sm">
              Assumes rates stay fixed, you add no new borrowing, and every payment is on time. Real lenders can differ a little in how they round interest or count days. Stops after 50 years.
            </p>
          </details>

          <section className="sec">
            <h2 className="sec-title">Order of payoff</h2>
            <ul className="ledger">
              {chosen.debts
                .slice()
                .sort((a, b) => (a.paidOffMonth ?? Infinity) - (b.paidOffMonth ?? Infinity))
                .map((d) => {
                  const src = debts.find((x) => x.id === d.id)!;
                  return (
                    <li key={d.id}>
                      <span className="ledger-main">
                        {d.name}
                        <span className="ledger-sub">
                          {money(src.balance)} at {src.rate}% a year, minimum {money(src.minPayment)}
                        </span>
                      </span>
                      <span className="ledger-end">
                        <span className="ledger-amt">{d.paidOffMonth ? `Cleared in ${monthsLabel(d.paidOffMonth)}` : "Not cleared"}</span>
                      </span>
                    </li>
                  );
                })}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
