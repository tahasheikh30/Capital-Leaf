"use client";

import { useEffect, useMemo, useState } from "react";
import PersonalOnly from "@/components/PersonalOnly";
import { api, peek } from "@/lib/api";
import { money } from "@/lib/format";
import { NISAB_GOLD_GRAMS, NISAB_SILVER_GRAMS, zakat, type NisabBasis } from "@/lib/zakat";
import type { NetWorth } from "@/lib/types";

const ROWS = [
  { key: "cash", label: "Cash and bank" },
  { key: "gold", label: "Gold" },
  { key: "stocks", label: "PSX stocks" },
  { key: "mutualFunds", label: "Mutual funds" },
  { key: "certificates", label: "Savings certificates" },
  { key: "other", label: "Other assets" },
] as const;
type Key = (typeof ROWS)[number]["key"];

export default function ZakatPage() {
  return (
    <PersonalOnly>
      <ZakatView />
    </PersonalOnly>
  );
}

function ZakatView() {
  const [nw, setNw] = useState<NetWorth | null>(() => peek<NetWorth>("/net-worth") ?? null);
  const [error, setError] = useState("");
  const [values, setValues] = useState<Record<Key, string>>({ cash: "", gold: "", stocks: "", mutualFunds: "", certificates: "", other: "" });
  const [debts, setDebts] = useState("");
  const [basis, setBasis] = useState<NisabBasis>("gold");
  const [goldPrice, setGoldPrice] = useState("");
  const [silverPrice, setSilverPrice] = useState("");

  function fill(n: NetWorth) {
    const v = {} as Record<Key, string>;
    for (const r of ROWS) v[r.key] = String(Math.round(n.classes[r.key] ?? 0));
    setValues(v);
    setDebts(String(Math.round(n.classes.liabilities ?? 0)));
    if (n.goldRate) setGoldPrice(String(Math.round(n.goldRate.perGram24k ?? n.goldRate.perTola24k / 11.664)));
  }

  useEffect(() => {
    api<NetWorth>("/net-worth")
      .then((n) => {
        setNw(n);
        fill(n);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const result = useMemo(
    () => zakat({ assets: ROWS.map((r) => Number(values[r.key]) || 0), deductions: Number(debts) || 0, basis, pricePerGram: Number(basis === "gold" ? goldPrice : silverPrice) || 0 }),
    [values, debts, basis, goldPrice, silverPrice]
  );

  return (
    <>
      <div className="page-head">
        <h1>Zakat</h1>
      </div>
      {error && <p className="error">{error}</p>}
      {!nw && !error ? (
        <div className="skeleton skeleton-row" aria-hidden="true" />
      ) : (
        <>
          <p className="muted">Filled in from your net worth. Change any amount to match what you have held for a full lunar year.</p>
          <div className="card">
            <h2 className="sec-title">What you own</h2>
            {ROWS.map((r) => (
              <div className="field" key={r.key}>
                <label htmlFor={`z-${r.key}`}>{r.label}</label>
                <input id={`z-${r.key}`} type="number" min="0" step="1" value={values[r.key]} onChange={(e) => setValues({ ...values, [r.key]: e.target.value })} />
              </div>
            ))}
            <div className="field">
              <label htmlFor="z-debts">Debts to subtract</label>
              <input id="z-debts" type="number" min="0" step="1" value={debts} onChange={(e) => setDebts(e.target.value)} />
            </div>
          </div>

          <div className="card mt-14">
            <h2 className="sec-title">Nisab</h2>
            <div className="field">
              <label htmlFor="z-basis">Measure the nisab by</label>
              <select id="z-basis" value={basis} onChange={(e) => setBasis(e.target.value as NisabBasis)}>
                <option value="gold">Gold ({NISAB_GOLD_GRAMS} g)</option>
                <option value="silver">Silver ({NISAB_SILVER_GRAMS} g)</option>
              </select>
            </div>
            {basis === "gold" ? (
              <div className="field">
                <label htmlFor="z-goldprice">24k gold price per gram</label>
                <input id="z-goldprice" type="number" min="0" step="1" value={goldPrice} onChange={(e) => setGoldPrice(e.target.value)} />
              </div>
            ) : (
              <div className="field">
                <label htmlFor="z-silver">Silver price per gram</label>
                <input id="z-silver" type="number" min="0" step="0.01" value={silverPrice} onChange={(e) => setSilverPrice(e.target.value)} />
              </div>
            )}
          </div>

          <section className="sec">
            <h2 className="sec-title">Your zakat</h2>
            <div className="card" data-testid="zakat-result">
              <p>
                Zakatable wealth <strong>{money(result.net)}</strong>
                {result.gross !== result.net && <span className="muted"> ({money(result.gross)} less debts)</span>}
              </p>
              {result.nisab === null ? (
                <p className="muted">Enter the {basis} price to see the nisab.</p>
              ) : (
                <p>
                  Nisab <strong>{money(result.nisab)}</strong>
                </p>
              )}
              {result.nisab !== null && (result.due ? (
                <p className="hero-figure">{money(result.zakat)}</p>
              ) : (
                <p>Your wealth is below the nisab, so no zakat is due.</p>
              ))}
              {result.due && <p className="muted fs-sm">That is 2.5% of {money(result.net)}.</p>}
            </div>
            <p className="muted fs-sm mt-14">
              This is a guide, not a ruling. Scholars differ on jewellery, debts and shares, so check with someone you trust. Wealth must also have been held for one lunar year.
            </p>
          </section>
        </>
      )}
    </>
  );
}
