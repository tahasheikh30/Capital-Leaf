"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DashboardGoals from "@/components/DashboardGoals";
import DayStrip from "@/components/DayStrip";
import { api, peek } from "@/lib/api";
import { money, monthKey, monthLabel } from "@/lib/format";
import type { DashboardData, Profile, Transaction } from "@/lib/types";

const chartFallback = () => <div className="skeleton skeleton-chart" aria-hidden="true" />;
const MonthlyChart = dynamic(() => import("@/components/DashboardCharts").then((m) => m.MonthlyChart), { ssr: false, loading: chartFallback });
const CategoryChart = dynamic(() => import("@/components/DashboardCharts").then((m) => m.CategoryChart), { ssr: false, loading: chartFallback });

function greeting(name: string | null) {
  const h = new Date().getHours();
  const part = h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name.split(" ")[0]}` : part;
}

export default function DashboardPage() {
  const month = monthKey(new Date());
  const path = `/dashboard?month=${month}`;
  const txPath = `/transactions?month=${month}`;
  // Show the last answer straight away if there is one, then refresh it in the background.
  const [data, setData] = useState<DashboardData | null>(() => peek<DashboardData>(path) ?? null);
  const [txs, setTxs] = useState<Transaction[]>(() => peek<Transaction[]>(txPath) ?? []);
  const [profile, setProfile] = useState<Profile | null>(() => peek<Profile>("/profile") ?? null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<DashboardData>(path).then(setData).catch((e) => setError(e.message));
    api<Transaction[]>(txPath).then(setTxs).catch(() => {});
    api<Profile>("/profile").then(setProfile).catch(() => {});
  }, [path, txPath]);

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const todayN = now.getDate();
  const daysLeft = daysInMonth - todayN + 1;

  const spendByDay = useMemo(() => {
    const out = Array<number>(daysInMonth).fill(0);
    for (const t of txs) if (t.type === "expense") out[Number(t.occurred_on.slice(8, 10)) - 1] += Number(t.amount);
    return out;
  }, [txs, daysInMonth]);

  if (error) return <div className="error">{error}</div>;
  if (!data)
    return (
      <div aria-busy="true" aria-label="Loading your dashboard">
        <div className="skeleton skeleton-hero" />
        <div className="grid grid-2 mb-16">
          <div className="skeleton skeleton-chart" />
          <div className="skeleton skeleton-chart" />
        </div>
      </div>
    );

  const monthly = data.monthly.map((m) => ({ month: monthLabel(m.month), Income: m.income, Spent: m.spent }));
  const budgetable = data.income - data.setAside - (data.taxSetAside ?? 0);
  const hasIncome = data.income > 0;
  const plan = hasIncome && budgetable > 0 ? budgetable / daysInMonth : null;
  const left = data.leftToSpend;
  const perDay = left > 0 ? left / daysLeft : 0;

  return (
    <>
      <div className="page-head">
        <h1>{greeting(profile?.full_name ?? null)}</h1>
        <span className="muted">{now.toLocaleDateString("en", { month: "long", year: "numeric" })}</span>
      </div>

      <section className="hero-plate" aria-label="This month">
        <div className="hero-top">
          <div>
            {hasIncome ? (
              <>
                <p className="hero-kicker">{left >= 0 ? "Left to spend this month" : "Over this month's income by"}</p>
                <p className={`hero-figure ${left < 0 ? "over" : ""}`}>{money(Math.abs(left))}</p>
                <p className="hero-line">
                  {left > 0
                    ? `That is about ${money(perDay)} a day for the ${daysLeft} day${daysLeft === 1 ? "" : "s"} left.`
                    : left === 0
                      ? "Every rupee of this month's income is spoken for."
                      : "Spending is ahead of what came in. Pause the extras until more arrives."}
                </p>
              </>
            ) : (
              <>
                <p className="hero-kicker">Spent so far this month</p>
                <p className="hero-figure">{money(data.spent)}</p>
                <p className="hero-line">
                  No income recorded yet. <Link href="/transactions">Add what you earned</Link> to see what is left to spend.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="hero-strip">
          <DayStrip daysInMonth={daysInMonth} today={todayN} spendByDay={spendByDay} plan={plan} />
          <p className="hero-legend">
            <span className="lg lg-ok" /> within plan <span className="lg lg-over" /> over plan
            {plan != null && <span className="lg-note"> Dashed line is {money(plan)} a day.</span>}
          </p>
        </div>

        <dl className="hero-stats">
          <div>
            <dt>Earned</dt>
            <dd>{money(data.income)}</dd>
          </div>
          <div>
            <dt>Spent</dt>
            <dd>{money(data.spent)}</dd>
          </div>
          <div>
            <dt>Set aside</dt>
            <dd>{money(data.setAside)}</dd>
          </div>
          {data.taxSetAside ? (
            <div>
              <dt>For tax</dt>
              <dd>{money(data.taxSetAside)}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <DashboardGoals />

      <div className="split">
        <section className="sec">
          <h2 className="sec-title">Earned and spent, six months</h2>
          <div className="chart-box">
            <MonthlyChart data={monthly} />
          </div>
        </section>

        <section className="sec">
          <h2 className="sec-title">Where this month went</h2>
          {data.byCategory.length === 0 ? (
            <p className="empty">Nothing spent yet this month. Press the plus button when you do.</p>
          ) : (
            <div className="chart-box">
              <CategoryChart data={data.byCategory} />
            </div>
          )}
        </section>
      </div>

      <div className="split">
        <section className="sec">
          <div className="sec-head">
            <h2 className="sec-title">Latest</h2>
            <Link href="/transactions" className="sec-link">
              All transactions
            </Link>
          </div>
          {data.recent.length === 0 ? (
            <p className="empty">Your first transaction will show up here.</p>
          ) : (
            <ul className="ledger">
              {data.recent.map((t) => (
                <li key={t.id}>
                  <span className="ledger-main">
                    {t.note || (t.type === "income" ? "Income" : "Expense")}
                    <span className="ledger-sub">{new Date(t.occurred_on + "T00:00:00").toLocaleDateString("en", { day: "numeric", month: "short" })}</span>
                  </span>
                  <span className={`ledger-amt ${t.type === "income" ? "pos" : ""}`}>
                    {t.type === "income" ? "+" : "-"}
                    {money(Number(t.amount))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="sec">
          <h2 className="sec-title">Income this month</h2>
          {data.bySource.length === 0 ? (
            <p className="empty">No income recorded yet this month.</p>
          ) : (
            <ul className="ledger">
              {data.bySource.map((s) => (
                <li key={s.name}>
                  <span className="ledger-main">{s.name}</span>
                  <span className="ledger-amt pos">{money(s.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
