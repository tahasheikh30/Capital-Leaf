"use client";

import Sheet from "@/components/Sheet";
import { Plus } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import Meter from "@/components/Meter";
import PersonalOnly from "@/components/PersonalOnly";
import { useToast } from "@/components/Toast";
import { api, peek } from "@/lib/api";
import { money, today } from "@/lib/format";
import type { Asset, AssetKind, NetWorth } from "@/lib/types";

const TrendChart = dynamic(() => import("@/components/DashboardCharts").then((m) => m.TrendChart), {
  ssr: false,
  loading: () => <div className="skeleton skeleton-chart" aria-hidden="true" />,
});

const KIND_LABEL: Record<AssetKind, string> = { cash: "Cash and bank", gold: "Gold", certificate: "Savings certificate", mutual_fund: "Mutual fund", other: "Other asset", liability: "Debt or loan" };
const CLASS_ROWS: { key: keyof NetWorth["classes"]; label: string }[] = [
  { key: "cash", label: "Cash and bank" },
  { key: "stocks", label: "PSX stocks" },
  { key: "gold", label: "Gold" },
  { key: "certificates", label: "Savings certificates" },
  { key: "mutualFunds", label: "Mutual funds" },
  { key: "other", label: "Other assets" },
];

export default function NetWorthPage() {
  return (
    <PersonalOnly>
      <NetWorthView />
    </PersonalOnly>
  );
}

function NetWorthView() {
  const toast = useToast();
  const [nw, setNw] = useState<NetWorth | null>(() => peek<NetWorth>("/net-worth") ?? null);
  const [assets, setAssets] = useState<Asset[]>(() => peek<Asset[]>("/assets") ?? []);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [kind, setKind] = useState<AssetKind>("cash");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [grams, setGrams] = useState("");
  const [karat, setKarat] = useState("22");
  const [rate, setRate] = useState("");
  const [annual, setAnnual] = useState("");
  const [start, setStart] = useState(today());
  const [maturity, setMaturity] = useState("");
  const [payout, setPayout] = useState<"at_maturity" | "periodic">("at_maturity");

  const load = useCallback(async () => {
    try {
      const [n, a] = await Promise.all([api<NetWorth>("/net-worth"), api<Asset[]>("/assets")]);
      setNw(n);
      setAssets(a);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function reset() {
    setFormOpen(false);
    setEditingId(null);
    setName("");
    setAmount("");
    setGrams("");
    setRate("");
    setAnnual("");
    setMaturity("");
    setStart(today());
    setPayout("at_maturity");
  }

  function startEdit(a: Asset) {
    setEditingId(a.id);
    setFormOpen(true);
    setKind(a.kind);
    setName(a.name);
    setAmount(a.amount != null ? String(a.amount) : "");
    setGrams(a.grams != null ? String(a.grams) : "");
    setKarat(a.karat != null ? String(a.karat) : "22");
    setRate(a.rate_per_tola != null ? String(a.rate_per_tola) : "");
    setAnnual(a.annual_rate != null ? String(a.annual_rate) : "");
    setStart(a.start_date ?? today());
    setMaturity(a.maturity_date ?? "");
    setPayout(a.payout ?? "at_maturity");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const body: Record<string, unknown> = { kind, name };
    if (kind === "gold") {
      body.grams = Number(grams);
      body.karat = Number(karat);
      body.rate_per_tola = rate ? Number(rate) : null;
    } else if (kind === "certificate") {
      body.amount = Number(amount);
      body.annual_rate = Number(annual);
      body.start_date = start;
      body.maturity_date = maturity || null;
      body.payout = payout;
    } else {
      body.amount = Number(amount);
    }
    try {
      if (editingId) {
        const { kind: _k, ...rest } = body;
        void _k;
        await api(`/assets/${editingId}`, { method: "PATCH", body: rest });
      } else {
        await api("/assets", { method: "POST", body });
      }
      toast.success(editingId ? "Updated" : "Added");
      reset();
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/assets/${id}`, { method: "DELETE" });
      toast.success("Deleted");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const gross = nw ? CLASS_ROWS.reduce((a, r) => a + nw.classes[r.key], 0) : 0;
  const trend = (nw?.history ?? []).map((h) => ({ label: h.day.slice(5), value: h.total }));
  const valueOf = (id: string) => nw?.lines.find((l) => l.id === id)?.value ?? null;

  return (
    <>
      <div className="page-head">
        <h1>Net worth</h1>
        <button className="btn btn-accent" onClick={() => { reset(); setFormOpen(true); }}>
          <Plus size={16} aria-hidden="true" /> Add
        </button>
        {nw?.goldRate && (
          <span className="muted fs-sm">
            Gold today: {money(nw.goldRate.perTola24k)} per tola (24k){nw.goldRate.stale ? ", last known rate" : ""}
          </span>
        )}
      </div>
      {error && <div className="error">{error}</div>}

      {nw && (
        <>
          <div className="hero-plate">
            <p className="hero-kicker">Everything you own, minus what you owe</p>
            <p className={`hero-figure ${nw.total < 0 ? "over" : ""}`}>{money(nw.total)}</p>
            {nw.change30 != null && (
              <p className="hero-line">
                {nw.change30 >= 0 ? "Up " : "Down "}
                {money(Math.abs(nw.change30))} in the last 30 days.
              </p>
            )}
            {nw.warnings.map((w) => (
              <p key={w} className="hero-warn">{w}</p>
            ))}
          </div>

          <div className="split">
            <section className="sec">
              <h2 className="sec-title">Where it sits</h2>
              {CLASS_ROWS.map((r) => (
                <div key={r.key} className="bar-row">
                  <div className="bar-head">
                    <span>{r.label}</span>
                    <span>{money(nw.classes[r.key])}</span>
                  </div>
                  <Meter value={gross > 0 ? (nw.classes[r.key] / gross) * 100 : 0} label={r.label} />
                </div>
              ))}
              {nw.classes.liabilities > 0 && (
                <div className="bar-row">
                  <div className="bar-head">
                    <span>Owed</span>
                    <span className="neg">-{money(nw.classes.liabilities)}</span>
                  </div>
                </div>
              )}
            </section>

            <section className="sec">
              <h2 className="sec-title">Over time</h2>
              {trend.length < 2 ? (
                <p className="empty">The trend appears after a couple of days of visits. A snapshot is saved each day.</p>
              ) : (
                <div className="chart-box">
                  <TrendChart data={trend} />
                </div>
              )}
            </section>
          </div>
        </>
      )}

      <Sheet open={formOpen} onClose={reset} title={editingId ? "Edit item" : "Add to your net worth"}>
<form className="sheet-form" onSubmit={save}>
        <p className="muted fs-sm mt-0">Cash in the bank, gold, savings certificates, mutual funds and debts. Your PSX stocks are included automatically from the Stocks page.</p>
        <div className="row">
          <div className="field">
            <label>Type</label>
            <select value={kind} disabled={!!editingId} onChange={(e) => setKind(e.target.value as AssetKind)}>
              {(Object.keys(KIND_LABEL) as AssetKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Name</label>
            <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "gold" ? "e.g. Wedding set" : kind === "certificate" ? "e.g. Behbood certificate" : kind === "mutual_fund" ? "e.g. Meezan Islamic Fund" : "e.g. Meezan savings"} />
          </div>
          {kind === "gold" ? (
            <>
              <div className="field">
                <label>Weight in grams</label>
                <input type="number" required min="0.001" step="any" value={grams} onChange={(e) => setGrams(e.target.value)} />
              </div>
              <div className="field">
                <label>Karat</label>
                <select value={karat} onChange={(e) => setKarat(e.target.value)}>
                  {[24, 22, 21, 18].map((k) => (
                    <option key={k} value={k}>
                      {k}k
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Your own 24k rate per tola (optional)</label>
                <input type="number" min="1" step="any" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Leave empty for the market rate" />
              </div>
            </>
          ) : (
            <div className="field">
              <label>{kind === "certificate" ? "Amount invested" : kind === "liability" ? "Amount owed" : kind === "mutual_fund" ? "Current value of your units" : "Value"}</label>
              <input type="number" required min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          )}
          {kind === "certificate" && (
            <>
              <div className="field">
                <label>Profit rate % per year</label>
                <input type="number" required min="0" max="100" step="0.01" value={annual} onChange={(e) => setAnnual(e.target.value)} />
              </div>
              <div className="field">
                <label>Started</label>
                <input type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="field">
                <label>Matures (optional)</label>
                <input type="date" value={maturity} min={start} onChange={(e) => setMaturity(e.target.value)} />
              </div>
              <div className="field">
                <label>Profit is paid</label>
                <select value={payout} onChange={(e) => setPayout(e.target.value as "at_maturity" | "periodic")}>
                  <option value="at_maturity">At the end (grows)</option>
                  <option value="periodic">Every month (principal stays)</option>
                </select>
              </div>
            </>
          )}
          <button className="btn btn-primary">{editingId ? "Save" : "Add"}</button>
          {editingId && (
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Cancel
            </button>
          )}
        </div>
      </form>
</Sheet>

      <section className="sec">
        <h2 className="sec-title">Your items</h2>
        {assets.length === 0 ? (
          <p className="empty">Nothing added yet. Start with the cash you hold.</p>
        ) : (
          <ul className="ledger">
            {assets.map((a) => {
              const v = valueOf(a.id);
              return (
                <li key={a.id}>
                  <span className="ledger-main">
                    {a.name}
                    <span className="ledger-sub">
                      {KIND_LABEL[a.kind]}
                      {a.kind === "gold" ? `, ${a.grams} g, ${a.karat}k${a.rate_per_tola ? ", your rate" : ""}` : ""}
                      {a.kind === "certificate" ? `, ${a.annual_rate}% a year` : ""}
                    </span>
                  </span>
                  <span className="ledger-end">
                    <span className={`ledger-amt ${a.kind === "liability" ? "neg" : ""}`}>{v != null ? `${a.kind === "liability" ? "-" : ""}${money(v)}` : "No price yet"}</span>
                    <button className="btn btn-ghost btn-small" onClick={() => startEdit(a)}>
                      Edit
                    </button>
                    <button className="btn btn-danger btn-small" onClick={() => remove(a.id)}>
                      Delete
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
