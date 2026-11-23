"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BellOff, CircleAlert, CircleCheck, Info, Settings, TrendingUp } from "lucide-react";
import { useNotifications, type Note } from "@/components/Toast";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { BudgetNotice, PriceAlert } from "@/lib/types";

const ICON = { success: CircleCheck, error: CircleAlert, info: Info } as const;

function ago(at: number) {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const WHERE: Record<string, string> = { "/stocks": "Open Stocks", "/household": "Open Household", "/budget": "Open Budget" };

export default function NotificationsPage() {
  const { notes, markAllRead, clearAll } = useNotifications();
  const [alerts, setAlerts] = useState<PriceAlert[] | null>(null);
  const [limits, setLimits] = useState<BudgetNotice[] | null>(null);

  // Remember what was new when the page opened, so those rows stay highlighted after being marked read.
  const fresh = useRef<Set<number> | null>(null);
  if (fresh.current === null) fresh.current = new Set(notes.filter((n) => !n.read).map((n) => n.id));
  useEffect(() => markAllRead(), [notes, markAllRead]);

  useEffect(() => {
    api<PriceAlert[]>("/alerts")
      .then((a) => setAlerts(a.filter((x) => x.triggered_at).sort((p, q) => (q.triggered_at ?? "").localeCompare(p.triggered_at ?? "")).slice(0, 10)))
      .catch(() => setAlerts([]));
  }, []);

  useEffect(() => {
    api<BudgetNotice[]>("/category-budgets/notices")
      .then(setLimits)
      .catch(() => setLimits([]));
  }, []);

  return (
    <>
      <div className="page-head">
        <h1>Notifications</h1>
        <div className="flex-gap">
          <Link href="/settings#notifications" className="btn btn-ghost btn-small">
            <Settings size={15} aria-hidden="true" /> Settings
          </Link>
          {notes.length > 0 && (
            <button type="button" className="btn btn-ghost btn-small" onClick={clearAll}>
              Clear list
            </button>
          )}
        </div>
      </div>

      <section className="sec">
        <h2 className="sec-title">This session</h2>
        <p className="muted mt-0">Messages from this browser tab. They stay until you close the tab or clear the list.</p>
        {notes.length === 0 ? (
          <div className="note-empty">
            <BellOff size={28} aria-hidden="true" />
            <p className="note-empty-title">You are all caught up</p>
            <p className="muted">Saves, price alerts and household updates will show up here.</p>
          </div>
        ) : (
          <ul className="notes">
            {notes.map((n: Note) => {
              const Icon = n.category === "alerts" && n.kind !== "error" ? TrendingUp : ICON[n.kind];
              return (
                <li key={n.id} className={`note note-${n.kind} ${fresh.current?.has(n.id) ? "note-new" : ""}`}>
                  <span className="note-icon"><Icon size={18} aria-hidden="true" /></span>
                  <div className="note-body">
                    <p className="note-text">{n.message}</p>
                    <p className="note-time">{ago(n.at)}</p>
                  </div>
                  {n.href && WHERE[n.href] && (
                    <Link href={n.href} className="btn btn-ghost btn-small">{WHERE[n.href]}</Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="sec">
        <h2 className="sec-title">Category limits</h2>
        <p className="muted mt-0">Warnings when a category reaches 80 percent and 100 percent of its monthly limit. Kept on your account.</p>
        {limits === null ? (
          <p className="muted">Loading...</p>
        ) : limits.length === 0 ? (
          <p className="empty">No warnings yet. Set limits on the Budget page.</p>
        ) : (
          <ul className="ledger">
            {limits.map((n) => (
              <li key={`${n.budget_id}-${n.month}-${n.level}`}>
                <span className="ledger-main">
                  {n.category_name ?? "A category"} {n.level === 100 ? "reached its limit" : "passed 80 percent of its limit"}
                  <span className="ledger-sub">{new Date(n.created_at).toLocaleString()} for {n.month}</span>
                </span>
                <span className="ledger-amt">{money(n.spent)}{n.limit ? ` of ${money(n.limit)}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/budget" className="sec-link">Manage limits</Link>
      </section>

      <section className="sec">
        <h2 className="sec-title">Price alerts reached</h2>
        <p className="muted mt-0">Kept on your account, so you see them on any device. Each alert fires once until you re-arm it.</p>
        {alerts === null ? (
          <p className="muted">Loading...</p>
        ) : alerts.length === 0 ? (
          <p className="empty">None yet. Set one under Stocks and we will tell you when a price is reached.</p>
        ) : (
          <ul className="ledger">
            {alerts.map((a) => (
              <li key={a.id}>
                <span className="ledger-main">
                  {a.symbol} {a.direction === "above" ? "went above" : "fell below"} {a.target}
                  <span className="ledger-sub">{a.triggered_at ? new Date(a.triggered_at).toLocaleString() : ""}{a.active ? ", armed again" : ""}</span>
                </span>
                <span className="ledger-amt">{a.triggered_price != null ? a.triggered_price : ""}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/stocks" className="sec-link">Manage alerts</Link>
      </section>
    </>
  );
}
