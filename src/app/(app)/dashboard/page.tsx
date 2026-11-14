"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { compact, money, monthKey, monthLabel } from "@/lib/format";
import type { DashboardData } from "@/lib/types";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<DashboardData>(`/dashboard?month=${monthKey(new Date())}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <p className="muted">Loading your dashboard...</p>;

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
          <div className="stat-label">Left to spend</div>
          <div className={`stat-value ${data.leftToSpend < 0 ? "neg" : "pos"}`}>{money(data.leftToSpend)}</div>
        </div>
      </div>

      <div className="grid grid-2 mb-16">
        <div className="card">
          <h2>Earned vs spent, last 6 months</h2>
          <div className="chart-box">
            <ResponsiveContainer>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6ede2" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={44} tickFormatter={compact} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Legend />
                <Bar dataKey="Income" fill="#6f8f6a" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Spent" fill="#e8573d" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2>Where it went this month</h2>
          {data.byCategory.length === 0 ? (
            <p className="muted">No spending recorded yet this month.</p>
          ) : (
            <div className="chart-box">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={data.byCategory} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                    {data.byCategory.map((c, i) => (
                      <Cell key={i} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
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
