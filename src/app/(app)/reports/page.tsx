"use client";

import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Meter from "@/components/Meter";
import { SettingRow, Switch } from "@/components/settings/controls";
import { useToast } from "@/components/Toast";
import { api, downloadFile } from "@/lib/api";
import { money, monthKey, shortDate } from "@/lib/format";
import type { Features, MonthlyReport, Profile } from "@/lib/types";

const shift = (key: string, by: number) => {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + by, 1));
};
const longMonth = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en", { month: "long", year: "numeric" });
};
const pctText = (p: number | null) => (p === null ? "new" : `${p > 0 ? "+" : ""}${p}%`);

// "Up 30%" for spending is bad news and down is good, so the colours are the other way round to income.
function Change({ pct, goodWhen }: { pct: number | null; goodWhen: "down" | "up" }) {
  if (pct === null) return <span className="muted">new</span>;
  if (pct === 0) return <span className="muted">no change</span>;
  const good = goodWhen === "down" ? pct < 0 : pct > 0;
  return <span className={good ? "pos" : "neg"}>{pctText(pct)}</span>;
}

export default function ReportsPage() {
  const toast = useToast();
  const thisMonth = monthKey(new Date());
  const [month, setMonth] = useState(thisMonth);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [error, setError] = useState("");
  const [features, setFeatures] = useState<Features | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setReport(await api<MonthlyReport>(`/reports/monthly?month=${month}`));
    } catch (e) {
      setReport(null);
      setError((e as Error).message);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<Features>("/features").then(setFeatures).catch(() => {});
    api<Profile>("/profile").then(setProfile).catch(() => {});
  }, []);

  async function pdf() {
    setBusy(true);
    try {
      await downloadFile(`/reports/monthly.pdf?month=${month}`, `coinleaf-report-${month}.pdf`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setEmail(on: boolean) {
    try {
      setProfile(await api<Profile>("/profile", { method: "PATCH", body: { monthly_report_email: on } }));
      toast.success(on ? "You will get the report by email on the 1st" : "Monthly email off");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const t = report?.totals;
  const top = Math.max(1, ...(report?.categories ?? []).flatMap((c) => [c.current, c.previous]));

  return (
    <>
      <div className="page-head">
        <h1>Reports</h1>
        <div className="flex-gap report-nav">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setMonth(shift(month, -1))} aria-label="Previous month">
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <strong className="report-month" aria-live="polite">{longMonth(month)}</strong>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setMonth(shift(month, 1))} disabled={month >= thisMonth} aria-label="Next month">
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-accent btn-small" onClick={pdf} disabled={busy || !report}>
            <Download size={15} aria-hidden="true" /> {busy ? "Preparing..." : "Download PDF"}
          </button>
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!report && !error && <p className="muted">Loading...</p>}

      {report && t && (
        <>
          {report.partial && <p className="muted fs-sm">This month is not over yet, so it is compared with a full month.</p>}
          <div className="grid grid-3 mb-16">
            <div className="card">
              <div className="stat-label">Earned</div>
              <div className="stat-value pos">{money(t.income)}</div>
              <p className="report-vs">Last month {money(t.previousIncome)}</p>
            </div>
            <div className="card">
              <div className="stat-label">Spent</div>
              <div className="stat-value">{money(t.spent)}</div>
              <p className="report-vs">
                Last month {money(t.previousSpent)} <Change pct={t.spentChangePct} goodWhen="down" />
              </p>
            </div>
            <div className="card">
              <div className="stat-label">Left over</div>
              <div className={`stat-value ${t.net < 0 ? "neg" : "pos"}`}>{money(t.net)}</div>
              <p className="report-vs">{t.savingsRate !== null ? `${t.savingsRate}% of what you earned` : "No income recorded"}</p>
            </div>
          </div>

          <section className="sec">
            <h2 className="sec-title">Spending by category</h2>
            <p className="report-key">The upper bar is {longMonth(report.month)}, the lower bar is {longMonth(report.previous)}. Both use the same scale.</p>
            {report.categories.length === 0 ? (
              <p className="empty">No spending in {longMonth(report.month)} or {longMonth(report.previous)}.</p>
            ) : (
              <div className="card table-wrap">
                <table className="table table-stack report-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th className="text-right">{longMonth(report.month)}</th>
                      <th className="text-right">{longMonth(report.previous)}</th>
                      <th className="text-right">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.categories.map((c) => (
                      <tr key={c.name}>
                        <td data-label="Category">
                          <span className="report-cat">{c.name}</span>
                          <Meter value={(c.current / top) * 100} tone={c.change > 0 ? "warn" : "good"} label={`${c.name} this month`} />
                          <Meter value={(c.previous / top) * 100} tone="good" label={`${c.name} last month`} />
                        </td>
                        <td data-label={longMonth(report.month)} className="text-right">{money(c.current)}</td>
                        <td data-label={longMonth(report.previous)} className="text-right">{money(c.previous)}</td>
                        <td data-label="Change" className="text-right"><Change pct={c.changePct} goodWhen="down" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {report.biggest.length > 0 && (
            <section className="sec">
              <h2 className="sec-title">Biggest expenses</h2>
              <ul className="ledger">
                {report.biggest.map((b, i) => (
                  <li key={i}>
                    <span className="ledger-main">
                      {b.note || b.category}
                      <span className="ledger-sub">{shortDate(b.date)}, {b.category}</span>
                    </span>
                    <span className="ledger-amt">{money(b.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {features?.email && profile && (
        <section className="sec">
          <h2 className="sec-title">Email</h2>
          <SettingRow title="Email me the report on the 1st" description="Last month, with the PDF attached. Your personal space only.">
            <Switch label="Email me the monthly report" checked={!!profile.monthly_report_email} onChange={setEmail} />
          </SettingRow>
        </section>
      )}
    </>
  );
}
