"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { api, peek } from "@/lib/api";
import { money, monthKey, monthLabel } from "@/lib/format";
import type { DashboardData } from "@/lib/types";

const chartFallback = () => <div className="skeleton skeleton-chart" aria-hidden="true" />;
const MonthlyChart = dynamic(() => import("@/components/DashboardCharts").then((m) => m.MonthlyChart), { ssr: false, loading: chartFallback });
const CategoryChart = dynamic(() => import("@/components/DashboardCharts").then((m) => m.CategoryChart), { ssr: false, loading: chartFallback });

export default function DashboardPage() {
  const path = `/dashboard?month=${monthKey(new Date())}`;
  // Show the last answer straight away if there is one, then refresh it in the background.
  const [data, setData] = useState<DashboardData | null>(() => peek<DashboardData>(path) ?? null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<DashboardData>(path)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [path]);

  if (error) return <div className="error">{error}</div>;
  if (!data)
    return (
      <div aria-busy="true" aria-label="Loading your dashboard">
        <div className="skeleton skeleton-title" />
        <div className="grid grid-4 mb-16">
          {[0, 1, 2, 3].map((i) => (
            <div className="card" key={i}>
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-stat" />
            </div>
          ))}
        </div>
        <div className="grid grid-2">
          <div className="card"><div className="skeleton skeleton-chart" /></div>
          <div className="card"><div className="skeleton skeleton-chart" /></div>
        </div>
      </div>
    );

  const monthly = data.monthly.map((m) => ({ month: monthLabel(m.month), Income: m.income, Spent: m.spent }));

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <span className="muted">{new Date().toLocaleDateString("en", { month: "long", year: "numeric" })}</span>
      </div>

      <div className="grid grid-4 mb-16">
        <div className="card">
          <div className="stat-label">Earned</div>
          <div className="stat-value pos">{money(data.income)}</div>
        </div>
        <div className="card">
          <div className="stat-label">Spent</div>
          <div className="stat-value neg">{money(data.spent)}</div>
        </div>
        <div className="card">
          <div className="stat-label">Set aside</div>
          <div className="stat-value">{money(data.setAside)}</div>
        </div>
        <div className="card">
          <div className="stat-label">Left to spend{data.taxSetAside ? ` (after ${money(data.taxSetAside)} for tax)` : ""}</div>
          <div className={`stat-value ${data.leftToSpend < 0 ? "neg" : "pos"}`}>{money(data.leftToSpend)}</div>
        </div>
      </div>

      <div className="grid grid-2 mb-16">
        <div className="card">
          <h2>Earned vs spent, last 6 months</h2>
          <div className="chart-box">
            <MonthlyChart data={monthly} />
          </div>
        </div>

        <div className="card">
          <h2>Where it went this month</h2>
          {data.byCategory.length === 0 ? (
            <p className="muted">No spending recorded yet this month.</p>
          ) : (
            <div className="chart-box">
              <CategoryChart data={data.byCategory} />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Income by source this month</h2>
          {data.bySource.length === 0 ? (
            <p className="muted">No income recorded yet this month.</p>
          ) : (
            <table className="table">
              <tbody>
                {data.bySource.map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td className="pos text-right">
                      {money(s.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Recent activity</h2>
          {data.recent.length === 0 ? (
            <p className="muted">Add your first transaction to get started.</p>
          ) : (
            <table className="table">
              <tbody>
                {data.recent.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t.note || (t.type === "income" ? "Income" : "Expense")}
                      <div className="muted fs-sm">
                        {t.occurred_on}
                      </div>
                    </td>
                    <td className={`text-right ${t.type === "income" ? "pos" : "neg"}`}>
                      {t.type === "income" ? "+" : "-"}
                      {money(Number(t.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
