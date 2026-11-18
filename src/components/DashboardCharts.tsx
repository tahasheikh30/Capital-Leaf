"use client";

// Kept in its own file so the charting library (the biggest download in the app) loads only when
// the dashboard needs it, and never for the other pages.
import { Area, AreaChart, Bar, BarChart, Line, LineChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compact, money } from "@/lib/format";

export function MonthlyChart({ data }: { data: { month: string; Income: number; Spent: number }[] }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e6ede2" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} width={44} tickFormatter={compact} />
        <Tooltip formatter={(v) => money(Number(v))} />
        <Legend wrapperStyle={{ paddingTop: 14 }} />
        <Bar dataKey="Income" fill="#6f8f6a" radius={[6, 6, 0, 0]} />
        <Bar dataKey="Spent" fill="#e8573d" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryChart({ data }: { data: { name: string; color: string; value: number }[] }) {
  return (
    <ResponsiveContainer>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
          {data.map((c, i) => (
            <Cell key={i} fill={c.color} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => money(Number(v))} />
        <Legend wrapperStyle={{ paddingTop: 14 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function TrendChart({ data }: { data: { label: string; value: number }[] }) {
  return (
    <ResponsiveContainer>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e6ede2" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} minTickGap={24} />
        <YAxis tick={{ fontSize: 12 }} width={48} tickFormatter={compact} domain={["auto", "auto"]} />
        <Tooltip formatter={(v) => money(Number(v))} />
        <Area type="monotone" dataKey="value" name="Net worth" stroke="#5f7f63" fill="#cddac7" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function IncomeSwingChart({ data }: { data: { month: string; Income: number; Spent: number }[] }) {
  return (
    <ResponsiveContainer>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e6ede2" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} width={44} tickFormatter={compact} />
        <Tooltip formatter={(v) => money(Number(v))} />
        <Legend wrapperStyle={{ paddingTop: 14 }} />
        <Line type="monotone" dataKey="Income" stroke="#6f8f6a" strokeWidth={2} dot />
        <Line type="monotone" dataKey="Spent" stroke="#e8573d" strokeWidth={2} dot />
      </LineChart>
    </ResponsiveContainer>
  );
}
