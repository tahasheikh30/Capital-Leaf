"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PersonalOnly from "@/components/PersonalOnly";
import { api, peek } from "@/lib/api";
import { addMonths, coversInterest, minimumsOnly, monthsLabel, plan, toDebts, type Strategy } from "@/lib/debt";
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

          <section className="sec">
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
